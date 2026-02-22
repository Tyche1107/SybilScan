"""
Scoring service.
- Known addresses (in Blur T30 lookup): instant score from precomputed features.
- Unknown addresses: live Etherscan fetch → compute features → score.
"""

import os
import json
import asyncio
import numpy as np
import pandas as pd
import joblib

# ── model loading ──────────────────────────────────────────────────────────────
_BASE = os.path.dirname(os.path.abspath(__file__))
_MODEL_DIR = os.path.join(_BASE, "..", "models")
_DATA_DIR  = os.path.join(_BASE, "..", "data")

lgb_model    = joblib.load(os.path.join(_MODEL_DIR, "lgb_blur_t30.joblib"))
iso_model    = joblib.load(os.path.join(_MODEL_DIR, "iso_blur.joblib"))
feature_names = json.load(open(os.path.join(_MODEL_DIR, "feature_names.json")))

# Lookup table for known Blur addresses (fast path)
_lookup_path = os.path.join(_DATA_DIR, "nft_feats_labeled_T30.csv")
if os.path.exists(_lookup_path):
    df_lookup = pd.read_csv(_lookup_path).set_index("address")
else:
    df_lookup = pd.DataFrame()

# IF score normalization bounds (precomputed from Blur dataset)
# Avoid running decision_function on 251K rows at startup
_iso_min, _iso_max = -0.18, 0.12


def _normalize_iso(raw: float) -> float:
    if _iso_max == _iso_min:
        return 0.5
    return float(np.clip((raw - _iso_min) / (_iso_max - _iso_min), 0.0, 1.0))


# Human-readable labels for each feature
_FEATURE_LABELS = {
    "buy_count":           "NFT buy count",
    "buy_value":           "Buy volume (ETH)",
    "buy_collections":     "NFT collections",
    "sell_count":          "Sell count",
    "sell_value":          "Sell volume (ETH)",
    "tx_count":            "Total transactions",
    "total_trade_count":   "Total trades",
    "sell_ratio":          "Sell ratio",
    "pnl_proxy":           "PnL proxy (ETH)",
    "wallet_age_days":     "Wallet age (days)",
    "days_since_last_buy": "Days since last buy",
    "recent_activity":     "Recent activity (30d)",
    "blend_in_count":      "Blend borrows",
    "blend_out_count":     "Blend repays",
    "blend_net_value":     "Blend net value",
    "LP_count":            "LP tokens held",
    "unique_interactions": "Unique contracts",
    "ratio":               "Blend activity ratio",
    "buy_last_ts":         "Last buy timestamp",
    "buy_first_ts":        "First buy timestamp",
    "first_tx_ts":         "First tx timestamp",
    "DeLP_count":          "DeLP count",
}


def _top_features(feat_vec: np.ndarray, n: int = 3) -> list:
    """Return top-n features by per-prediction LightGBM contribution."""
    try:
        # pred_contrib returns shape (1, n_features+1); last col is bias
        contribs = lgb_model.predict(feat_vec, pred_contrib=True)[0]
        feature_contribs = contribs[:-1]  # drop bias
        top_idx = np.argsort(np.abs(feature_contribs))[::-1][:n]
        result = []
        for i in top_idx:
            name = feature_names[i]
            result.append({
                "feature":      name,
                "label":        _FEATURE_LABELS.get(name, name),
                "value":        round(float(feat_vec[0][i]), 4),
                "contribution": round(float(feature_contribs[i]), 4),
            })
        return result
    except Exception:
        return []


def _score_features(features: dict, addr: str) -> dict:
    """Run LGB + IF on a feature dict and return result payload."""
    feat_vec = np.array([features.get(f, 0.0) for f in feature_names], dtype=float).reshape(1, -1)
    feat_vec = np.nan_to_num(feat_vec, nan=0.0)

    lgb_score = float(lgb_model.predict_proba(feat_vec)[0][1])
    iso_raw   = float(-iso_model.decision_function(feat_vec)[0])
    if_norm   = _normalize_iso(iso_raw)
    final     = lgb_score * 0.7 + if_norm * 0.3

    buy_count      = features.get("buy_count", 0) or 0
    blend_in_count = features.get("blend_in_count", 0) or 0
    wallet_age     = features.get("wallet_age_days", 9999) or 9999

    if buy_count > 9000 or blend_in_count > 100:
        sybil_type = "hyperactive_bot"
    elif buy_count > 794:
        sybil_type = "mid_volume"
    elif wallet_age < 30:
        sybil_type = "new_wallet"
    else:
        sybil_type = "retail_hunter"

    sybil_score = min(100, max(0, round(final * 100)))
    risk = "high" if sybil_score >= 70 else "medium" if sybil_score >= 40 else "low"

    return {
        "address":          addr,
        "sybil_score":      sybil_score,
        "score":            round(final, 4),
        "lgb_score":        round(lgb_score, 4),
        "if_score":         round(if_norm, 4),
        "risk":             risk,
        "sybil_type":       sybil_type,
        "tx_count":         int(features.get("tx_count", 0)),
        "wallet_age_days":  round(features.get("wallet_age_days", 0), 1),
        "nft_collections":  int(features.get("buy_collections", 0)),
        "unique_contracts": int(features.get("unique_interactions", 0)),
        "total_volume_eth": round(features.get("buy_value", 0) + features.get("sell_value", 0), 4),
        "top_features":     _top_features(feat_vec),
        "data_source":      "cached",
    }


def score_addresses(addresses: list) -> list:
    """Sync scoring — only uses lookup table (for batch jobs)."""
    results = []
    for addr in addresses:
        addr = addr.strip().lower()
        if addr in df_lookup.index:
            row = df_lookup.loc[addr]
            features = {f: float(row.get(f, 0) or 0) for f in feature_names}
            result = _score_features(features, addr)
        else:
            # No live fetch in sync path — return pending marker
            result = {
                "address":    addr,
                "score":      None,
                "risk":       "unknown",
                "sybil_type": "unknown",
                "data_source": "not_found",
            }
        results.append(result)
    return results


async def score_address_live(address: str, chain: str = "eth") -> dict:
    """
    Async single-address scoring with live Etherscan fallback.
    Used by /v1/verify endpoint. Supports multi-chain via `chain` param.
    """
    from services.etherscan import fetch_features

    addr = address.strip().lower()

    # Fast path: cached (only available for ETH/Blur dataset)
    if chain == "eth" and addr in df_lookup.index:
        row = df_lookup.loc[addr]
        features = {f: float(row.get(f, 0) or 0) for f in feature_names}
        result = _score_features(features, addr)
        result["data_source"] = "cached"
        result["chain"] = chain
        return result

    # Slow path: live chain fetch
    try:
        features = await fetch_features(addr, chain=chain)
        result = _score_features(features, addr)
        result["data_source"] = "live"
        result["chain"]            = chain
        result["wallet_age_days"]  = round(features.get("_wallet_age_days", 0), 1)
        result["nft_collections"]  = int(features.get("_nft_collections", 0))
        result["unique_contracts"] = int(features.get("_unique_contracts", 0))
        result["total_volume_eth"] = round(features.get("_total_volume_eth", 0), 4)
        return result
    except Exception as e:
        return {
            "address":    addr,
            "score":      None,
            "risk":       "error",
            "sybil_type": "error",
            "error":      str(e),
            "chain":      chain,
            "data_source": "error",
        }

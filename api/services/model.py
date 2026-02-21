import joblib
import pandas as pd
import numpy as np
import json

lgb_model = joblib.load("api/models/lgb_blur_t30.joblib")
iso_model = joblib.load("api/models/iso_blur.joblib")
feature_names = json.load(open("api/models/feature_names.json"))
df_lookup = pd.read_csv("api/data/nft_feats_labeled_T30.csv").set_index("address")

# Pre-compute IF score bounds for normalization
_iso_raw_all = -iso_model.decision_function(df_lookup[feature_names].values)
_iso_min = float(_iso_raw_all.min())
_iso_max = float(_iso_raw_all.max())


def _normalize_iso(raw: float) -> float:
    if _iso_max == _iso_min:
        return 0.5
    return float(np.clip((raw - _iso_min) / (_iso_max - _iso_min), 0.0, 1.0))


def score_addresses(addresses: list) -> list:
    results = []
    for addr in addresses:
        addr = addr.lower()
        if addr in df_lookup.index:
            row = df_lookup.loc[addr]
            features = row[feature_names].values.reshape(1, -1)
            lgb_score = float(lgb_model.predict_proba(features)[0][1])
            iso_raw = float(-iso_model.decision_function(features)[0])
            if_norm = _normalize_iso(iso_raw)
            final = lgb_score * 0.7 + if_norm * 0.3
            buy_count = float(row.get("buy_count", 0) or 0)
            blend_in_count = float(row.get("blend_in_count", 0) or 0)
            wallet_age_days = float(row.get("wallet_age_days", 9999) or 9999)
            if buy_count > 9000 or blend_in_count > 100:
                sybil_type = "hyperactive_bot"
            elif buy_count > 794:
                sybil_type = "mid_volume"
            elif wallet_age_days < 30:
                sybil_type = "high_frequency"
            else:
                sybil_type = "retail_hunter"
        else:
            final = 0.05
            sybil_type = "unknown"

        risk = "high" if final >= 0.6 else "medium" if final >= 0.3 else "low"
        results.append({
            "address": addr,
            "score": round(float(final), 4),
            "risk": risk,
            "sybil_type": sybil_type,
        })
    return results

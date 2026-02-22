"""
Multi-chain feature fetcher using Etherscan v2 API (supports ETH, ARB, POLY, BASE, OP, BSC).
All EVM-compatible chains share the same feature schema.
"""

import asyncio
import os
import time
import httpx

# ── API Keys (set env vars or fall back to defaults) ─────────────────────────
CHAIN_CONFIG = {
    # Free tier (Etherscan V2 — single key routes by chainid)
    "eth":      {"chainid": 1,       "key": os.getenv("ETHERSCAN_ETH",  "EH2EBW54AHN4JC1DR5ZC12GDKFG554JX7D")},
    "arb":      {"chainid": 42161,   "key": os.getenv("ETHERSCAN_ARB",  "")},
    "poly":     {"chainid": 137,     "key": os.getenv("ETHERSCAN_POLY", "")},
    "linea":    {"chainid": 59144,   "key": os.getenv("ETHERSCAN_ETH",  "EH2EBW54AHN4JC1DR5ZC12GDKFG554JX7D")},
    "blast":    {"chainid": 81457,   "key": os.getenv("ETHERSCAN_ETH",  "EH2EBW54AHN4JC1DR5ZC12GDKFG554JX7D")},
    "scroll":   {"chainid": 534352,  "key": os.getenv("ETHERSCAN_ETH",  "EH2EBW54AHN4JC1DR5ZC12GDKFG554JX7D")},
    "mantle":   {"chainid": 5000,    "key": os.getenv("ETHERSCAN_ETH",  "EH2EBW54AHN4JC1DR5ZC12GDKFG554JX7D")},
    "taiko":    {"chainid": 167000,  "key": os.getenv("ETHERSCAN_ETH",  "EH2EBW54AHN4JC1DR5ZC12GDKFG554JX7D")},
    "gnosis":   {"chainid": 100,     "key": os.getenv("ETHERSCAN_ETH",  "EH2EBW54AHN4JC1DR5ZC12GDKFG554JX7D")},
    "celo":     {"chainid": 42220,   "key": os.getenv("ETHERSCAN_ETH",  "EH2EBW54AHN4JC1DR5ZC12GDKFG554JX7D")},
    "moonbeam": {"chainid": 1284,    "key": os.getenv("ETHERSCAN_ETH",  "EH2EBW54AHN4JC1DR5ZC12GDKFG554JX7D")},
    # Paid tier only
    "base":     {"chainid": 8453,    "key": os.getenv("ETHERSCAN_BASE", "")},
    "op":       {"chainid": 10,      "key": os.getenv("ETHERSCAN_OP",   "")},
    "bsc":      {"chainid": 56,      "key": os.getenv("ETHERSCAN_BSC",  "")},
}

# Etherscan v2 — single endpoint, chain routed by chainid
BASE = "https://api.etherscan.io/v2/api"

# Fallback keys for ETH (round-robin)
_ETH_KEYS = [
    "EH2EBW54AHN4JC1DR5ZC12GDKFG554JX7D",
    "NPSPUHS61RHBNF49VJTZT23KE8PBV2PZ7A",
]
_key_idx = 0

def _get_key(chain: str) -> str:
    global _key_idx
    cfg = CHAIN_CONFIG.get(chain, CHAIN_CONFIG["eth"])
    if cfg["key"]:
        return cfg["key"]
    # Fall back to ETH keys round-robin
    k = _ETH_KEYS[_key_idx % len(_ETH_KEYS)]
    _key_idx += 1
    return k

def _get_chainid(chain: str) -> int:
    return CHAIN_CONFIG.get(chain, CHAIN_CONFIG["eth"])["chainid"]

# T0 reference for Blur Season 2
BLUR_T0 = 1700525735

# Known Blur Blend contracts (ETH mainnet only; ignored on other chains)
_KNOWN_BLEND_CONTRACTS = {
    "0x29469395eaf6f95920e59f858042f0e28d98a20b",
}


async def _fetch(client: httpx.AsyncClient, params: dict, chain: str, retries: int = 3) -> dict:
    params["apikey"] = _get_key(chain)
    params["chainid"] = _get_chainid(chain)
    for attempt in range(retries):
        try:
            resp = await client.get(BASE, params=params, timeout=15)
            data = resp.json()
            if data.get("status") == "1":
                return data
            if data.get("message") == "No transactions found":
                return {"result": []}
            if "rate limit" in str(data.get("result", "")).lower():
                await asyncio.sleep(1.5)
                continue
            return {"result": []}
        except Exception:
            await asyncio.sleep(1)
    return {"result": []}


async def fetch_features(address: str, t0: int = None, chain: str = "eth") -> dict:
    """
    Fetch live on-chain features for `address` on the given chain.
    Uses only transactions before timestamp `t0` (defaults to now).
    Returns 18 behavioral features matching the Blur model schema.
    """
    if t0 is None:
        t0 = int(time.time())

    addr = address.lower()

    async with httpx.AsyncClient() as client:
        tx_data = await _fetch(client, {
            "module": "account", "action": "txlist",
            "address": addr, "startblock": 0, "endblock": 99999999,
            "sort": "asc", "offset": 10000, "page": 1,
        }, chain)
        txs = [t for t in (tx_data.get("result") or [])
               if int(t.get("timeStamp", 0)) < t0]

        int_data = await _fetch(client, {
            "module": "account", "action": "txlistinternal",
            "address": addr, "startblock": 0, "endblock": 99999999,
            "sort": "asc", "offset": 5000, "page": 1,
        }, chain)
        int_txs = [t for t in (int_data.get("result") or [])
                   if int(t.get("timeStamp", 0)) < t0]

        erc20_data = await _fetch(client, {
            "module": "account", "action": "tokentx",
            "address": addr, "startblock": 0, "endblock": 99999999,
            "sort": "asc", "offset": 5000, "page": 1,
        }, chain)
        erc20_txs = [t for t in (erc20_data.get("result") or [])
                     if int(t.get("timeStamp", 0)) < t0]

        nft_data = await _fetch(client, {
            "module": "account", "action": "tokennfttx",
            "address": addr, "startblock": 0, "endblock": 99999999,
            "sort": "asc", "offset": 5000, "page": 1,
        }, chain)
        nft_txs = [t for t in (nft_data.get("result") or [])
                   if int(t.get("timeStamp", 0)) < t0]

    if not txs:
        return _zero_features()

    timestamps  = [int(t["timeStamp"]) for t in txs]
    first_ts    = min(timestamps)
    last_ts     = max(timestamps)
    recent_cutoff = t0 - 30 * 86400

    out_txs = [t for t in txs if t.get("from", "").lower() == addr]
    in_txs  = [t for t in txs if t.get("to",   "").lower() == addr]

    tx_count         = len(txs)
    wallet_age_days  = max((t0 - first_ts) / 86400, 0.01)
    days_since_last  = max((t0 - last_ts)  / 86400, 0.0)
    active_span_days = max((last_ts - first_ts) / 86400, 0.01)

    buy_value  = sum(int(t.get("value", 0)) for t in out_txs) / 1e18
    sell_value = sum(int(t.get("value", 0)) for t in in_txs)  / 1e18
    int_recv   = sum(int(t.get("value", 0)) for t in int_txs
                     if t.get("to", "").lower() == addr) / 1e18
    sell_value += int_recv
    pnl_proxy  = sell_value - buy_value

    all_contracts = {t["to"].lower() for t in txs if t.get("to")}
    unique_interactions = len(all_contracts)

    nft_contracts_bought = {
        t.get("contractAddress", "").lower()
        for t in nft_txs
        if t.get("from", "").lower() != addr
    }
    buy_collections = len(nft_contracts_bought)

    buy_count  = len(out_txs)
    sell_count = len(in_txs)
    sell_ratio = sell_count / max(tx_count, 1)
    recent_activity = sum(1 for ts in timestamps if ts >= recent_cutoff)

    lp_contracts    = set()
    blend_in_count  = 0
    blend_out_count = 0
    blend_net_value = 0.0
    for t in erc20_txs:
        sym = t.get("tokenSymbol", "").upper()
        if any(x in sym for x in ["LP", "UNI-V2", "CAKE-LP"]):
            lp_contracts.add(t.get("contractAddress", "").lower())
        if t.get("contractAddress", "").lower() in _KNOWN_BLEND_CONTRACTS:
            val = int(t.get("value", 0)) / (10 ** max(int(t.get("tokenDecimal", 18)), 0))
            if t.get("to", "").lower() == addr:
                blend_in_count += 1
                blend_net_value += val
            else:
                blend_out_count += 1
                blend_net_value -= val

    lp_count = len(lp_contracts)

    return {
        "buy_count":           float(buy_count),
        "sell_count":          float(sell_count),
        "tx_count":            float(tx_count),
        "total_trade_count":   float(tx_count),
        "buy_value":           float(buy_value),
        "sell_value":          float(sell_value),
        "pnl_proxy":           float(pnl_proxy),
        "buy_collections":     float(buy_collections),
        "unique_interactions": float(unique_interactions),
        "sell_ratio":          float(sell_ratio),
        "wallet_age_days":     float(wallet_age_days),
        "days_since_last_buy": float(days_since_last),
        "recent_activity":     float(recent_activity),
        "blend_in_count":      float(blend_in_count),
        "blend_out_count":     float(blend_out_count),
        "blend_net_value":     float(blend_net_value),
        "LP_count":            float(lp_count),
        "ratio":               float(blend_in_count / max(tx_count, 1)),
        # extras for response display
        "_wallet_age_days":    float(wallet_age_days),
        "_active_span_days":   float(active_span_days),
        "_nft_collections":    float(buy_collections),
        "_unique_contracts":   float(unique_interactions),
        "_total_volume_eth":   float(buy_value + sell_value),
        "_first_tx_ts":        float(first_ts),
        "_last_tx_ts":         float(last_ts),
    }


def _zero_features() -> dict:
    keys = [
        "buy_count", "sell_count", "tx_count", "total_trade_count",
        "buy_value", "sell_value", "pnl_proxy", "buy_collections",
        "unique_interactions", "sell_ratio", "wallet_age_days",
        "days_since_last_buy", "recent_activity", "blend_in_count",
        "blend_out_count", "blend_net_value", "LP_count", "ratio",
        "_wallet_age_days", "_active_span_days", "_nft_collections",
        "_unique_contracts", "_total_volume_eth", "_first_tx_ts", "_last_tx_ts",
    ]
    return {k: 0.0 for k in keys}

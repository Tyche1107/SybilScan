"""
Live Etherscan feature computation for any ETH address.
Maps on-chain activity to the 18 behavioral features used in the Blur model.
"""

import asyncio
import time
import httpx

ETHERSCAN_KEYS = [
    "EH2EBW54AHN4JC1DR5ZC12GDKFG554JX7D",
    "NPSPUHS61RHBNF49VJTZT23KE8PBV2PZ7A",
]
_key_idx = 0

def _next_key():
    global _key_idx
    k = ETHERSCAN_KEYS[_key_idx % len(ETHERSCAN_KEYS)]
    _key_idx += 1
    return k

BASE = "https://api.etherscan.io/v2/api"
CHAIN = 1  # ETH mainnet

# T0 for Blur Season 2 (used if no protocol-specific T0 given)
BLUR_T0 = 1700525735


async def _fetch(client: httpx.AsyncClient, params: dict, retries=3) -> dict:
    params["apikey"] = _next_key()
    params["chainid"] = CHAIN
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


async def fetch_features(address: str, t0: int = None) -> dict:
    """
    Fetch live on-chain features for `address` using only transactions
    before timestamp `t0` (defaults to now = full history).

    Returns a dict of 18 feature values matching the Blur model's feature names.
    """
    if t0 is None:
        t0 = int(time.time())

    addr = address.lower()
    now = int(time.time())

    async with httpx.AsyncClient() as client:
        # --- normal transactions ---
        tx_data = await _fetch(client, {
            "module": "account", "action": "txlist",
            "address": addr, "startblock": 0, "endblock": 99999999,
            "sort": "asc", "offset": 10000, "page": 1,
        })
        txs = [t for t in (tx_data.get("result") or [])
               if int(t.get("timeStamp", 0)) < t0]

        # --- internal transactions (ETH in via contracts) ---
        int_data = await _fetch(client, {
            "module": "account", "action": "txlistinternal",
            "address": addr, "startblock": 0, "endblock": 99999999,
            "sort": "asc", "offset": 5000, "page": 1,
        })
        int_txs = [t for t in (int_data.get("result") or [])
                   if int(t.get("timeStamp", 0)) < t0]

        # --- ERC-20 token transfers (for LP detection) ---
        erc20_data = await _fetch(client, {
            "module": "account", "action": "tokentx",
            "address": addr, "startblock": 0, "endblock": 99999999,
            "sort": "asc", "offset": 5000, "page": 1,
        })
        erc20_txs = [t for t in (erc20_data.get("result") or [])
                     if int(t.get("timeStamp", 0)) < t0]

        # --- NFT transfers (ERC-721) ---
        nft_data = await _fetch(client, {
            "module": "account", "action": "tokennfttx",
            "address": addr, "startblock": 0, "endblock": 99999999,
            "sort": "asc", "offset": 5000, "page": 1,
        })
        nft_txs = [t for t in (nft_data.get("result") or [])
                   if int(t.get("timeStamp", 0)) < t0]

    # ---- compute features ----
    if not txs:
        return _zero_features()

    timestamps = [int(t["timeStamp"]) for t in txs]
    first_ts = min(timestamps)
    last_ts = max(timestamps)
    recent_cutoff = t0 - 30 * 86400

    # Basic tx stats
    out_txs = [t for t in txs if t.get("from", "").lower() == addr]
    in_txs  = [t for t in txs if t.get("to", "").lower() == addr]

    tx_count        = len(txs)
    wallet_age_days = max((t0 - first_ts) / 86400, 0.01)
    days_since_last = max((t0 - last_ts) / 86400, 0.0)
    active_span_days = max((last_ts - first_ts) / 86400, 0.01)

    # Volume (ETH)
    buy_value  = sum(int(t.get("value", 0)) for t in out_txs) / 1e18
    sell_value = sum(int(t.get("value", 0)) for t in in_txs)  / 1e18
    int_recv   = sum(int(t.get("value", 0)) for t in int_txs
                     if t.get("to", "").lower() == addr) / 1e18
    sell_value += int_recv
    pnl_proxy  = sell_value - buy_value

    # Contract interactions = unique_interactions
    all_contracts = set()
    for t in txs:
        if t.get("to"):
            all_contracts.add(t["to"].lower())
    unique_interactions = len(all_contracts)

    # NFT collections (= buy_collections proxy via ERC-721 contracts)
    nft_contracts_bought = set()
    for t in nft_txs:
        if t.get("from", "").lower() == addr:
            continue  # skip outgoing NFT
        nft_contracts_bought.add(t.get("contractAddress", "").lower())
    buy_collections = len(nft_contracts_bought)

    # buy/sell counts (use out/in for proxy)
    buy_count  = len(out_txs)
    sell_count = len(in_txs)
    total_trade_count = tx_count
    sell_ratio = sell_count / max(tx_count, 1)

    # Recent activity (txs in last 30 days before t0)
    recent_activity = sum(1 for ts in timestamps if ts >= recent_cutoff)

    # LP / DeFi: count ERC-20 token transfers (proxy for DeFi interactions)
    lp_contracts = set()
    blend_in_count = 0
    blend_out_count = 0
    blend_net_value = 0.0
    for t in erc20_txs:
        sym = t.get("tokenSymbol", "").upper()
        if any(x in sym for x in ["LP", "UNI-V2", "CAKE-LP"]):
            lp_contracts.add(t.get("contractAddress", "").lower())
        # Blur Blend proxy: look for known Blend contract interactions
        if t.get("contractAddress", "").lower() in _KNOWN_BLEND_CONTRACTS:
            val = int(t.get("value", 0)) / (10 ** max(int(t.get("tokenDecimal", 18)), 0))
            if t.get("to", "").lower() == addr:
                blend_in_count += 1
                blend_net_value += val
            else:
                blend_out_count += 1
                blend_net_value -= val

    lp_count = len(lp_contracts)
    ratio = blend_in_count / max(tx_count, 1)

    return {
        "buy_count":          float(buy_count),
        "sell_count":         float(sell_count),
        "tx_count":           float(tx_count),
        "total_trade_count":  float(total_trade_count),
        "buy_value":          float(buy_value),
        "sell_value":         float(sell_value),
        "pnl_proxy":          float(pnl_proxy),
        "buy_collections":    float(buy_collections),
        "unique_interactions":float(unique_interactions),
        "sell_ratio":         float(sell_ratio),
        "wallet_age_days":    float(wallet_age_days),
        "days_since_last_buy":float(days_since_last),
        "recent_activity":    float(recent_activity),
        "blend_in_count":     float(blend_in_count),
        "blend_out_count":    float(blend_out_count),
        "blend_net_value":    float(blend_net_value),
        "LP_count":           float(lp_count),
        "ratio":              float(ratio),
        # extras for response enrichment (not fed to model)
        "_wallet_age_days":   float(wallet_age_days),
        "_active_span_days":  float(active_span_days),
        "_nft_collections":   float(buy_collections),
        "_unique_contracts":  float(unique_interactions),
        "_total_volume_eth":  float(buy_value + sell_value),
        "_first_tx_ts":       float(first_ts),
        "_last_tx_ts":        float(last_ts),
    }


def _zero_features() -> dict:
    """Return all-zero feature dict for addresses with no history."""
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


# Known Blur Blend contract addresses on ETH mainnet
_KNOWN_BLEND_CONTRACTS = {
    "0x29469395eaf6f95920e59f858042f0e28d98a20b",  # Blur: Blend
}

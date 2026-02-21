#!/usr/bin/env node
/**
 * fetch_features.mjs
 * Fetches Ethereum transaction history for a list of addresses and computes
 * general behavioral features mapped to the 22-feature schema expected by
 * the SybilScan ML model.
 *
 * Usage:
 *   node scripts/fetch_features.mjs --addresses addr1,addr2,... --output /tmp/features.json
 *   node scripts/fetch_features.mjs --file /path/to/addresses.txt --output /tmp/features.json
 */

import { readFileSync, writeFileSync } from 'fs';
import { parseArgs } from 'util';

// ─── Config ───────────────────────────────────────────────────────────────────

const API_KEYS = [
  'EH2EBW54AHN4JC1DR5ZC12GDKFG554JX7D',
  'NPSPUHS61RHBNF49VJTZT23KE8PBV2PZ7A',
];
const BASE_URL = 'https://api.etherscan.io/v2/api';
const CHAIN_ID = 1; // Ethereum mainnet
// 2 keys × 5 req/s = 10 req/s total → 100 ms minimum between requests
const RATE_MS = 100;

const DEX_ROUTERS = new Set([
  '0x7a250d5630b4cf539739df2c5dacb4c659f2488d', // Uniswap V2
  '0xe592427a0aece92de3edee1f18e0157c05861564', // Uniswap V3
  '0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f', // SushiSwap
]);

// ─── Rate limiter (sequential per-request, alternating keys) ──────────────────

let keyIdx = 0;
let lastReqTime = 0;

async function throttledFetch(url) {
  const now = Date.now();
  const wait = RATE_MS - (now - lastReqTime);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastReqTime = Date.now();

  const apiKey = API_KEYS[keyIdx % API_KEYS.length];
  keyIdx++;

  const fullUrl = `${url}&apikey=${apiKey}`;
  const resp = await fetch(fullUrl);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function fetchWithRetry(url, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const data = await throttledFetch(url);
      // Etherscan returns status '0' with message "No transactions found" — that's OK
      if (data.message === 'No transactions found') return { result: [] };
      // Rate limit hit — back off
      if (
        data.result === 'Max rate limit reached' ||
        (typeof data.result === 'string' && data.result.toLowerCase().includes('rate'))
      ) {
        console.error(`  Rate limited — backing off ${(attempt + 1) * 1000}ms`);
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      return data;
    } catch (err) {
      if (attempt === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  return { result: [] };
}

// ─── Etherscan fetchers ───────────────────────────────────────────────────────

async function fetchNormalTxs(address) {
  const url =
    `${BASE_URL}?chainid=${CHAIN_ID}&module=account&action=txlist` +
    `&address=${address}&startblock=0&endblock=99999999&sort=asc`;
  const data = await fetchWithRetry(url);
  return Array.isArray(data?.result) ? data.result : [];
}

async function fetchERC20Transfers(address) {
  const url =
    `${BASE_URL}?chainid=${CHAIN_ID}&module=account&action=tokentx` +
    `&address=${address}&startblock=0&endblock=99999999&sort=asc`;
  const data = await fetchWithRetry(url);
  return Array.isArray(data?.result) ? data.result : [];
}

// ─── Feature computation ──────────────────────────────────────────────────────

function median(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Compute all 22 features from raw Etherscan data.
 * Feature names exactly match feature_names.json used by the ML model.
 */
function computeFeatures(address, normalTxs, erc20Transfers) {
  const now = Math.floor(Date.now() / 1000);
  const addr = address.toLowerCase();
  const thirtyDaysAgo = now - 30 * 86400;

  // ── Normal transaction features ──────────────────────────────────────────
  const tx_count = normalTxs.length;
  const first_tx_ts =
    tx_count > 0 ? parseInt(normalTxs[0].timeStamp, 10) : 0;
  const wallet_age_days =
    first_tx_ts > 0 ? Math.max(0, (now - first_tx_ts) / 86400) : 0;

  const uniqueContracts = new Set(
    normalTxs
      .filter(tx => tx.to && tx.to !== '')
      .map(tx => tx.to.toLowerCase())
  );
  const unique_interactions = uniqueContracts.size;

  let buy_value = 0;   // ETH received (to == address)
  let sell_value = 0;  // ETH sent (from == address)
  let LP_count = 0;    // outgoing txs to DEX routers
  let DeLP_count = 0;  // incoming txs from DEX routers
  let recent_activity = 0;

  for (const tx of normalTxs) {
    const ts = parseInt(tx.timeStamp, 10);
    const value = parseFloat(tx.value) / 1e18; // wei → ETH
    const toAddr = (tx.to || '').toLowerCase();
    const fromAddr = (tx.from || '').toLowerCase();

    if (toAddr === addr) buy_value += value;
    if (fromAddr === addr) sell_value += value;

    // DEX interactions: outgoing to DEX = "liquidity add"
    if (fromAddr === addr && DEX_ROUTERS.has(toAddr)) LP_count++;
    // DEX interactions: incoming from DEX = "liquidity remove"
    if (toAddr === addr && DEX_ROUTERS.has(fromAddr)) DeLP_count++;

    if (ts >= thirtyDaysAgo) recent_activity++;
  }

  // ── ERC-20 transfer features ──────────────────────────────────────────────
  const erc20In  = erc20Transfers.filter(t => t.to.toLowerCase()   === addr);
  const erc20Out = erc20Transfers.filter(t => t.from.toLowerCase() === addr);

  const buy_count  = erc20In.length;
  const sell_count = erc20Out.length;

  const buy_collections = new Set(
    erc20In.map(t => t.contractAddress.toLowerCase())
  ).size;

  // Sorted asc by block/timeStamp, so [0] = first, [last] = last
  const buy_first_ts =
    erc20In.length > 0 ? parseInt(erc20In[0].timeStamp, 10) : 0;
  const buy_last_ts =
    erc20In.length > 0 ? parseInt(erc20In[erc20In.length - 1].timeStamp, 10) : 0;

  const days_since_last_buy =
    buy_last_ts > 0 ? (now - buy_last_ts) / 86400 : 999;

  // Blend: large transfers relative to median — proxy for wash-trading
  const inValues  = erc20In.map(t => parseFloat(t.value)  || 0);
  const outValues = erc20Out.map(t => parseFloat(t.value) || 0);
  const medVal = median([...inValues, ...outValues]);

  const blend_in_count  = inValues.filter(v => v > medVal).length;
  const blend_out_count = outValues.filter(v => v > medVal).length;
  const blend_net_value = blend_in_count - blend_out_count;

  // ── Derived features ──────────────────────────────────────────────────────
  const total_trade_count = buy_count + sell_count;
  const sell_ratio        = sell_count / (buy_count + 1);
  const pnl_proxy         = buy_value - sell_value;
  const ratio             = sell_ratio; // duplicate for model compat

  // Return in canonical order matching feature_names.json
  return {
    buy_count,
    buy_value,
    buy_collections,
    buy_last_ts,
    buy_first_ts,
    sell_count,
    sell_value,
    tx_count,
    first_tx_ts,
    total_trade_count,
    sell_ratio,
    pnl_proxy,
    wallet_age_days,
    days_since_last_buy,
    recent_activity,
    blend_in_count,
    blend_out_count,
    blend_net_value,
    LP_count,
    DeLP_count,
    unique_interactions,
    ratio,
  };
}

// ─── Per-address pipeline ─────────────────────────────────────────────────────

export async function processAddress(address) {
  // Fetch sequentially to stay within rate limit
  const normalTxs      = await fetchNormalTxs(address);
  const erc20Transfers = await fetchERC20Transfers(address);
  const features       = computeFeatures(address, normalTxs, erc20Transfers);
  return { address: address.toLowerCase(), features };
}

export async function fetchFeaturesForAddresses(addresses) {
  const results = [];
  for (const addr of addresses) {
    try {
      console.error(`  Fetching: ${addr}`);
      const result = await processAddress(addr);
      results.push(result);
    } catch (err) {
      console.error(`  Error for ${addr}: ${err.message}`);
      // Return zeroed-out features rather than crashing the whole batch
      results.push({
        address: addr.toLowerCase(),
        features: computeFeatures(addr, [], []),
        error: err.message,
      });
    }
  }
  return results;
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

async function main() {
  const { values } = parseArgs({
    options: {
      addresses: { type: 'string' },
      file:      { type: 'string' },
      output:    { type: 'string' },
    },
  });

  let addresses = [];

  if (values.addresses) {
    addresses = values.addresses.split(',').map(a => a.trim()).filter(Boolean);
  } else if (values.file) {
    const content = readFileSync(values.file, 'utf8');
    addresses = content.split('\n').map(a => a.trim()).filter(Boolean);
  } else {
    console.error('Error: provide --addresses addr1,addr2,... or --file /path/to/list.txt');
    process.exit(1);
  }

  if (!values.output) {
    console.error('Error: provide --output /path/to/output.json');
    process.exit(1);
  }

  console.error(`Processing ${addresses.length} address(es)...`);
  const results = await fetchFeaturesForAddresses(addresses);

  writeFileSync(values.output, JSON.stringify(results, null, 2));
  console.error(`Done. Written ${results.length} records to ${values.output}`);
}

// Run if called directly (not imported as module)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

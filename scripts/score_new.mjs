#!/usr/bin/env node
/**
 * score_new.mjs
 * Fetch on-chain features for addresses and score them via the SybilScan API.
 *
 * Usage:
 *   node scripts/score_new.mjs --addresses addr1,addr2,...
 *   node scripts/score_new.mjs --addresses addr1,addr2 --api http://localhost:8000
 *
 * Steps:
 *   1. Fetch on-chain features via fetch_features.mjs logic
 *   2. POST addresses to /v1/score
 *   3. Poll /v1/jobs/:id until complete
 *   4. Print results table: address | score | risk | sybil_type
 */

import { parseArgs } from 'util';
import { fetchFeaturesForAddresses } from './fetch_features.mjs';

const DEFAULT_API = 'http://localhost:8000';
const POLL_INTERVAL_MS = 1000;
const MAX_POLL_ATTEMPTS = 120; // 2 minutes max

// ─── API helpers ──────────────────────────────────────────────────────────────

async function postScore(apiBase, addresses) {
  const resp = await fetch(`${apiBase}/v1/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ addresses }),
  });
  if (!resp.ok) throw new Error(`POST /v1/score failed: ${resp.status}`);
  return resp.json();
}

async function pollJob(apiBase, jobId) {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const resp = await fetch(`${apiBase}/v1/jobs/${jobId}`);
    if (!resp.ok) throw new Error(`GET /v1/jobs/${jobId} failed: ${resp.status}`);
    const job = await resp.json();
    if (job.status === 'complete') return job;
    if (job.status === 'failed') throw new Error(`Job ${jobId} failed`);
    process.stderr.write(
      `  Waiting for job... (${job.completed}/${job.total} complete)\r`
    );
  }
  throw new Error('Timed out waiting for job to complete');
}

// ─── Table printer ────────────────────────────────────────────────────────────

function printTable(results) {
  const RISK_COLOR = { high: '\x1b[31m', medium: '\x1b[33m', low: '\x1b[32m' };
  const RESET = '\x1b[0m';

  const addrWidth  = Math.max(42, ...results.map(r => r.address.length));
  const scoreWidth = 8;
  const riskWidth  = 8;
  const typeWidth  = Math.max(12, ...results.map(r => (r.sybil_type || 'unknown').length));

  const hr = '-'.repeat(addrWidth + scoreWidth + riskWidth + typeWidth + 13);
  const header =
    `${'Address'.padEnd(addrWidth)}  ` +
    `${'Score'.padEnd(scoreWidth)}  ` +
    `${'Risk'.padEnd(riskWidth)}  ` +
    `Type`;

  console.log('\n' + hr);
  console.log(header);
  console.log(hr);

  for (const r of results) {
    const color = RISK_COLOR[r.risk] || '';
    console.log(
      `${r.address.padEnd(addrWidth)}  ` +
      `${String(r.score).padEnd(scoreWidth)}  ` +
      `${color}${r.risk.padEnd(riskWidth)}${RESET}  ` +
      `${r.sybil_type || 'unknown'}`
    );
  }
  console.log(hr + '\n');

  // Summary
  const high   = results.filter(r => r.risk === 'high').length;
  const medium = results.filter(r => r.risk === 'medium').length;
  const low    = results.filter(r => r.risk === 'low').length;
  console.log(`Summary: ${high} high | ${medium} medium | ${low} low risk`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { values } = parseArgs({
    options: {
      addresses: { type: 'string' },
      api:       { type: 'string' },
      'skip-fetch': { type: 'boolean' },
    },
  });

  if (!values.addresses) {
    console.error('Usage: node scripts/score_new.mjs --addresses addr1,addr2,...');
    process.exit(1);
  }

  const addresses = values.addresses.split(',').map(a => a.trim()).filter(Boolean);
  const apiBase   = values.api || DEFAULT_API;

  // Step 1: Fetch on-chain features (even if API doesn't consume them yet,
  // we log them for transparency and future integration)
  if (!values['skip-fetch']) {
    console.error(`\n[1/3] Fetching on-chain features for ${addresses.length} address(es)...`);
    try {
      const features = await fetchFeaturesForAddresses(addresses);
      console.error(`      Features computed for ${features.length} address(es).`);
      // Log a quick summary of key features for each address
      for (const { address, features: f } of features) {
        console.error(
          `      ${address.slice(0, 10)}...  ` +
          `tx=${f.tx_count}  buy=${f.buy_count}  sell=${f.sell_count}  ` +
          `age=${f.wallet_age_days.toFixed(1)}d  lp=${f.LP_count}`
        );
      }
    } catch (err) {
      console.error(`      Warning: feature fetch failed: ${err.message}`);
      console.error('      Continuing to score with training cache only...');
    }
  }

  // Step 2: POST to scoring API
  console.error(`\n[2/3] Submitting ${addresses.length} address(es) to ${apiBase}/v1/score...`);
  let job;
  try {
    job = await postScore(apiBase, addresses);
    console.error(`      Job created: ${job.job_id}`);
  } catch (err) {
    console.error(`\nError: Could not reach API at ${apiBase}: ${err.message}`);
    console.error('Is the API running? Try: cd api && uvicorn main:app --reload');
    process.exit(1);
  }

  // Step 3: Poll until complete
  console.error(`\n[3/3] Waiting for results...`);
  const completedJob = await pollJob(apiBase, job.job_id);
  console.error(`      Complete!\n`);

  // Step 4: Print results table
  printTable(completedJob.results);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

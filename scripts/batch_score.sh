#!/usr/bin/env bash
# batch_score.sh
# Takes a CSV file of addresses, calls the SybilScan API, saves results.
#
# Usage:
#   ./scripts/batch_score.sh input.csv output.csv
#   ./scripts/batch_score.sh input.csv output.csv http://localhost:8000
#
# The input CSV may have a header row; the first column must be the address.
# Lines starting with '#' are ignored. Empty lines are skipped.

set -euo pipefail

# ─── Args ─────────────────────────────────────────────────────────────────────
INPUT="${1:-}"
OUTPUT="${2:-}"
API_BASE="${3:-http://localhost:8000}"

if [[ -z "$INPUT" || -z "$OUTPUT" ]]; then
  echo "Usage: $0 input.csv output.csv [api_base_url]"
  echo "  input.csv   — CSV with addresses in the first column (header optional)"
  echo "  output.csv  — where to write results (address,score,risk,sybil_type)"
  echo "  api_base    — default: http://localhost:8000"
  exit 1
fi

if [[ ! -f "$INPUT" ]]; then
  echo "Error: input file not found: $INPUT"
  exit 1
fi

# ─── Check deps ───────────────────────────────────────────────────────────────
for dep in curl python3; do
  if ! command -v "$dep" &>/dev/null; then
    echo "Error: '$dep' is required but not installed."
    exit 1
  fi
done

# ─── Extract addresses ────────────────────────────────────────────────────────
# Skip comment lines, empty lines; skip header if first column looks non-address
ADDRESSES=$(
  grep -v '^\s*#' "$INPUT" |       # drop comment lines
  grep -v '^\s*$' |                 # drop blank lines
  awk -F',' '
    NR==1 {
      # skip header if first field does not look like an Ethereum address
      if ($1 !~ /^0x[0-9a-fA-F]{40}$/) next
    }
    { print $1 }
  '
)

ADDR_COUNT=$(echo "$ADDRESSES" | grep -c '.' || true)
if [[ "$ADDR_COUNT" -eq 0 ]]; then
  echo "Error: no valid addresses found in $INPUT"
  exit 1
fi
echo "Found $ADDR_COUNT address(es) in $INPUT"

# ─── Build JSON payload ───────────────────────────────────────────────────────
JSON_ADDRESSES=$(echo "$ADDRESSES" | python3 -c "
import sys, json
addrs = [line.strip() for line in sys.stdin if line.strip()]
print(json.dumps(addrs))
")

PAYLOAD=$(python3 -c "
import json
addrs = $JSON_ADDRESSES
print(json.dumps({'addresses': addrs}))
")

# ─── POST to API ──────────────────────────────────────────────────────────────
echo "Submitting to $API_BASE/v1/score..."
SCORE_RESP=$(curl -sf -X POST "$API_BASE/v1/score" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD") || {
    echo "Error: could not reach API at $API_BASE"
    echo "Is the API running? Try: cd api && uvicorn main:app --reload"
    exit 1
  }

JOB_ID=$(echo "$SCORE_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['job_id'])")
echo "Job created: $JOB_ID"

# ─── Poll until complete ──────────────────────────────────────────────────────
MAX_WAIT=120
ELAPSED=0
while true; do
  sleep 1
  ELAPSED=$((ELAPSED + 1))

  STATUS_RESP=$(curl -sf "$API_BASE/v1/jobs/$JOB_ID")
  STATUS=$(echo "$STATUS_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
  COMPLETED=$(echo "$STATUS_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('completed',0))")
  TOTAL=$(echo "$STATUS_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total',0))")

  echo -ne "  Status: $STATUS  ($COMPLETED/$TOTAL)\r"

  if [[ "$STATUS" == "complete" ]]; then
    echo ""
    break
  fi
  if [[ "$STATUS" == "failed" ]]; then
    echo ""
    echo "Error: job $JOB_ID failed"
    exit 1
  fi
  if [[ "$ELAPSED" -ge "$MAX_WAIT" ]]; then
    echo ""
    echo "Error: timed out waiting for job to complete after ${MAX_WAIT}s"
    exit 1
  fi
done

# ─── Save results to CSV ──────────────────────────────────────────────────────
curl -sf "$API_BASE/v1/jobs/$JOB_ID" | python3 - <<'PYEOF' "$OUTPUT"
import sys, json, csv

output_path = sys.argv[1]
data = json.load(sys.stdin)
results = data.get('results', [])

fieldnames = ['address', 'score', 'risk', 'sybil_type']
with open(output_path, 'w', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
    writer.writeheader()
    writer.writerows(results)

# Print summary
high   = sum(1 for r in results if r.get('risk') == 'high')
medium = sum(1 for r in results if r.get('risk') == 'medium')
low    = sum(1 for r in results if r.get('risk') == 'low')

print(f"Results saved to: {output_path}")
print(f"Total: {len(results)} | High: {high} | Medium: {medium} | Low: {low}")
PYEOF

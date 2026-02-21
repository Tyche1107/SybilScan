# SybilScan

A pre-airdrop sybil screening tool for Web3 protocols that identifies high-risk addresses using behavioral machine learning before token distribution.

## What it does

Submit a list of wallet addresses prior to your airdrop snapshot, and SybilScan scores each one based on on-chain behavioral patterns. The model detects sybil activity up to 30 days before an airdrop event (T-30), achieving an AUC of 0.905. Each address receives a risk score between 0 and 1, and you can download a filtered list containing only low-risk addresses for use in your distribution.

## Quick Start

### API

```bash
cd api && pip install -r requirements.txt
cd /path/to/SybilScan && uvicorn api.main:app --reload
# API docs at http://localhost:8000/docs
```

### Dashboard

```bash
cd web && npm install && npm run dev
# Open http://localhost:3000
```

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /v1/score | Submit address list for batch scoring (async) |
| GET | /v1/jobs/{job_id} | Poll job status and results |
| POST | /v1/verify | Score a single address (sync) |
| POST | /v1/keys | Generate API key |
| GET | /health | Health check |

### Example

```python
import requests

resp = requests.post("http://localhost:8000/v1/score", json={"addresses": ["0x..."]})
job_id = resp.json()["job_id"]

# poll until complete
result = requests.get(f"http://localhost:8000/v1/jobs/{job_id}").json()
```

## How it works

- Two-stage model: LightGBM (primary, AUC 0.905 at T-30) + Isolation Forest (open-world detection)
- 22 behavioral features computed from on-chain transaction history
- Trained on Blur NFT marketplace sybil labels (239K addresses)
- Risk levels: high (score >= 0.6), medium (score >= 0.3), low (score < 0.3)
- Unknown addresses default to score 0.05

## Background

This project is based on research into pre-airdrop sybil detection. See the underlying research repository for methodology, dataset details, and model evaluation: https://github.com/Tyche1107/pre-airdrop-detection

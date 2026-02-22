from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.jobs import create_job, get_job, run_job
import asyncio

router = APIRouter()

SUPPORTED_CHAINS = {"eth", "arb", "poly", "base", "op", "bsc"}


class ScoreRequest(BaseModel):
    addresses: list[str]
    threshold: float = 0.5
    chain: str = "eth"


class VerifyRequest(BaseModel):
    address: str
    chain: str = "eth"


@router.post("/v1/score")
async def score(req: ScoreRequest):
    """Submit a batch job. Returns job_id for polling."""
    if len(req.addresses) > 50_000:
        raise HTTPException(400, "Max 50,000 addresses per batch")
    chain = req.chain if req.chain in SUPPORTED_CHAINS else "eth"
    jid = create_job(req.addresses, chain=chain)
    asyncio.create_task(run_job(jid))
    return {"job_id": jid, "status": "pending", "total": len(req.addresses)}


@router.get("/v1/jobs/{job_id}")
def job_status(job_id: str):
    j = get_job(job_id)
    if not j:
        raise HTTPException(404, "Job not found")
    scored = [r for r in j["results"] if r.get("score") is not None]
    summary = {
        "total":   j["total"],
        "high":    sum(1 for r in scored if r["risk"] == "high"),
        "medium":  sum(1 for r in scored if r["risk"] == "medium"),
        "low":     sum(1 for r in scored if r["risk"] == "low"),
        "unknown": sum(1 for r in j["results"] if r.get("risk") in ("unknown", "error")),
    }
    return {**j, "progress": j["completed"] / max(j["total"], 1), "summary": summary}


@router.post("/v1/verify")
async def verify(req: VerifyRequest):
    """Real-time single-address scoring. Supports chain selection."""
    if not req.address or len(req.address) < 10:
        raise HTTPException(400, "Invalid address")
    chain = req.chain if req.chain in SUPPORTED_CHAINS else "eth"
    from services.model import score_address_live
    return await score_address_live(req.address, chain=chain)

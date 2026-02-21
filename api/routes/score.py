"""Score and job endpoints."""

import asyncio
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

from services.jobs import create_job, get_job, run_job
from services.model import score_addresses

router = APIRouter()


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------

class ScoreRequest(BaseModel):
    addresses: list[str] = Field(..., min_length=1)
    threshold: float = 0.5


class VerifyRequest(BaseModel):
    address: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/v1/score")
async def post_score(req: ScoreRequest, background_tasks: BackgroundTasks):
    """Create a batch scoring job and run it in the background."""
    job_id = create_job(req.addresses)
    background_tasks.add_task(run_job, job_id)
    return {
        "job_id": job_id,
        "status": "pending",
        "total": len(req.addresses),
    }


@router.get("/v1/jobs/{job_id}")
async def get_job_status(job_id: str):
    """Return full job details including results and progress."""
    job = get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    results = job.get("results", [])
    high = sum(1 for r in results if r["risk"] == "high")
    medium = sum(1 for r in results if r["risk"] == "medium")
    low = sum(1 for r in results if r["risk"] == "low")

    return {
        **job,
        "progress": f"{job['completed']}/{job['total']}",
        "summary": {"high": high, "medium": medium, "low": low},
    }


@router.post("/v1/verify")
async def verify_address(req: VerifyRequest):
    """Synchronous single-address scoring."""
    result = score_addresses([req.address])
    return result[0]

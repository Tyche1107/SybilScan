from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel
from services.jobs import create_job, get_job, run_job

router = APIRouter()


class ScoreRequest(BaseModel):
    addresses: list[str]
    threshold: float = 0.5


class VerifyRequest(BaseModel):
    address: str


@router.post("/v1/score")
async def score(req: ScoreRequest, background_tasks: BackgroundTasks):
    jid = create_job(req.addresses)
    background_tasks.add_task(run_job, jid)
    return {"job_id": jid, "status": "pending", "total": len(req.addresses)}


@router.get("/v1/jobs/{job_id}")
def job_status(job_id: str):
    j = get_job(job_id)
    if not j:
        return {"error": "not found"}, 404
    summary = {
        "total": j["total"],
        "high": sum(1 for r in j["results"] if r["risk"] == "high"),
        "medium": sum(1 for r in j["results"] if r["risk"] == "medium"),
        "low": sum(1 for r in j["results"] if r["risk"] == "low"),
    }
    return {**j, "progress": j["completed"] / max(j["total"], 1), "summary": summary}


@router.post("/v1/verify")
def verify(req: VerifyRequest):
    from services.model import score_addresses
    return score_addresses([req.address])[0]

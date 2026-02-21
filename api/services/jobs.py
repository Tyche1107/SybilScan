"""In-memory job store for async batch scoring."""

import asyncio
import uuid
from datetime import datetime, timezone

from .model import score_addresses

# ---------------------------------------------------------------------------
# In-memory store
# ---------------------------------------------------------------------------
jobs: dict[str, dict] = {}


def create_job(addresses: list[str]) -> str:
    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "job_id": job_id,
        "status": "pending",
        "addresses": addresses,
        "results": [],
        "total": len(addresses),
        "completed": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": None,
    }
    return job_id


def get_job(job_id: str) -> dict | None:
    return jobs.get(job_id)


async def run_job(job_id: str) -> None:
    job = jobs.get(job_id)
    if job is None:
        return

    job["status"] = "running"
    addresses = job["addresses"]
    batch_size = 1000

    for i in range(0, len(addresses), batch_size):
        batch = addresses[i : i + batch_size]
        # Run synchronous scoring in the default executor to avoid blocking
        loop = asyncio.get_event_loop()
        batch_results = await loop.run_in_executor(None, score_addresses, batch)
        job["results"].extend(batch_results)
        job["completed"] += len(batch_results)
        # Yield control between batches
        await asyncio.sleep(0)

    job["status"] = "complete"
    job["completed_at"] = datetime.now(timezone.utc).isoformat()

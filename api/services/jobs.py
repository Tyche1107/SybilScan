import uuid
import asyncio
import datetime

jobs = {}


def create_job(addresses: list, chain: str = "eth") -> str:
    jid = str(uuid.uuid4())
    jobs[jid] = {
        "job_id":    jid,
        "status":    "pending",
        "chain":     chain,
        "addresses": addresses,
        "results":   [],
        "total":     len(addresses),
        "completed": 0,
        "created_at":   datetime.datetime.utcnow().isoformat(),
        "completed_at": None,
    }
    return jid


def get_job(job_id: str):
    return jobs.get(job_id)


async def run_job(job_id: str):
    from services.model import score_addresses
    j = jobs[job_id]
    j["status"] = "running"
    chain = j.get("chain", "eth")
    addrs = j["addresses"]
    for i in range(0, len(addrs), 500):
        batch = addrs[i:i+500]
        j["results"].extend(score_addresses(batch))
        j["completed"] += len(batch)
        await asyncio.sleep(0)
    j["status"] = "complete"
    j["completed_at"] = datetime.datetime.utcnow().isoformat()

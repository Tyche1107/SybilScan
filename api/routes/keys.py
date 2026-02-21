from fastapi import APIRouter, Header
from pydantic import BaseModel
from services.auth import generate_key, validate_key

router = APIRouter()


class KeyRequest(BaseModel):
    name: str


@router.post("/v1/keys")
def create_key(req: KeyRequest):
    key = generate_key(req.name)
    import datetime
    return {"key": key, "name": req.name, "created_at": datetime.datetime.utcnow().isoformat()}


@router.get("/v1/keys/validate")
def validate(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        return {"valid": False}
    key = authorization[7:]
    info = validate_key(key)
    return {"valid": bool(info), **(info or {})}

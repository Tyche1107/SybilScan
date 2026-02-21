"""API key management endpoints."""

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from services.auth import generate_key, validate_key

router = APIRouter()


class KeyRequest(BaseModel):
    name: str


@router.post("/v1/keys")
async def create_key(req: KeyRequest):
    """Generate a new API key for a named project."""
    key = generate_key(req.name)
    return {"key": key, "name": req.name}


@router.get("/v1/keys/validate")
async def check_key(authorization: str = Header(...)):
    """Validate an API key supplied as 'Authorization: Bearer sk-...'."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authorization header must use Bearer scheme")
    key = authorization.removeprefix("Bearer ").strip()
    meta = validate_key(key)
    if meta is None:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return {"valid": True, **meta}

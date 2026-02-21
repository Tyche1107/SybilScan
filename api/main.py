"""SybilScan FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes.keys import router as keys_router
from routes.score import router as score_router
from services.model import score_addresses


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Warm up: ensure models are loaded and JIT-compiled before first request
    score_addresses(["0x0000000000000000000000000000000000000000"])
    yield


app = FastAPI(
    title="SybilScan API",
    description="Pre-airdrop sybil detection scoring service",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(score_router)
app.include_router(keys_router)


@app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": True}

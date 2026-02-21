from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.score import router as score_router
from routes.keys import router as keys_router

app = FastAPI(title="SybilScan API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(score_router)
app.include_router(keys_router)


@app.get("/health")
def health():
    from services.model import lgb_model
    return {"status": "ok", "model_loaded": lgb_model is not None}

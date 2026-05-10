from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from config import ensure_runtime_dirs
from database import init_db, database
from routers import corpus, parsing, experiments, detectors, ollama


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_runtime_dirs()
    await init_db()
    await database.connect()
    yield
    await database.disconnect()


app = FastAPI(title="NLP Eval Platform", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(corpus.router, prefix="/api/corpus", tags=["corpus"])
app.include_router(parsing.router, prefix="/api/parse", tags=["parsing"])
app.include_router(experiments.router, prefix="/api/experiments", tags=["experiments"])
app.include_router(detectors.router, prefix="/api/detectors", tags=["detectors"])
app.include_router(ollama.router, prefix="/api/ollama", tags=["ollama"])


@app.get("/api/health", tags=["system"])
async def health():
    return {"ok": True, "service": "nlp-eval-platform"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

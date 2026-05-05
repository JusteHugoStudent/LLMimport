from fastapi import APIRouter

from models import OllamaGenerateRequest, OllamaStatus, OllamaModel
from services.ollama_service import check_status, list_models, generate

router = APIRouter()


@router.get("/status", response_model=OllamaStatus)
async def ollama_status():
    return await check_status()


@router.get("/models", response_model=list[OllamaModel])
async def ollama_models():
    return await list_models()


@router.post("/generate")
async def ollama_generate(req: OllamaGenerateRequest):
    response = await generate(req.model, req.prompt, req.temperature)
    return {"response": response}

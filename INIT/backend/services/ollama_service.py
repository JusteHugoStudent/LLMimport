import httpx
import logging

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL = "http://localhost:11434"


async def check_status() -> dict:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            if resp.status_code == 200:
                data = resp.json()
                models = [m["name"] for m in data.get("models", [])]
                return {"available": True, "models": models}
    except Exception as e:
        logger.warning(f"Ollama not available: {e}")
    return {"available": False, "models": []}


async def list_models() -> list:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            if resp.status_code == 200:
                data = resp.json()
                return [
                    {
                        "name": m["name"],
                        "size": m.get("size"),
                        "modified_at": m.get("modified_at"),
                    }
                    for m in data.get("models", [])
                ]
    except Exception as e:
        logger.warning(f"Failed to list Ollama models: {e}")
    return []


async def generate(model: str, prompt: str, temperature: float = 0.1,
                   timeout: float = 120.0, num_predict: int = 150) -> str:
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                f"{OLLAMA_BASE_URL}/api/generate",
                json={
                    "model": model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": temperature,
                        "num_predict": num_predict,
                    },
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                return data.get("response", "")
            else:
                logger.error(f"Ollama generate error: {resp.status_code} {resp.text}")
                return f"Error: {resp.status_code}"
    except httpx.TimeoutException:
        return "Error: timeout"
    except Exception as e:
        logger.error(f"Ollama generate exception: {e}")
        return f"Error: {str(e)}"

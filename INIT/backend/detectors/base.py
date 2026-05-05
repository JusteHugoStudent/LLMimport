from abc import ABC, abstractmethod
from typing import List, Dict, Any
from models import DetectionResult


class BaseDetector(ABC):
    name: str = ""
    description: str = ""
    is_implemented: bool = False

    @abstractmethod
    async def detect(self, sentences: List[Dict[str, Any]]) -> List[DetectionResult]:
        pass

    @abstractmethod
    def get_config_schema(self) -> dict:
        pass

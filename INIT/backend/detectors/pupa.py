from typing import List, Dict, Any
from detectors.base import BaseDetector
from models import DetectionResult


class PUPADetector(BaseDetector):
    name = "pupa"
    description = "PUPA : méthode classique de filtrage d'analyses syntaxiques"
    is_implemented = False

    async def detect(self, sentences: List[Dict[str, Any]]) -> List[DetectionResult]:
        raise NotImplementedError("PUPA detector not yet implemented. Please add the implementation.")

    def get_config_schema(self) -> dict:
        return {}

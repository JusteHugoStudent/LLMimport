from typing import List, Dict, Any
from detectors.base import BaseDetector
from models import DetectionResult


class SVMDetector(BaseDetector):
    name = "svm"
    description = "SVM : classification supervisée avec extraction de features linguistiques"
    is_implemented = False

    async def detect(self, sentences: List[Dict[str, Any]]) -> List[DetectionResult]:
        raise NotImplementedError("SVM detector not yet implemented. Please add the implementation.")

    def get_config_schema(self) -> dict:
        return {}

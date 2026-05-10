from fastapi import APIRouter, HTTPException

from models import DetectorInfo, DetectorTestRequest
from detectors.llm_judge import LLMJudgeDetector
from detectors.ulisse import ULISSEDetector
from detectors.svm_detector import SVMDetector
from detectors.pupa import PUPADetector

router = APIRouter()

ALL_DETECTORS = [
    LLMJudgeDetector(),
    ULISSEDetector(),
    SVMDetector(),
    PUPADetector(),
]


@router.get("", response_model=list[DetectorInfo])
async def list_detectors():
    return [
        DetectorInfo(
            name=d.name,
            description=d.description,
            is_implemented=d.is_implemented,
            config_schema=d.get_config_schema(),
        )
        for d in ALL_DETECTORS
    ]


@router.post("/test")
async def test_detector(req: DetectorTestRequest):
    detector_map = {d.name: d for d in ALL_DETECTORS}
    if req.detector_name not in detector_map:
        raise HTTPException(status_code=404, detail=f"Détecteur '{req.detector_name}' non trouvé")

    det = detector_map[req.detector_name]
    if not det.is_implemented:
        raise HTTPException(status_code=400, detail=f"Le détecteur '{req.detector_name}' n'est pas encore implémenté")

    # Recreate with params for configurable detectors
    if req.detector_name == "llm_judge":
        det = LLMJudgeDetector(**req.params)
    elif req.detector_name == "ulisse":
        det = ULISSEDetector(**req.params)
    elif req.detector_name == "svm":
        det = SVMDetector(**req.params)
    elif req.detector_name == "pupa":
        det = PUPADetector(**req.params)

    try:
        results = await det.detect([req.sentence])
        if results:
            r = results[0]
            return r.model_dump() if hasattr(r, "model_dump") else r
        raise HTTPException(status_code=500, detail="Aucun résultat retourné")
    except NotImplementedError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

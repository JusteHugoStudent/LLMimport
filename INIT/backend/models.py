from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime


# --- Corpus ---

class CorpusOut(BaseModel):
    id: str
    name: str
    num_sentences: int
    num_tokens: int
    created_at: Optional[str] = None


class CorpusDetail(CorpusOut):
    filepath: str


class TokenOut(BaseModel):
    id: Any
    form: str
    lemma: str
    upos: str
    xpos: str
    feats: Optional[str] = None
    head: Any
    deprel: str
    deps: Optional[str] = None
    misc: Optional[str] = None


class SentenceOut(BaseModel):
    id: str
    text: str
    num_tokens: int


class SentenceDetail(BaseModel):
    id: str
    text: str
    tokens: List[TokenOut]


class SentencePage(BaseModel):
    sentences: List[SentenceOut]
    total: int
    page: int
    per_page: int


class LengthStats(BaseModel):
    mean: float
    median: float
    min: int
    max: int


class PosDeprelCombo(BaseModel):
    pos: str
    deprel: str
    count: int


class CorpusStats(BaseModel):
    num_sentences: int
    num_tokens: int
    length_stats: LengthStats
    avg_tree_depth: float
    pos_distribution: Dict[str, int]
    deprel_distribution: Dict[str, int]
    top_pos_deprel: List[PosDeprelCombo]


# --- Error Injection ---

class ErrorConfig(BaseModel):
    error_rate: float = 0.1
    error_types: List[str] = ["head", "deprel", "pos"]
    seed: int = 42
    errors_per_sentence: int = 1


class TokenError(BaseModel):
    token_id: int
    error_type: str
    original_value: str
    corrupted_value: str


class SentenceGroundTruth(BaseModel):
    sentence_id: str
    has_error: bool
    errors: List[TokenError]


# --- Detectors ---

class DetectionResult(BaseModel):
    sentence_id: str
    is_correct: bool
    confidence: float
    details: Dict[str, Any] = {}


class DetectorInfo(BaseModel):
    name: str
    description: str
    is_implemented: bool
    config_schema: Dict[str, Any]


class DetectorTestRequest(BaseModel):
    detector_name: str
    params: Dict[str, Any] = {}
    sentence: Dict[str, Any]


# --- Experiments ---

class ExperimentCreate(BaseModel):
    name: str
    corpus_id: str
    max_sentences: Optional[int] = None
    sample_random: bool = False
    sample_seed: Optional[int] = None
    error_config: ErrorConfig
    detectors_config: List[Dict[str, Any]]


class ExperimentOut(BaseModel):
    id: str
    name: str
    corpus_id: str
    status: str
    progress: float
    created_at: Optional[str] = None


class ExperimentDetail(ExperimentOut):
    error_config: Dict[str, Any]
    detectors_config: List[Dict[str, Any]]
    completed_at: Optional[str] = None
    results: Optional[Dict[str, Any]] = None


class ExperimentProgress(BaseModel):
    status: str
    progress: float
    current_step: str = ""
    phase: Optional[str] = None
    message: Optional[str] = None
    detector: Optional[str] = None
    detector_label: Optional[str] = None
    detector_index: Optional[int] = None
    detector_total: Optional[int] = None
    item_index: Optional[int] = None
    item_total: Optional[int] = None
    batch_index: Optional[int] = None
    batch_total: Optional[int] = None
    current_sentence_id: Optional[str] = None
    current_sentence_text: Optional[str] = None
    elapsed_seconds: Optional[float] = None
    eta_seconds: Optional[float] = None
    started_at: Optional[str] = None
    updated_at: Optional[str] = None
    events: List[Dict[str, Any]] = Field(default_factory=list)
    dataset: Optional[Dict[str, Any]] = None


# --- Parsing ---

class ParseTextRequest(BaseModel):
    text: str


class ParseCorpusRequest(BaseModel):
    sentences: List[str]
    name: Optional[str] = None


# --- Ollama ---

class OllamaGenerateRequest(BaseModel):
    model: str
    prompt: str
    temperature: float = 0.1


class OllamaStatus(BaseModel):
    available: bool
    models: List[str] = []
    base_url: str = "http://localhost:11434"


class OllamaModel(BaseModel):
    name: str
    size: Optional[int] = None
    modified_at: Optional[str] = None

"""
Supervised SVM baseline for sentence-level parse-quality estimation.

This is not an absolute upper bound and not a direct reproduction of the
dependency-level selection model from Jin, Kawahara & Kurohashi (2013). It is a
project baseline: clean reference parses are labelled acceptable, a deterministic
injected-error copy is labelled erroneous, and the trained classifier is applied
to the experiment corpus after its own injection step.
"""

from __future__ import annotations

from collections import Counter
from typing import Any, Dict, List, Optional, Tuple
import math
import random

from detectors.base import BaseDetector
from detectors.pupa import PUPAScorer, _structural_issues, _tokens
from models import DetectionResult
from services.error_injector import inject_errors


UPOS_ORDER = [
    "NOUN", "VERB", "ADJ", "ADV", "ADP", "AUX", "CCONJ", "DET", "NUM",
    "PART", "PRON", "PROPN", "PUNCT", "SCONJ",
]

DEPREL_ORDER = [
    "nsubj", "obj", "iobj", "csubj", "ccomp", "xcomp", "obl", "advcl",
    "advmod", "aux", "cop", "mark", "nmod", "appos", "nummod", "acl",
    "amod", "det", "case", "conj", "cc", "fixed", "flat", "compound",
    "punct", "root", "dep",
]


def _safe_div(num: float, den: float) -> float:
    return num / den if den else 0.0


def _entropy(counter: Counter, total: int) -> float:
    if total <= 0:
        return 0.0
    value = 0.0
    for count in counter.values():
        p = count / total
        if p > 0:
            value -= p * math.log(p)
    return value


class ParseFeatureExtractor:
    def __init__(self, pupa_scorer: Optional[PUPAScorer] = None):
        self.pupa_scorer = pupa_scorer
        self.feature_names = self._build_feature_names()

    @staticmethod
    def _build_feature_names() -> List[str]:
        names = [
            "length",
            "log_length",
            "root_count",
            "no_root",
            "multiple_roots",
            "invalid_head_ratio",
            "root_deprel_error_ratio",
            "cycle_token_ratio",
            "max_depth",
            "avg_dependency_distance",
            "max_dependency_distance",
            "left_arc_ratio",
            "punct_ratio",
            "upos_entropy",
            "deprel_entropy",
            "pupa_quality_score",
            "pupa_avg_cost",
            "pupa_unseen_arc_ratio",
            "pupa_structural_penalty",
        ]
        names.extend(f"upos_ratio_{upos}" for upos in UPOS_ORDER)
        names.extend(f"deprel_ratio_{deprel}" for deprel in DEPREL_ORDER)
        return names

    def transform_one(self, sentence: Dict[str, Any]) -> Tuple[List[float], Dict[str, Any]]:
        tokens = _tokens(sentence)
        length = len(tokens)
        token_by_id = {tok["id"]: tok for tok in tokens}
        issues = _structural_issues(tokens)

        distances = []
        left_arcs = 0
        for tok in tokens:
            head = tok.get("head", 0)
            if head and head in token_by_id:
                distance = tok["id"] - head
                distances.append(abs(distance))
                if distance > 0:
                    left_arcs += 1

        upos_counts = Counter(tok.get("upos", "_") for tok in tokens)
        deprel_counts = Counter(tok.get("deprel", "_") for tok in tokens)
        punct_count = upos_counts.get("PUNCT", 0)

        if self.pupa_scorer is not None:
            pupa_score, pupa_details = self.pupa_scorer.score_sentence(sentence)
        else:
            pupa_score, pupa_details = 0.5, {
                "avg_cost": 0.0,
                "unseen_arc_ratio": 0.0,
                "structural_penalty": 0.0,
            }

        values = [
            float(length),
            math.log1p(length),
            float(issues["root_count"]),
            1.0 if issues["no_root"] else 0.0,
            1.0 if issues["multiple_roots"] else 0.0,
            _safe_div(len(issues["invalid_heads"]), length),
            _safe_div(len(issues["root_deprel_errors"]), length),
            _safe_div(len(issues["cycle_tokens"]), length),
            float(issues["max_depth"]),
            _safe_div(sum(distances), len(distances)),
            float(max(distances) if distances else 0),
            _safe_div(left_arcs, len(distances)),
            _safe_div(punct_count, length),
            _entropy(upos_counts, length),
            _entropy(deprel_counts, length),
            float(pupa_score),
            float(pupa_details.get("avg_cost", 0.0)),
            float(pupa_details.get("unseen_arc_ratio", 0.0)),
            float(pupa_details.get("structural_penalty", 0.0)),
        ]
        values.extend(_safe_div(upos_counts.get(upos, 0), length) for upos in UPOS_ORDER)
        values.extend(_safe_div(deprel_counts.get(deprel, 0), length) for deprel in DEPREL_ORDER)

        details = {
            "num_tokens": length,
            "pupa_quality_score": round(pupa_score, 6),
            "pupa_avg_cost": pupa_details.get("avg_cost", 0.0),
            "pupa_unseen_arc_ratio": pupa_details.get("unseen_arc_ratio", 0.0),
            "structure": issues,
        }
        return values, details

    def transform(self, sentences: List[Dict[str, Any]]) -> Tuple[List[List[float]], List[Dict[str, Any]]]:
        rows = []
        details = []
        for sentence in sentences:
            features, detail = self.transform_one(sentence)
            rows.append(features)
            details.append(detail)
        return rows, details


class SVMDetector(BaseDetector):
    name = "svm"
    description = (
        "SVM : baseline supervisée au niveau phrase, entraînée sur une référence "
        "propre et une copie avec erreurs injectées."
    )
    is_implemented = True

    def __init__(
        self,
        reference_sentences: Optional[List[Dict[str, Any]]] = None,
        training_error_types: Optional[List[str]] = None,
        training_seed: int = 1042,
        errors_per_sentence: int = 1,
        max_train_sentences: int = 1000,
        c_value: float = 0.5,
        decision_threshold: float = 0.5,
        auto_threshold: bool = True,
        alpha: float = 0.1,
    ):
        self.reference_sentences = reference_sentences or []
        self.training_error_types = training_error_types or ["head", "deprel", "pos", "combined"]
        self.training_seed = int(training_seed)
        self.errors_per_sentence = max(1, int(errors_per_sentence))
        self.max_train_sentences = max(1, int(max_train_sentences))
        self.c_value = float(c_value)
        self.decision_threshold = float(decision_threshold)
        self.auto_threshold = bool(auto_threshold)
        self.alpha = float(alpha)
        self.feature_names: List[str] = []
        self.training_summary: Dict[str, Any] = {}
        self.trained_decision_threshold = decision_threshold

    def get_config_schema(self) -> dict:
        return {
            "max_train_sentences": {
                "type": "integer",
                "default": 1000,
                "min": 50,
                "max": 20000,
                "description": "Nombre maximal de phrases propres utilisées pour entraîner le SVM.",
            },
            "c_value": {
                "type": "number",
                "default": 0.5,
                "min": 0.01,
                "max": 100.0,
                "description": "Paramètre C du SVM linéaire.",
            },
            "decision_threshold": {
                "type": "number",
                "default": 0.5,
                "min": 0.01,
                "max": 0.99,
                "description": "Seuil de probabilité d'erreur à partir duquel l'analyse de la phrase est rejetée.",
            },
            "auto_threshold": {
                "type": "boolean",
                "default": True,
                "description": "Calibre automatiquement le seuil sur le jeu d'entraînement injecté.",
            },
        }

    def _sample_reference(self, sentences: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if self.max_train_sentences <= 0 or len(sentences) <= self.max_train_sentences:
            return list(sentences)
        rng = random.Random(self.training_seed)
        indices = sorted(rng.sample(range(len(sentences)), self.max_train_sentences))
        return [sentences[index] for index in indices]

    def _train(self, reference_sentences: List[Dict[str, Any]]):
        from sklearn.pipeline import make_pipeline
        from sklearn.preprocessing import StandardScaler
        from sklearn.svm import LinearSVC

        train_clean = self._sample_reference(reference_sentences)
        train_corrupted, train_truth = inject_errors(
            train_clean,
            error_rate=1.0,
            error_types=self.training_error_types,
            seed=self.training_seed,
            errors_per_sentence=self.errors_per_sentence,
        )

        positive_corrupted = [
            sentence
            for sentence, truth in zip(train_corrupted, train_truth)
            if truth.get("has_error")
        ]
        if not positive_corrupted:
            positive_corrupted = train_corrupted

        pupa_scorer = PUPAScorer(alpha=self.alpha)
        pupa_scorer.fit(train_clean)
        extractor = ParseFeatureExtractor(pupa_scorer=pupa_scorer)
        clean_x, _ = extractor.transform(train_clean)
        corrupted_x, _ = extractor.transform(positive_corrupted)
        x_train = clean_x + corrupted_x
        y_train = [0] * len(clean_x) + [1] * len(corrupted_x)

        model = make_pipeline(
            StandardScaler(),
            LinearSVC(
                C=self.c_value,
                class_weight="balanced",
                dual="auto",
                max_iter=10000,
                random_state=self.training_seed,
            ),
        )
        model.fit(x_train, y_train)
        train_error_probabilities = [self._sigmoid(float(value)) for value in model.decision_function(x_train)]
        self.trained_decision_threshold = (
            self._best_training_threshold(train_error_probabilities, y_train)
            if self.auto_threshold
            else self.decision_threshold
        )
        self.feature_names = extractor.feature_names
        self.training_summary = {
            "clean_examples": len(clean_x),
            "corrupted_examples": len(corrupted_x),
            "reference_sentences": len(reference_sentences),
            "sampled_reference_sentences": len(train_clean),
            "training_error_types": self.training_error_types,
            "training_seed": self.training_seed,
            "errors_per_sentence": self.errors_per_sentence,
            "auto_threshold": self.auto_threshold,
            "trained_decision_threshold": round(self.trained_decision_threshold, 6),
        }
        return model, extractor

    @staticmethod
    def _sigmoid(value: float) -> float:
        value = max(-60.0, min(60.0, value))
        return 1.0 / (1.0 + math.exp(-value))

    @staticmethod
    def _best_training_threshold(probabilities: List[float], labels: List[int]) -> float:
        candidates = sorted(set(round(p, 4) for p in probabilities))
        if not candidates:
            return 0.5

        best_threshold = 0.5
        best_f1 = -1.0
        for threshold in candidates:
            tp = fp = fn = 0
            for probability, label in zip(probabilities, labels):
                predicted = probability >= threshold
                if label == 1 and predicted:
                    tp += 1
                elif label == 0 and predicted:
                    fp += 1
                elif label == 1 and not predicted:
                    fn += 1
            precision = tp / (tp + fp) if tp + fp else 0.0
            recall = tp / (tp + fn) if tp + fn else 0.0
            f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
            if f1 > best_f1 or (math.isclose(f1, best_f1) and threshold > best_threshold):
                best_f1 = f1
                best_threshold = threshold

        return best_threshold

    def _top_feature_contributions(self, model, features: List[float], limit: int = 5) -> List[Dict[str, Any]]:
        try:
            linear = model.named_steps["linearsvc"]
            scaler = model.named_steps["standardscaler"]
            scaled = scaler.transform([features])[0]
            coefficients = linear.coef_[0]
            contributions = coefficients * scaled
            ranked = sorted(
                enumerate(contributions),
                key=lambda item: abs(item[1]),
                reverse=True,
            )[:limit]
            return [
                {
                    "feature": self.feature_names[index],
                    "contribution": round(float(value), 4),
                }
                for index, value in ranked
            ]
        except Exception:
            return []

    async def detect(self, sentences: List[Dict[str, Any]], progress_callback=None) -> List[DetectionResult]:
        if not sentences:
            return []

        stats_sentences = self.reference_sentences or sentences
        stats_source = "reference" if self.reference_sentences else "target"
        model, extractor = self._train(stats_sentences)
        x_rows, feature_details = extractor.transform(sentences)
        decisions = model.decision_function(x_rows)

        results: List[DetectionResult] = []
        for index, (sentence, features, details, decision) in enumerate(
            zip(sentences, x_rows, feature_details, decisions),
            1,
        ):
            error_probability = self._sigmoid(float(decision))
            decision_threshold = self.trained_decision_threshold if self.auto_threshold else self.decision_threshold
            predicted_error = error_probability >= decision_threshold
            confidence = error_probability if predicted_error else 1.0 - error_probability
            results.append(DetectionResult(
                sentence_id=sentence.get("id", ""),
                is_correct=not predicted_error,
                confidence=round(max(0.0, min(1.0, confidence)), 4),
                details={
                    **details,
                    "error_probability": round(error_probability, 6),
                    "decision_score": round(float(decision), 6),
                    "decision_threshold": round(decision_threshold, 6),
                    "auto_threshold": self.auto_threshold,
                    "stats_source": stats_source,
                    "training": self.training_summary,
                    "top_feature_contributions": self._top_feature_contributions(model, features),
                },
            ))

            if progress_callback and (index == 1 or index == len(sentences) or index % 10 == 0):
                await progress_callback({
                    "completed": index,
                    "total": len(sentences),
                    "current_sentence_id": sentence.get("id", ""),
                    "current_sentence_text": sentence.get("text", ""),
                })

        return results

"""
PUPA-inspired unsupervised parse assessment.

The original PUPA algorithm (Reichart & Rappoport, 2009) scores parse quality
from POS sequence regularities in a batch of parsed sentences. Our project uses
UD dependency trees, so this module is an explicit dependency-oriented
adaptation: it learns local UPOS/DEPREL/head patterns from a clean reference
corpus, then flags parses whose configurations are statistically atypical.
"""

from __future__ import annotations

from collections import Counter
from typing import Any, Dict, List, Optional, Tuple
import math

from detectors.base import BaseDetector
from models import DetectionResult


def _tokens(sentence: Dict[str, Any]) -> List[Dict[str, Any]]:
    return [tok for tok in sentence.get("tokens", []) if isinstance(tok.get("id"), int)]


def _distance_bucket(distance: int) -> str:
    distance = abs(distance)
    if distance <= 1:
        return "1"
    if distance <= 3:
        return "2-3"
    if distance <= 6:
        return "4-6"
    return "7+"


def _structural_issues(tokens: List[Dict[str, Any]]) -> Dict[str, Any]:
    ids = {tok["id"] for tok in tokens}
    token_by_id = {tok["id"]: tok for tok in tokens}
    roots = [tok for tok in tokens if tok.get("head") == 0]
    invalid_heads = [
        tok["id"]
        for tok in tokens
        if tok.get("head") not in ids and tok.get("head") != 0
    ]
    root_deprel_errors = [
        tok["id"]
        for tok in tokens
        if (tok.get("head") == 0 and tok.get("deprel") != "root")
        or (tok.get("head") != 0 and tok.get("deprel") == "root")
    ]

    cycle_tokens = set()
    max_depth = 0
    for tok in tokens:
        seen = set()
        current = tok
        depth = 0
        while current and current.get("head") not in (0, None):
            current_id = current["id"]
            if current_id in seen:
                cycle_tokens.update(seen)
                break
            seen.add(current_id)
            depth += 1
            current = token_by_id.get(current.get("head"))
        max_depth = max(max_depth, depth)

    return {
        "root_count": len(roots),
        "no_root": len(roots) == 0,
        "multiple_roots": len(roots) > 1,
        "invalid_heads": invalid_heads,
        "root_deprel_errors": root_deprel_errors,
        "cycle_tokens": sorted(cycle_tokens),
        "max_depth": max_depth,
    }


class PUPAScorer:
    def __init__(self, alpha: float = 0.1):
        self.alpha = max(alpha, 1e-6)
        self.total_tokens = 0
        self.total_arcs = 0
        self.total_roots = 0
        self.total_bigrams = 0
        self.upos = Counter()
        self.deprel = Counter()
        self.root_upos = Counter()
        self.dep_pos_rel = Counter()
        self.head_pos_rel = Counter()
        self.arc = Counter()
        self.arc_distance = Counter()
        self.pos_bigrams = Counter()
        self.vocab_sizes: Dict[str, int] = {}

    def fit(self, sentences: List[Dict[str, Any]]) -> None:
        for sentence in sentences:
            tokens = _tokens(sentence)
            token_by_id = {tok["id"]: tok for tok in tokens}
            previous_pos: Optional[str] = None

            for tok in tokens:
                pos = tok.get("upos", "_")
                rel = tok.get("deprel", "_")
                self.upos[pos] += 1
                self.deprel[rel] += 1
                self.total_tokens += 1

                if previous_pos is not None:
                    self.pos_bigrams[(previous_pos, pos)] += 1
                    self.total_bigrams += 1
                previous_pos = pos

                head_id = tok.get("head", 0)
                if head_id == 0:
                    self.root_upos[pos] += 1
                    self.total_roots += 1
                    continue

                head = token_by_id.get(head_id)
                if not head:
                    continue
                head_pos = head.get("upos", "_")
                bucket = _distance_bucket(tok["id"] - head_id)
                self.dep_pos_rel[(pos, rel)] += 1
                self.head_pos_rel[(head_pos, rel)] += 1
                self.arc[(pos, head_pos, rel)] += 1
                self.arc_distance[(pos, head_pos, rel, bucket)] += 1
                self.total_arcs += 1

        self.vocab_sizes = {
            "upos": max(len(self.upos), 1),
            "deprel": max(len(self.deprel), 1),
            "root_upos": max(len(self.root_upos), 1),
            "dep_pos_rel": max(len(self.dep_pos_rel), 1),
            "head_pos_rel": max(len(self.head_pos_rel), 1),
            "arc": max(len(self.arc), 1),
            "arc_distance": max(len(self.arc_distance), 1),
            "pos_bigrams": max(len(self.pos_bigrams), 1),
        }

    def _prob(self, counter: Counter, key: Any, total: int, vocab_name: str) -> float:
        vocab = self.vocab_sizes.get(vocab_name, 1)
        return (counter.get(key, 0) + self.alpha) / (total + self.alpha * vocab)

    @staticmethod
    def _cost(probability: float) -> float:
        return -math.log(max(probability, 1e-12))

    def score_sentence(self, sentence: Dict[str, Any]) -> Tuple[float, Dict[str, Any]]:
        tokens = _tokens(sentence)
        if not tokens:
            return 0.0, {
                "avg_cost": 99.0,
                "structural_penalty": 1.0,
                "suspect_tokens": [],
                "reason": "empty_sentence",
            }

        issues = _structural_issues(tokens)
        token_by_id = {tok["id"]: tok for tok in tokens}
        token_costs: List[Tuple[int, float, str]] = []
        costs: List[float] = []
        unseen_arcs = 0

        previous_pos: Optional[str] = None
        for tok in tokens:
            tok_id = tok["id"]
            pos = tok.get("upos", "_")
            rel = tok.get("deprel", "_")

            pos_cost = self._cost(self._prob(self.upos, pos, self.total_tokens, "upos"))
            rel_cost = self._cost(self._prob(self.deprel, rel, self.total_tokens, "deprel"))
            local_cost = 0.25 * pos_cost + 0.25 * rel_cost

            if previous_pos is not None:
                bigram = (previous_pos, pos)
                local_cost += 0.15 * self._cost(
                    self._prob(self.pos_bigrams, bigram, self.total_bigrams, "pos_bigrams")
                )
            previous_pos = pos

            head_id = tok.get("head", 0)
            if head_id == 0:
                local_cost += 0.35 * self._cost(
                    self._prob(self.root_upos, pos, self.total_roots, "root_upos")
                )
                token_costs.append((tok_id, local_cost, "root_upos"))
                costs.append(local_cost)
                continue

            head = token_by_id.get(head_id)
            if not head:
                local_cost += 10.0
                token_costs.append((tok_id, local_cost, "invalid_head"))
                costs.append(local_cost)
                continue

            head_pos = head.get("upos", "_")
            bucket = _distance_bucket(tok_id - head_id)
            arc_key = (pos, head_pos, rel)
            if self.arc.get(arc_key, 0) == 0:
                unseen_arcs += 1

            local_cost += 0.55 * self._cost(
                self._prob(self.dep_pos_rel, (pos, rel), self.total_arcs, "dep_pos_rel")
            )
            local_cost += 0.55 * self._cost(
                self._prob(self.head_pos_rel, (head_pos, rel), self.total_arcs, "head_pos_rel")
            )
            local_cost += 0.9 * self._cost(
                self._prob(self.arc, arc_key, self.total_arcs, "arc")
            )
            local_cost += 0.25 * self._cost(
                self._prob(self.arc_distance, (*arc_key, bucket), self.total_arcs, "arc_distance")
            )
            token_costs.append((tok_id, local_cost, "arc_pos_deprel"))
            costs.append(local_cost)

        hard_penalty = 0.0
        if issues["no_root"]:
            hard_penalty += 4.0
        if issues["multiple_roots"]:
            hard_penalty += 1.5 * (issues["root_count"] - 1)
        hard_penalty += 2.5 * len(issues["invalid_heads"])
        hard_penalty += 2.0 * len(issues["root_deprel_errors"])
        hard_penalty += 2.5 * len(issues["cycle_tokens"])

        avg_cost = (sum(costs) + hard_penalty) / max(len(costs), 1)
        score = math.exp(-avg_cost / 5.0)
        score = max(0.0, min(1.0, score))
        suspect_tokens = [
            token_id
            for token_id, _, _ in sorted(token_costs, key=lambda item: item[1], reverse=True)[:5]
        ]
        suspect_tokens.extend(issues["invalid_heads"])
        suspect_tokens.extend(issues["root_deprel_errors"])
        suspect_tokens.extend(issues["cycle_tokens"])

        return score, {
            "avg_cost": round(avg_cost, 4),
            "structural_penalty": round(hard_penalty, 4),
            "unseen_arc_ratio": round(unseen_arcs / max(1, len(tokens)), 4),
            "suspect_tokens": sorted(set(suspect_tokens)),
            "token_costs": [
                {"token_id": token_id, "cost": round(cost, 4), "feature": feature}
                for token_id, cost, feature in sorted(token_costs, key=lambda item: item[1], reverse=True)[:8]
            ],
            "structure": issues,
        }


class PUPADetector(BaseDetector):
    name = "pupa"
    description = (
        "Baseline inspirée de PUPA : adaptation non supervisée aux dépendances UD, "
        "fondée sur la cohérence locale UPOS, têtes et DEPREL."
    )
    is_implemented = True

    def __init__(
        self,
        reference_sentences: Optional[List[Dict[str, Any]]] = None,
        threshold_percentile: float = 15.0,
        threshold_source: str = "target",
        alpha: float = 0.1,
    ):
        self.reference_sentences = reference_sentences or []
        self.threshold_percentile = float(threshold_percentile)
        self.threshold_source = threshold_source
        self.alpha = float(alpha)
        self.scorer: Optional[PUPAScorer] = None

    def get_config_schema(self) -> dict:
        return {
            "threshold_percentile": {
                "type": "number",
                "default": 15.0,
                "min": 1.0,
                "max": 99.0,
                "description": "Percentile du score de cohérence sous lequel une analyse est rejetée.",
            },
            "threshold_source": {
                "type": "string",
                "default": "target",
                "enum": ["target", "reference"],
                "description": "Distribution utilisée pour calibrer le seuil.",
            },
            "alpha": {
                "type": "number",
                "default": 0.1,
                "min": 0.001,
                "max": 10.0,
                "description": "Lissage additif des probabilités de motifs UPOS/DEPREL rares.",
            },
        }

    async def detect(self, sentences: List[Dict[str, Any]], progress_callback=None) -> List[DetectionResult]:
        if not sentences:
            return []

        stats_sentences = self.reference_sentences or sentences
        stats_source = "reference" if self.reference_sentences else "target"
        self.scorer = PUPAScorer(alpha=self.alpha)
        self.scorer.fit(stats_sentences)

        scored = []
        for index, sentence in enumerate(sentences, 1):
            score, details = self.scorer.score_sentence(sentence)
            scored.append((sentence, score, details))
            if progress_callback and (index == 1 or index == len(sentences) or index % 10 == 0):
                await progress_callback({
                    "completed": index,
                    "total": len(sentences),
                    "current_sentence_id": sentence.get("id", ""),
                    "current_sentence_text": sentence.get("text", ""),
                })

        threshold_scores = sorted(score for _, score, _ in scored)
        if self.threshold_source == "reference" and stats_sentences:
            threshold_scores = sorted(self.scorer.score_sentence(sentence)[0] for sentence in stats_sentences)
        if threshold_scores:
            index = max(0, int(len(threshold_scores) * self.threshold_percentile / 100) - 1)
            threshold = threshold_scores[index]
        else:
            threshold = 0.0

        min_score = min(score for _, score, _ in scored)
        max_score = max(score for _, score, _ in scored)
        score_range = max(max_score - min_score, 1e-9)

        results = []
        for sentence, score, details in scored:
            is_correct = score >= threshold
            normalized = (score - min_score) / score_range
            confidence = normalized if is_correct else 1.0 - normalized
            results.append(DetectionResult(
                sentence_id=sentence.get("id", ""),
                is_correct=is_correct,
                confidence=round(max(0.0, min(1.0, confidence)), 4),
                details={
                    "quality_score": round(score, 6),
                    "threshold": round(threshold, 6),
                    "threshold_percentile": self.threshold_percentile,
                    "threshold_source": self.threshold_source,
                    "stats_source": stats_source,
                    "stats_sentence_count": len(stats_sentences),
                    "num_tokens": len(_tokens(sentence)),
                    **details,
                },
            ))

        return results

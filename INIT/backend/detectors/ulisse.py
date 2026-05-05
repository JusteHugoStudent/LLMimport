"""
ULISSE — Unsupervised LInguiStically-driven Selection of dEpendency parses

Re-implementation based on:
  [1] Dell'Orletta, Venturi & Montemagni (2011). "ULISSE: an Unsupervised Algorithm
      for Detecting Reliable Dependency Parses". Proceedings of CoNLL 2011, pp. 115-124.
  [2] Dell'Orletta, Venturi & Montemagni (2013). "Unsupervised Linguistically-Driven
      Reliable Dependency Parses Detection and Self-Training for Adaptation to the
      Biomedical Domain". Proceedings of BioNLP 2013, pp. 45-53.

This module assigns a quality score (QS) to each dependency parse tree. A HIGH score
means the parse is likely RELIABLE (correct). A LOW score means the parse is likely
UNRELIABLE (contains errors).

For use as an error detector in the platform:
  - is_correct=True  -> high QS -> the parse looks reliable
  - is_correct=False -> low QS  -> the parse looks suspicious

The algorithm is fully unsupervised: it collects statistics from the corpus itself
(no gold annotations needed) and scores each sentence against those statistics.
"""

from typing import List, Dict, Any, Optional, Tuple
from collections import defaultdict, Counter
import math

from detectors.base import BaseDetector
from models import DetectionResult


# ============================================================================
# HELPER: Universal Dependencies linguistic utilities
# ============================================================================

VERBAL_POS = {"VERB", "AUX"}

SUBORDINATE_DEPRELS = {"advcl", "csubj", "ccomp", "acl", "acl:relcl", "csubj:pass"}

COMPLEMENT_CHAIN_DEPRELS = {"nmod", "nmod:poss", "amod", "appos"}

NOMINAL_POS = {"NOUN", "PROPN", "PRON", "NUM"}


def _matches_deprel(deprel: str, candidates: set) -> bool:
    if deprel in candidates:
        return True
    base = deprel.split(":")[0]
    return base in {candidate.split(":")[0] for candidate in candidates}


def _build_children_map(tokens: List[dict]) -> Dict[int, List[dict]]:
    children = defaultdict(list)
    for tok in tokens:
        head = tok.get("head")
        if head is not None and head >= 0:
            children[head].append(tok)
    return children


def _get_tree_depth(token_id: int, children_map: Dict[int, List[dict]], memo: dict) -> int:
    if token_id in memo:
        return memo[token_id]
    kids = children_map.get(token_id, [])
    if not kids:
        memo[token_id] = 0
        return 0
    max_child_depth = max(_get_tree_depth(k["id"], children_map, memo) for k in kids)
    memo[token_id] = 1 + max_child_depth
    return memo[token_id]


def _compute_parse_tree_depth(tokens: List[dict]) -> int:
    children_map = _build_children_map(tokens)
    roots = [tok for tok in tokens if tok.get("head") == 0]
    if not roots:
        return 0
    memo = {}
    return max(_get_tree_depth(r["id"], children_map, memo) for r in roots)


def _compute_complement_chain_depths(tokens: List[dict]) -> List[int]:
    children_map = _build_children_map(tokens)

    def _chain_depth(tok_id: int) -> int:
        kids = children_map.get(tok_id, [])
        complement_kids = [
            k for k in kids
            if _matches_deprel(k.get("deprel", ""), COMPLEMENT_CHAIN_DEPRELS)
        ]
        if not complement_kids:
            return 0
        return 1 + max(_chain_depth(k["id"]) for k in complement_kids)

    depths = []
    for tok in tokens:
        if tok.get("upos") in NOMINAL_POS:
            d = _chain_depth(tok["id"])
            if d > 0:
                depths.append(d)
    return depths


def _compute_verbal_root_ratio(tokens: List[dict]) -> float:
    roots = [tok for tok in tokens if tok.get("head") == 0]
    if not roots:
        return 0.0
    verbal_roots = [r for r in roots if r.get("upos") in VERBAL_POS]
    return len(verbal_roots) / len(roots)


def _compute_verbal_arity(tokens: List[dict]) -> List[int]:
    children_map = _build_children_map(tokens)
    arities = []
    for tok in tokens:
        if tok.get("upos") in VERBAL_POS:
            arities.append(len(children_map.get(tok["id"], [])))
    return arities


def _compute_subordination_features(tokens: List[dict]) -> dict:
    children_map = _build_children_map(tokens)

    sub_clauses = [
        tok for tok in tokens
        if _matches_deprel(tok.get("deprel", ""), SUBORDINATE_DEPRELS)
    ]

    roots = [tok for tok in tokens if tok.get("head") == 0]
    main_clauses = len([tok for tok in roots if tok.get("upos") in VERBAL_POS])
    if roots and main_clauses == 0:
        main_clauses = 1
    total_clauses = max(1, main_clauses + len(sub_clauses))
    subordinate_ratio = len(sub_clauses) / total_clauses

    preverbal = 0
    for sc in sub_clauses:
        head_id = sc.get("head", 0)
        if head_id > 0 and sc["id"] < head_id:
            preverbal += 1
    preverbal_ratio = preverbal / len(sub_clauses) if sub_clauses else 0.0

    def _sub_chain_depth(tok_id: int) -> int:
        kids = children_map.get(tok_id, [])
        sub_kids = [k for k in kids
                    if _matches_deprel(k.get("deprel", ""), SUBORDINATE_DEPRELS)]
        if not sub_kids:
            return 1
        return 1 + max(_sub_chain_depth(k["id"]) for k in sub_kids)

    sub_depths = [_sub_chain_depth(tok["id"]) for tok in sub_clauses]

    return {
        "subordinate_ratio": subordinate_ratio,
        "preverbal_ratio": preverbal_ratio,
        "subordinate_chain_depths": sub_depths,
    }


def _compute_avg_dependency_length(tokens: List[dict]) -> float:
    non_punct = [tok for tok in tokens if tok.get("upos") != "PUNCT"]
    if not non_punct:
        return 0.0
    lengths = []
    for tok in non_punct:
        head = tok.get("head", 0)
        if head > 0:
            lengths.append(abs(tok["id"] - head))
    return sum(lengths) / len(lengths) if lengths else 0.0


def _extract_arcs(tokens: List[dict]) -> List[Tuple[str, str, str, Optional[str], Optional[str]]]:
    token_by_id = {tok["id"]: tok for tok in tokens}
    arcs = []
    for tok in tokens:
        head_id = tok.get("head", 0)
        if head_id <= 0:
            continue
        head_tok = token_by_id.get(head_id)
        if head_tok is None:
            continue
        pd = tok.get("upos", "_")
        ph = head_tok.get("upos", "_")
        t = tok.get("deprel", "_")

        grandparent_id = head_tok.get("head", 0)
        if grandparent_id > 0 and grandparent_id in token_by_id:
            gp_tok = token_by_id[grandparent_id]
            ph2 = gp_tok.get("upos", "_")
            t2 = head_tok.get("deprel", "_")
        else:
            ph2 = "ROOT"
            t2 = "root"

        arcs.append((pd, ph, t, ph2, t2))
    return arcs


# ============================================================================
# ULISSE CORE ALGORITHM
# ============================================================================

class ULISSEScorer:
    """
    Core ULISSE scoring engine.

    Usage:
        scorer = ULISSEScorer(length_range=0)
        scorer.collect_statistics(all_sentences)
        score = scorer.score_sentence(sentence)
    """

    def __init__(self, length_range: int = 0, use_arc_lemma_feat: bool = False):
        self.r = length_range
        self.use_arc_lemma_feat = use_arc_lemma_feat

        self._global_feat_by_length: Dict[str, Dict[int, Counter]] = defaultdict(lambda: defaultdict(Counter))
        self._dist_feat_by_length: Dict[str, Dict[int, Counter]] = defaultdict(lambda: defaultdict(Counter))
        self._dist_totals_by_length: Dict[str, Counter] = defaultdict(Counter)
        self._length_counts: Counter = Counter()

        self._arc_freq: Counter = Counter()
        self._arc_pd_t_freq: Counter = Counter()
        self._arc_ph_t_freq: Counter = Counter()
        self._bigram_freq: Counter = Counter()
        self._parent_arc_freq: Counter = Counter()
        self._bigram_wild_freq: Counter = Counter()

        self._lem_arc_freq: Counter = Counter()
        self._lem_pd_t_freq: Counter = Counter()
        self._lem_ph_t_freq: Counter = Counter()
        self._lem_bigram_freq: Counter = Counter()
        self._lem_parent_freq: Counter = Counter()
        self._lem_bigram_wild_freq: Counter = Counter()

    def _collect_distribution_feature(self, feat_name: str, sent_len: int, values: List[int]) -> None:
        values = values or [0]
        for value in values:
            self._dist_feat_by_length[feat_name][sent_len][value] += 1
            self._dist_totals_by_length[feat_name][sent_len] += 1

    def collect_statistics(self, sentences: List[dict]) -> None:
        for sent in sentences:
            tokens = sent.get("tokens", [])
            if not tokens:
                continue

            sent_len = len(tokens)
            self._length_counts[sent_len] += 1

            tree_depth = _compute_parse_tree_depth(tokens)
            self._global_feat_by_length["tree_depth"][sent_len][tree_depth] += 1

            comp_depths = _compute_complement_chain_depths(tokens)
            avg_comp = round(sum(comp_depths) / len(comp_depths), 1) if comp_depths else 0
            self._global_feat_by_length["avg_complement_depth"][sent_len][avg_comp] += 1
            self._collect_distribution_feature("complement_depth_distribution", sent_len, comp_depths)

            vr = round(_compute_verbal_root_ratio(tokens), 2)
            self._global_feat_by_length["verbal_root_ratio"][sent_len][vr] += 1

            arities = _compute_verbal_arity(tokens)
            self._collect_distribution_feature("verbal_arity_distribution", sent_len, arities)

            sub_feats = _compute_subordination_features(tokens)
            sub_ratio_bin = round(sub_feats["subordinate_ratio"], 2)
            self._global_feat_by_length["subordinate_ratio"][sent_len][sub_ratio_bin] += 1
            preverbal_bin = round(sub_feats["preverbal_ratio"], 1)
            self._global_feat_by_length["preverbal_sub_ratio"][sent_len][preverbal_bin] += 1
            self._collect_distribution_feature(
                "subordinate_chain_depth_distribution",
                sent_len,
                sub_feats["subordinate_chain_depths"],
            )

            avg_dep_len = round(_compute_avg_dependency_length(tokens))
            self._global_feat_by_length["avg_dep_length"][sent_len][avg_dep_len] += 1

            arcs = _extract_arcs(tokens)
            for (pd, ph, t, ph2, t2) in arcs:
                self._arc_freq[(pd, ph, t)] += 1
                self._arc_pd_t_freq[(pd, t)] += 1
                self._arc_ph_t_freq[(ph, t)] += 1

                self._bigram_freq[((pd, ph, t), (ph, ph2, t2))] += 1
                self._parent_arc_freq[(ph, ph2, t2)] += 1
                self._bigram_wild_freq[((pd, t), (ph2, t2))] += 1

            if self.use_arc_lemma_feat:
                token_by_id = {tok["id"]: tok for tok in tokens}
                for tok in tokens:
                    head_id = tok.get("head", 0)
                    if head_id <= 0:
                        continue
                    head_tok = token_by_id.get(head_id)
                    if not head_tok:
                        continue
                    ld = tok.get("lemma", "_")
                    lh = head_tok.get("lemma", "_")
                    t = tok.get("deprel", "_")
                    self._lem_arc_freq[(ld, lh, t)] += 1
                    self._lem_pd_t_freq[(ld, t)] += 1
                    self._lem_ph_t_freq[(lh, t)] += 1

                    gp_id = head_tok.get("head", 0)
                    if gp_id > 0 and gp_id in token_by_id:
                        gp_tok = token_by_id[gp_id]
                        lh2 = gp_tok.get("lemma", "_")
                        t2 = head_tok.get("deprel", "_")
                    else:
                        lh2 = "ROOT"
                        t2 = "root"
                    self._lem_bigram_freq[((ld, lh, t), (lh, lh2, t2))] += 1
                    self._lem_parent_freq[(lh, lh2, t2)] += 1
                    self._lem_bigram_wild_freq[((ld, t), (lh2, t2))] += 1

    def _global_feature_weight(self, feat_name: str, feat_value, sent_len: int) -> float:
        lo = sent_len - self.r
        hi = sent_len + self.r

        total_in_range = 0
        matching_in_range = 0

        for length in range(lo, hi + 1):
            total_in_range += self._length_counts.get(length, 0)
            matching_in_range += self._global_feat_by_length[feat_name].get(length, Counter()).get(feat_value, 0)

        if total_in_range == 0:
            return 1e-6

        weight = matching_in_range / total_in_range
        return max(weight, 1e-6)

    def _distribution_feature_weight(self, feat_name: str, values: List[int], sent_len: int) -> Tuple[float, List[dict]]:
        values = values or [0]
        lo = sent_len - self.r
        hi = sent_len + self.r
        value_weights = []

        for value in values:
            total_in_range = 0
            matching_in_range = 0
            for length in range(lo, hi + 1):
                total_in_range += self._dist_totals_by_length[feat_name].get(length, 0)
                matching_in_range += self._dist_feat_by_length[feat_name].get(length, Counter()).get(value, 0)
            weight = matching_in_range / total_in_range if total_in_range else 1e-6
            value_weights.append({
                "value": value,
                "weight": max(weight, 1e-6),
            })

        log_mean = sum(math.log(item["weight"]) for item in value_weights) / len(value_weights)
        return max(math.exp(log_mean), 1e-6), value_weights

    def _arc_pos_feat_weight(self, arc: Tuple[str, str, str, Optional[str], Optional[str]]) -> float:
        pd, ph, t, ph2, t2 = arc

        f_arc = self._arc_freq.get((pd, ph, t), 0)
        if f_arc == 0:
            return 1e-6

        f_pd_t = self._arc_pd_t_freq.get((pd, t), 0)
        f_ph_t = self._arc_ph_t_freq.get((ph, t), 0)

        factor1 = f_arc / f_pd_t if f_pd_t > 0 else 1e-6
        factor2 = f_arc / f_ph_t if f_ph_t > 0 else 1e-6

        bigram_key = ((pd, ph, t), (ph, ph2, t2))
        f_bigram = self._bigram_freq.get(bigram_key, 0)
        f_parent = self._parent_arc_freq.get((ph, ph2, t2), 0)
        f_bigram_wild = self._bigram_wild_freq.get(((pd, t), (ph2, t2)), 0)

        factor3 = f_bigram / f_arc if f_arc > 0 else 1e-6
        factor4 = f_bigram / f_parent if f_parent > 0 else 1e-6
        factor5 = f_bigram / f_bigram_wild if f_bigram_wild > 0 else 1e-6

        return max(factor1 * factor2 * factor3 * factor4 * factor5, 1e-30)

    def _arc_lemma_feat_weight(self, tokens: List[dict]) -> float:
        token_by_id = {tok["id"]: tok for tok in tokens}
        min_weight = 1.0

        for tok in tokens:
            head_id = tok.get("head", 0)
            if head_id <= 0:
                continue
            head_tok = token_by_id.get(head_id)
            if not head_tok:
                continue

            ld = tok.get("lemma", "_")
            lh = head_tok.get("lemma", "_")
            t = tok.get("deprel", "_")

            f_arc = self._lem_arc_freq.get((ld, lh, t), 0)
            if f_arc == 0:
                min_weight = min(min_weight, 1e-6)
                continue

            f_pd_t = self._lem_pd_t_freq.get((ld, t), 0)
            f_ph_t = self._lem_ph_t_freq.get((lh, t), 0)
            f1 = f_arc / f_pd_t if f_pd_t > 0 else 1e-6
            f2 = f_arc / f_ph_t if f_ph_t > 0 else 1e-6

            gp_id = head_tok.get("head", 0)
            if gp_id > 0 and gp_id in token_by_id:
                gp_tok = token_by_id[gp_id]
                lh2 = gp_tok.get("lemma", "_")
                t2 = head_tok.get("deprel", "_")
            else:
                lh2 = "ROOT"
                t2 = "root"

            f_bg = self._lem_bigram_freq.get(((ld, lh, t), (lh, lh2, t2)), 0)
            f_par = self._lem_parent_freq.get((lh, lh2, t2), 0)
            f_bgw = self._lem_bigram_wild_freq.get(((ld, t), (lh2, t2)), 0)
            f3 = f_bg / f_arc if f_arc > 0 else 1e-6
            f4 = f_bg / f_par if f_par > 0 else 1e-6
            f5 = f_bg / f_bgw if f_bgw > 0 else 1e-6
            w = f1 * f2 * f3 * f4 * f5

            min_weight = min(min_weight, max(w, 1e-30))

        return min_weight

    def score_sentence(self, sent: dict) -> Tuple[float, dict]:
        tokens = sent.get("tokens", [])
        if not tokens:
            return 0.0, {"error": "empty sentence"}

        sent_len = len(tokens)
        details = {}

        tree_depth = _compute_parse_tree_depth(tokens)
        w_tree_depth = self._global_feature_weight("tree_depth", tree_depth, sent_len)
        details["tree_depth"] = {"value": tree_depth, "weight": w_tree_depth}

        comp_depths = _compute_complement_chain_depths(tokens)
        avg_comp = round(sum(comp_depths) / len(comp_depths), 1) if comp_depths else 0
        w_avg_comp = self._global_feature_weight("avg_complement_depth", avg_comp, sent_len)
        details["avg_complement_depth"] = {"value": avg_comp, "weight": w_avg_comp}

        w_comp_dist, comp_dist_weights = self._distribution_feature_weight(
            "complement_depth_distribution",
            comp_depths,
            sent_len,
        )
        details["complement_depth_distribution"] = {
            "values": comp_depths or [0],
            "weight": w_comp_dist,
            "value_weights": comp_dist_weights,
            "combiner": "geometric_mean",
        }

        vr = round(_compute_verbal_root_ratio(tokens), 2)
        w_vr = self._global_feature_weight("verbal_root_ratio", vr, sent_len)
        details["verbal_root_ratio"] = {"value": vr, "weight": w_vr}

        arities = _compute_verbal_arity(tokens)
        w_arity_dist, arity_weights = self._distribution_feature_weight(
            "verbal_arity_distribution",
            arities,
            sent_len,
        )
        details["verbal_arity_distribution"] = {
            "values": arities or [0],
            "weight": w_arity_dist,
            "value_weights": arity_weights,
            "combiner": "geometric_mean",
        }

        sub_feats = _compute_subordination_features(tokens)
        sub_ratio_bin = round(sub_feats["subordinate_ratio"], 2)
        w_sub_ratio = self._global_feature_weight("subordinate_ratio", sub_ratio_bin, sent_len)
        details["subordinate_ratio"] = {"value": sub_ratio_bin, "weight": w_sub_ratio}

        preverbal_bin = round(sub_feats["preverbal_ratio"], 1)
        w_preverbal = self._global_feature_weight("preverbal_sub_ratio", preverbal_bin, sent_len)
        details["preverbal_sub_ratio"] = {"value": preverbal_bin, "weight": w_preverbal}

        sub_depths = sub_feats["subordinate_chain_depths"]
        w_sub_depth_dist, sub_depth_weights = self._distribution_feature_weight(
            "subordinate_chain_depth_distribution",
            sub_depths,
            sent_len,
        )
        details["subordinate_chain_depth_distribution"] = {
            "values": sub_depths or [0],
            "weight": w_sub_depth_dist,
            "value_weights": sub_depth_weights,
            "combiner": "geometric_mean",
        }

        avg_dep_len = round(_compute_avg_dependency_length(tokens))
        w_dep_len = self._global_feature_weight("avg_dep_length", avg_dep_len, sent_len)
        details["avg_dep_length"] = {"value": avg_dep_len, "weight": w_dep_len}

        arcs = _extract_arcs(tokens)
        if arcs:
            arc_weights = [self._arc_pos_feat_weight(arc) for arc in arcs]
            w_arc_pos = min(arc_weights)
            min_arc_idx = arc_weights.index(w_arc_pos)
            details["arc_pos_feat"] = {
                "weight": w_arc_pos,
                "weakest_arc": arcs[min_arc_idx][:3],
                "num_arcs": len(arcs),
            }
        else:
            w_arc_pos = 1.0
            details["arc_pos_feat"] = {"weight": w_arc_pos, "num_arcs": 0, "no_arcs": True}

        global_weights = [
            w_tree_depth, w_avg_comp, w_comp_dist, w_vr,
            w_arity_dist, w_sub_ratio, w_preverbal, w_sub_depth_dist, w_dep_len,
        ]
        qs = w_arc_pos
        for w in global_weights:
            qs *= w

        if self.use_arc_lemma_feat:
            w_arc_lemma = self._arc_lemma_feat_weight(tokens)
            qs *= w_arc_lemma
            details["arc_lemma_feat"] = {"weight": w_arc_lemma}

        details["quality_score"] = qs
        return qs, details


# ============================================================================
# ULISSE DETECTOR (integrates with the platform's BaseDetector interface)
# ============================================================================

class ULISSEDetector(BaseDetector):
    """
    ULISSE as an error detector for the NLP evaluation platform.

    Scores each sentence's parse quality using the ULISSE algorithm.
    Sentences with a QS below the threshold are flagged as potentially incorrect.
    """

    name = "ulisse"
    description = (
        "ULISSE — Unsupervised LInguiStically-driven Selection of dEpendency parses. "
        "Detects unreliable dependency parses by scoring them against corpus-wide "
        "linguistic feature statistics. Based on Dell'Orletta et al. (2011, 2013)."
    )
    is_implemented = True

    def __init__(self, length_range: int = 0, use_arc_lemma_feat: bool = False,
                 threshold_percentile: float = 25.0):
        self.length_range = length_range
        self.use_arc_lemma_feat = use_arc_lemma_feat
        self.threshold_percentile = threshold_percentile
        self.scorer: Optional[ULISSEScorer] = None

    def get_config_schema(self) -> dict:
        return {
            "length_range": {
                "type": "integer",
                "default": 0,
                "min": 0,
                "max": 10,
                "description": (
                    "Range parameter r for length-based feature comparison. "
                    "0 = compare only with sentences of exact same length (in-domain). "
                    "2 = compare with sentences of similar length +/-2 (out-of-domain, recommended)."
                ),
            },
            "use_arc_lemma_feat": {
                "type": "boolean",
                "default": False,
                "description": (
                    "Also use lemma-based arc plausibility (ArcLemmaFeat, from the 2013 paper). "
                    "Captures lexical patterns in addition to POS-based patterns."
                ),
            },
            "threshold_percentile": {
                "type": "number",
                "default": 25.0,
                "min": 1.0,
                "max": 99.0,
                "description": (
                    "Percentile of the QS distribution to use as the threshold. "
                    "Sentences below this percentile are flagged as unreliable. "
                    "Lower = flag fewer sentences (high precision), higher = flag more (high recall)."
                ),
            },
        }

    async def detect(self, sentences: List[Dict[str, Any]], progress_callback=None) -> List[DetectionResult]:
        if not sentences:
            return []

        # Phase 1: collect statistics from the full corpus
        self.scorer = ULISSEScorer(
            length_range=self.length_range,
            use_arc_lemma_feat=self.use_arc_lemma_feat,
        )
        self.scorer.collect_statistics(sentences)

        # Phase 2: score each sentence
        scored = []
        for index, sent in enumerate(sentences, 1):
            qs, details = self.scorer.score_sentence(sent)
            scored.append((sent, qs, details))
            if progress_callback and (index == 1 or index == len(sentences) or index % 10 == 0):
                await progress_callback({
                    "completed": index,
                    "total": len(sentences),
                    "current_sentence_id": sent.get("id", ""),
                    "current_sentence_text": sent.get("text", ""),
                })

        # Determine threshold from percentile
        all_scores = sorted([s[1] for s in scored])
        if len(all_scores) == 0:
            threshold = 0.0
        else:
            idx = max(0, int(len(all_scores) * self.threshold_percentile / 100) - 1)
            threshold = all_scores[idx]

        # Convert to log scale for confidence (QS values can be extremely small)
        log_scores = [math.log(max(s[1], 1e-300)) for s in scored]
        log_min = min(log_scores) if log_scores else 0
        log_max = max(log_scores) if log_scores else 1
        log_range = log_max - log_min if log_max > log_min else 1.0

        # Build results
        results = []
        for sent, qs, details in scored:
            is_correct = qs >= threshold
            log_qs = math.log(max(qs, 1e-300))
            confidence = (log_qs - log_min) / log_range
            confidence = max(0.0, min(1.0, confidence))
            if not is_correct:
                confidence = 1.0 - confidence

            results.append(DetectionResult(
                sentence_id=sent.get("id", ""),
                is_correct=is_correct,
                confidence=round(confidence, 4),
                details={
                    "quality_score": qs,
                    "threshold": threshold,
                    "num_tokens": len(sent.get("tokens", [])),
                    "feature_weights": {
                        k: v for k, v in details.items() if k != "quality_score"
                    },
                },
            ))

        return results

import os
import uuid
import statistics
from collections import Counter, defaultdict
from typing import List, Dict, Any, Optional

from conllu import parse as conllu_parse

from config import CORPORA_DIR


def _parse_file(filepath: str):
    with open(filepath, "r", encoding="utf-8") as f:
        data = f.read()
    return conllu_parse(data)


def get_corpus_meta(filepath: str) -> dict:
    sentences = _parse_file(filepath)
    num_sentences = len(sentences)
    num_tokens = sum(
        len([t for t in s if isinstance(t["id"], int)])
        for s in sentences
    )
    return {"num_sentences": num_sentences, "num_tokens": num_tokens}


def get_sentences(filepath: str, page: int = 1, per_page: int = 50,
                  filter_deprel: Optional[str] = None,
                  min_length: Optional[int] = None,
                  max_length: Optional[int] = None) -> dict:
    sentences = _parse_file(filepath)
    results = []

    for sent in sentences:
        tokens = [t for t in sent if isinstance(t["id"], int)]
        length = len(tokens)

        if min_length and length < min_length:
            continue
        if max_length and length > max_length:
            continue
        if filter_deprel:
            deprels = {t["deprel"] for t in tokens}
            if filter_deprel not in deprels:
                continue

        sent_id = sent.metadata.get("sent_id", str(uuid.uuid4()))
        text = sent.metadata.get("text", " ".join(t["form"] for t in tokens))
        results.append({"id": sent_id, "text": text, "num_tokens": length})

    total = len(results)
    start = (page - 1) * per_page
    end = start + per_page
    return {
        "sentences": results[start:end],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


def get_sentence_detail(filepath: str, sent_id: str) -> Optional[dict]:
    sentences = _parse_file(filepath)
    for sent in sentences:
        sid = sent.metadata.get("sent_id", "")
        if sid == sent_id:
            tokens = []
            for t in sent:
                if not isinstance(t["id"], int):
                    continue
                tokens.append({
                    "id": t["id"],
                    "form": t["form"],
                    "lemma": t.get("lemma", "_"),
                    "upos": t.get("upos", "_"),
                    "xpos": t.get("xpos", "_"),
                    "feats": str(t.get("feats", "_")) if t.get("feats") else "_",
                    "head": t.get("head", 0),
                    "deprel": t.get("deprel", "_"),
                    "deps": t.get("deps", "_") or "_",
                    "misc": str(t.get("misc", "_")) if t.get("misc") else "_",
                })
            text = sent.metadata.get("text", " ".join(tk["form"] for tk in tokens))
            return {"id": sid, "text": text, "tokens": tokens}
    return None


def compute_stats(filepath: str) -> dict:
    sentences = _parse_file(filepath)
    pos_counter = Counter()
    deprel_counter = Counter()
    pos_deprel_counter = Counter()
    lengths = []
    depths = []

    for sent in sentences:
        tokens = [t for t in sent if isinstance(t["id"], int)]
        length = len(tokens)
        lengths.append(length)

        head_map = {}
        children = defaultdict(list)
        for t in tokens:
            pos_counter[t["upos"]] += 1
            deprel_counter[t["deprel"]] += 1
            pos_deprel_counter[(t["upos"], t["deprel"])] += 1
            head_map[t["id"]] = t.get("head", 0)
            parent = t.get("head", 0)
            if parent != 0:
                children[parent].append(t["id"])

        # Compute tree depth
        def get_depth(node_id, visited=None):
            if visited is None:
                visited = set()
            if node_id in visited:
                return 0
            visited.add(node_id)
            if node_id not in children or not children[node_id]:
                return 1
            return 1 + max(get_depth(c, visited) for c in children[node_id])

        roots = [t["id"] for t in tokens if t.get("head", 0) == 0]
        if roots:
            depth = max(get_depth(r) for r in roots)
        else:
            depth = 1
        depths.append(depth)

    num_sentences = len(sentences)
    num_tokens = sum(lengths)

    top_combos = pos_deprel_counter.most_common(10)

    return {
        "num_sentences": num_sentences,
        "num_tokens": num_tokens,
        "length_stats": {
            "mean": round(statistics.mean(lengths), 2) if lengths else 0,
            "median": round(statistics.median(lengths), 2) if lengths else 0,
            "min": min(lengths) if lengths else 0,
            "max": max(lengths) if lengths else 0,
        },
        "avg_tree_depth": round(statistics.mean(depths), 2) if depths else 0,
        "pos_distribution": dict(pos_counter.most_common()),
        "deprel_distribution": dict(deprel_counter.most_common()),
        "top_pos_deprel": [
            {"pos": pos, "deprel": deprel, "count": count}
            for (pos, deprel), count in top_combos
        ],
    }


def parse_corpus_sentences(filepath: str) -> list:
    """Returns list of dicts suitable for detectors: {id, text, tokens}."""
    sentences = _parse_file(filepath)
    result = []
    for sent in sentences:
        tokens = []
        for t in sent:
            if not isinstance(t["id"], int):
                continue
            tokens.append({
                "id": t["id"],
                "form": t["form"],
                "lemma": t.get("lemma", "_"),
                "upos": t.get("upos", "_"),
                "xpos": t.get("xpos", "_"),
                "feats": str(t.get("feats", "_")) if t.get("feats") else "_",
                "head": t.get("head", 0),
                "deprel": t.get("deprel", "_"),
                "deps": t.get("deps", "_") or "_",
                "misc": str(t.get("misc", "_")) if t.get("misc") else "_",
            })
        sid = sent.metadata.get("sent_id", str(uuid.uuid4()))
        text = sent.metadata.get("text", " ".join(tk["form"] for tk in tokens))
        result.append({"id": sid, "text": text, "tokens": tokens})
    return result

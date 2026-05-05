import random
import copy
from typing import List, Dict, Any

VALID_UPOS = [
    "NOUN", "VERB", "ADJ", "ADV", "ADP", "AUX", "CCONJ", "DET",
    "INTJ", "NUM", "PART", "PRON", "PROPN", "PUNCT", "SCONJ", "SYM", "X",
]

VALID_DEPRELS = [
    "nsubj", "obj", "iobj", "csubj", "ccomp", "xcomp", "obl", "vocative",
    "expl", "dislocated", "advcl", "advmod", "discourse", "aux", "cop",
    "mark", "nmod", "appos", "nummod", "acl", "amod", "det", "clf",
    "case", "conj", "cc", "fixed", "flat", "compound", "list", "parataxis",
    "orphan", "goeswith", "reparandum", "punct", "root", "dep",
]


def _would_create_cycle(tokens: list, token_id: int, new_head: int) -> bool:
    head_map = {}
    for t in tokens:
        head_map[t["id"]] = t["head"]
    head_map[token_id] = new_head

    visited = set()
    current = new_head
    while current != 0:
        if current in visited:
            return True
        visited.add(current)
        current = head_map.get(current, 0)
    return False


def inject_errors(
    sentences: List[Dict[str, Any]],
    error_rate: float = 0.1,
    error_types: List[str] = None,
    seed: int = 42,
    errors_per_sentence: int = 1,
) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    if error_types is None:
        error_types = ["head", "deprel", "pos"]

    rng = random.Random(seed)
    corrupted_sentences = []
    ground_truth = []
    target_count = max(0, min(len(sentences), round(len(sentences) * error_rate)))
    corrupted_indices = set(rng.sample(range(len(sentences)), target_count)) if target_count else set()

    for sent_index, sent in enumerate(sentences):
        tokens = copy.deepcopy(sent["tokens"])
        eligible = [t for t in tokens if t["deprel"] != "root" and isinstance(t["id"], int)]
        targets = []
        if sent_index in corrupted_indices and eligible:
            count = max(1, min(errors_per_sentence, len(eligible)))
            targets = rng.sample(eligible, count)

        errors = []
        for target in targets:
            error_type = rng.choice(error_types)
            tid = target["id"]

            if error_type == "head":
                old_head = target["head"]
                possible_heads = [
                    t["id"] for t in tokens
                    if t["id"] != tid and t["id"] != old_head
                ]
                if possible_heads:
                    candidates = [
                        h for h in possible_heads
                        if not _would_create_cycle(tokens, tid, h)
                    ]
                    if candidates:
                        new_head = rng.choice(candidates)
                        target["head"] = new_head
                        errors.append({
                            "token_id": tid,
                            "error_type": "head",
                            "original_value": str(old_head),
                            "corrupted_value": str(new_head),
                        })

            elif error_type == "deprel":
                old_deprel = target["deprel"]
                candidates = [d for d in VALID_DEPRELS if d != old_deprel and d != "root"]
                if candidates:
                    new_deprel = rng.choice(candidates)
                    target["deprel"] = new_deprel
                    errors.append({
                        "token_id": tid,
                        "error_type": "deprel",
                        "original_value": old_deprel,
                        "corrupted_value": new_deprel,
                    })

            elif error_type == "pos":
                old_pos = target["upos"]
                candidates = [p for p in VALID_UPOS if p != old_pos]
                if candidates:
                    new_pos = rng.choice(candidates)
                    target["upos"] = new_pos
                    errors.append({
                        "token_id": tid,
                        "error_type": "pos",
                        "original_value": old_pos,
                        "corrupted_value": new_pos,
                    })

            elif error_type == "combined":
                old_head = target["head"]
                old_deprel = target["deprel"]
                possible_heads = [
                    t["id"] for t in tokens
                    if t["id"] != tid and t["id"] != old_head
                ]
                deprel_candidates = [d for d in VALID_DEPRELS if d != old_deprel and d != "root"]
                head_changed = False
                if possible_heads:
                    head_cands = [
                        h for h in possible_heads
                        if not _would_create_cycle(tokens, tid, h)
                    ]
                    if head_cands:
                        new_head = rng.choice(head_cands)
                        target["head"] = new_head
                        head_changed = True
                if deprel_candidates:
                    new_deprel = rng.choice(deprel_candidates)
                    target["deprel"] = new_deprel
                if head_changed or deprel_candidates:
                    errors.append({
                        "token_id": tid,
                        "error_type": "combined",
                        "original_value": f"{old_head}/{old_deprel}",
                        "corrupted_value": f"{target['head']}/{target['deprel']}",
                    })

        corrupted_sentences.append({
            "id": sent["id"],
            "text": sent["text"],
            "tokens": tokens,
        })
        ground_truth.append({
            "sentence_id": sent["id"],
            "has_error": len(errors) > 0,
            "errors": errors,
        })

    return corrupted_sentences, ground_truth

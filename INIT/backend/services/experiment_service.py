import uuid
import json
import asyncio
import logging
import csv
import re
import random
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional

import aiosqlite

from config import DB_PATH, RESULTS_DIR, ensure_runtime_dirs
from services.corpus_service import parse_corpus_sentences
from services.error_injector import inject_errors

logger = logging.getLogger(__name__)
EXPERIMENT_PROGRESS: Dict[str, Dict[str, Any]] = {}


def _get_detector(name: str, params: dict):
    if name == "llm_judge":
        from detectors.llm_judge import LLMJudgeDetector
        return LLMJudgeDetector(**params)
    elif name == "ulisse":
        from detectors.ulisse import ULISSEDetector
        return ULISSEDetector(**params)
    elif name == "svm":
        from detectors.svm_detector import SVMDetector
        return SVMDetector()
    elif name == "pupa":
        from detectors.pupa import PUPADetector
        return PUPADetector()
    else:
        raise ValueError(f"Unknown detector: {name}")


def _progress_label(detector_name: str) -> str:
    return {
        "llm_judge": "LLM-as-a-judge",
        "ulisse": "ULISSE",
        "svm": "SVM",
        "pupa": "PUPA",
    }.get(detector_name, detector_name)


def get_experiment_progress(experiment_id: str) -> Dict[str, Any] | None:
    return EXPERIMENT_PROGRESS.get(experiment_id)


async def _update_progress(
    experiment_id: str,
    progress: float,
    status: str = "running",
    **detail,
):
    now = datetime.utcnow()
    previous = EXPERIMENT_PROGRESS.get(experiment_id, {})
    started_at = previous.get("started_at") or now.isoformat()
    try:
        started_dt = datetime.fromisoformat(started_at)
    except ValueError:
        started_dt = now

    elapsed = max(0.0, (now - started_dt).total_seconds())
    eta = None
    if 0 < progress < 1 and elapsed > 0:
        eta = max(0.0, elapsed * (1 - progress) / progress)

    message = detail.get("message") or detail.get("current_step") or previous.get("message", "")
    events = list(previous.get("events", []))
    if message and (not events or events[-1].get("message") != message):
        events.append({
            "time": now.isoformat(timespec="seconds"),
            "message": message,
            "phase": detail.get("phase", previous.get("phase", "")),
            "detector": detail.get("detector", previous.get("detector", "")),
        })
        events = events[-8:]

    payload = {
        **previous,
        **detail,
        "status": status,
        "progress": round(max(0.0, min(1.0, progress)), 4),
        "started_at": started_at,
        "updated_at": now.isoformat(),
        "elapsed_seconds": round(elapsed, 1),
        "eta_seconds": round(eta, 1) if eta is not None else None,
        "events": events,
        "message": message,
    }
    EXPERIMENT_PROGRESS[experiment_id] = payload

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE experiments SET progress = ?, status = ? WHERE id = ?",
            (progress, status, experiment_id),
        )
        await db.commit()


def _slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9_-]+", "_", value)
    return re.sub(r"_+", "_", value).strip("_") or "experiment"


def _write_experiment_exports(experiment_id: str, experiment_name: str, results: Dict[str, Any]) -> Dict[str, str]:
    ensure_runtime_dirs()
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    run_dir = RESULTS_DIR / f"{timestamp}_{_slugify(experiment_name)}_{experiment_id[:8]}"
    run_dir.mkdir(parents=True, exist_ok=True)

    results_path = run_dir / "results.json"
    metrics_path = run_dir / "metrics.csv"
    details_path = run_dir / "details.csv"
    export_paths = {
        "directory": str(run_dir),
        "results_json": str(results_path),
        "metrics_csv": str(metrics_path),
        "details_csv": str(details_path),
    }

    results_with_exports = {**results, "exports": export_paths}
    results_path.write_text(json.dumps(results_with_exports, indent=2, ensure_ascii=False), encoding="utf-8")

    with metrics_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["detector", "precision", "recall", "f1", "accuracy", "tp", "fp", "fn", "tn"])
        for detector_name, data in results.get("detectors", {}).items():
            metrics = data.get("global_metrics", {})
            matrix = data.get("confusion_matrix", {})
            writer.writerow([
                detector_name,
                metrics.get("precision"),
                metrics.get("recall"),
                metrics.get("f1"),
                metrics.get("accuracy"),
                matrix.get("tp"),
                matrix.get("fp"),
                matrix.get("fn"),
                matrix.get("tn"),
            ])

    ground_truth = results.get("ground_truth", [])
    detectors = results.get("detectors", {})
    gt_map = {g["sentence_id"]: g for g in ground_truth}
    detector_names = list(detectors.keys())
    det_maps = {
        name: {d["sentence_id"]: d for d in data.get("details", [])}
        for name, data in detectors.items()
    }
    all_ids = set(gt_map.keys())
    for det_map in det_maps.values():
        all_ids.update(det_map.keys())

    with details_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        header = ["sentence_id", "num_tokens", "has_error", "error_types"]
        for name in detector_names:
            header += [f"{name}_predicted_error", f"{name}_confidence", f"{name}_explanation"]
        writer.writerow(header)

        for sentence_id in sorted(all_ids):
            gt = gt_map.get(sentence_id, {})
            errors = gt.get("errors", [])
            num_tokens = ""
            for det_map in det_maps.values():
                token_count = det_map.get(sentence_id, {}).get("details", {}).get("num_tokens", "")
                if token_count:
                    num_tokens = token_count
                    break

            row = [
                sentence_id,
                num_tokens,
                gt.get("has_error", False),
                ";".join(e.get("error_type", "") for e in errors),
            ]
            for name in detector_names:
                pred = det_maps[name].get(sentence_id, {})
                row += [
                    not pred.get("is_correct", True),
                    pred.get("confidence", ""),
                    pred.get("details", {}).get("explanation", ""),
                ]
            writer.writerow(row)

    return export_paths


def _compute_metrics_for_detector(
    ground_truth: List[Dict],
    predictions: List[Dict],
) -> Dict[str, Any]:
    gt_map = {g["sentence_id"]: g for g in ground_truth}
    pred_map = {p["sentence_id"]: p for p in predictions}

    tp = fp = fn = tn = 0
    all_ids = set(gt_map.keys()) & set(pred_map.keys())

    for sid in all_ids:
        actual_has_error = gt_map[sid]["has_error"]
        predicted_has_error = not pred_map[sid]["is_correct"]

        if actual_has_error and predicted_has_error:
            tp += 1
        elif not actual_has_error and predicted_has_error:
            fp += 1
        elif actual_has_error and not predicted_has_error:
            fn += 1
        else:
            tn += 1

    total = tp + fp + fn + tn
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
    accuracy = (tp + tn) / total if total > 0 else 0.0

    # ROC curve
    roc_points = []
    thresholds = [i * 0.05 for i in range(21)]
    for threshold in thresholds:
        t_tp = t_fp = t_fn = t_tn = 0
        for sid in all_ids:
            actual_has_error = gt_map[sid]["has_error"]
            confidence = pred_map[sid].get("confidence", 0.5)
            predicted_error = confidence >= threshold if not pred_map[sid]["is_correct"] else (1 - confidence) >= threshold
            # Simpler: use confidence as error likelihood
            error_confidence = confidence if not pred_map[sid]["is_correct"] else 1 - confidence
            predicted_error_at_thresh = error_confidence >= threshold

            if actual_has_error and predicted_error_at_thresh:
                t_tp += 1
            elif not actual_has_error and predicted_error_at_thresh:
                t_fp += 1
            elif actual_has_error and not predicted_error_at_thresh:
                t_fn += 1
            else:
                t_tn += 1

        fpr = t_fp / (t_fp + t_tn) if (t_fp + t_tn) > 0 else 0.0
        tpr = t_tp / (t_tp + t_fn) if (t_tp + t_fn) > 0 else 0.0
        roc_points.append({"fpr": round(fpr, 4), "tpr": round(tpr, 4)})

    # Per relation metrics
    per_relation = {}
    for sid in all_ids:
        gt = gt_map[sid]
        if gt["has_error"]:
            for err in gt.get("errors", []):
                if err["error_type"] == "deprel":
                    rel = err["original_value"]
                elif err["error_type"] in ("head", "combined"):
                    rel = "head_error"
                else:
                    rel = err.get("error_type", "unknown")
                if rel not in per_relation:
                    per_relation[rel] = {"tp": 0, "fp": 0, "fn": 0, "tn": 0}
                predicted_has_error = not pred_map[sid]["is_correct"]
                if predicted_has_error:
                    per_relation[rel]["tp"] += 1
                else:
                    per_relation[rel]["fn"] += 1

    per_relation_metrics = {}
    for rel, counts in per_relation.items():
        rtp, rfp, rfn = counts["tp"], counts["fp"], counts["fn"]
        rp = rtp / (rtp + rfp) if (rtp + rfp) > 0 else 0.0
        rr = rtp / (rtp + rfn) if (rtp + rfn) > 0 else 0.0
        rf1 = 2 * rp * rr / (rp + rr) if (rp + rr) > 0 else 0.0
        per_relation_metrics[rel] = {"p": round(rp, 4), "r": round(rr, 4), "f1": round(rf1, 4)}

    # Per length metrics
    length_buckets = {"1-5": (1, 5), "6-10": (6, 10), "11-15": (11, 15),
                      "16-20": (16, 20), "21-30": (21, 30), "31+": (31, 9999)}
    per_length = {}
    for bucket_name, (lo, hi) in length_buckets.items():
        b_tp = b_fp = b_fn = b_tn = 0
        for sid in all_ids:
            pred = pred_map[sid]
            num_tokens = pred.get("details", {}).get("num_tokens", 0)
            if not (lo <= num_tokens <= hi):
                continue
            actual_has_error = gt_map[sid]["has_error"]
            predicted_has_error = not pred["is_correct"]
            if actual_has_error and predicted_has_error:
                b_tp += 1
            elif not actual_has_error and predicted_has_error:
                b_fp += 1
            elif actual_has_error and not predicted_has_error:
                b_fn += 1
            else:
                b_tn += 1
        bp = b_tp / (b_tp + b_fp) if (b_tp + b_fp) > 0 else 0.0
        br = b_tp / (b_tp + b_fn) if (b_tp + b_fn) > 0 else 0.0
        bf1 = 2 * bp * br / (bp + br) if (bp + br) > 0 else 0.0
        per_length[bucket_name] = {"p": round(bp, 4), "r": round(br, 4), "f1": round(bf1, 4)}

    details = []
    for sid in all_ids:
        pred = pred_map[sid]
        details.append({
            "sentence_id": sid,
            "is_correct": pred["is_correct"],
            "confidence": pred.get("confidence", 0.5),
            "details": pred.get("details", {}),
        })

    return {
        "global_metrics": {
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
            "accuracy": round(accuracy, 4),
        },
        "confusion_matrix": {"tp": tp, "fp": fp, "fn": fn, "tn": tn},
        "roc_curve": roc_points,
        "per_relation": per_relation_metrics,
        "per_length": per_length,
        "details": details,
    }


def _compute_agreement(detector_results: Dict[str, List[Dict]]) -> Dict[str, float]:
    names = list(detector_results.keys())
    agreement = {}
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            n1, n2 = names[i], names[j]
            preds1 = {p["sentence_id"]: not p["is_correct"] for p in detector_results[n1]}
            preds2 = {p["sentence_id"]: not p["is_correct"] for p in detector_results[n2]}
            common = set(preds1.keys()) & set(preds2.keys())
            if common:
                agree_count = sum(1 for s in common if preds1[s] == preds2[s])
                agreement[f"{n1}_vs_{n2}"] = round(agree_count / len(common), 4)
    return agreement


async def run_experiment(experiment_id: str, corpus_filepath: str,
                         error_config: dict, detectors_config: list,
                         max_sentences: int = None, experiment_name: str = "experiment",
                         sample_random: bool = False, sample_seed: Optional[int] = None):
    try:
        total_detectors = len(detectors_config)
        await _update_progress(
            experiment_id,
            0.0,
            "running",
            phase="initialisation",
            current_step="Initialisation",
            message="Préparation de l'expérience",
            detector_total=total_detectors,
        )

        # Step 1: Load corpus
        all_sentences = parse_corpus_sentences(corpus_filepath)
        source_sentence_count = len(all_sentences)
        sample_size = max_sentences if max_sentences and max_sentences < source_sentence_count else source_sentence_count
        sampling_seed = sample_seed if sample_seed is not None else error_config.get("seed", 42)
        if sample_random and sample_size < source_sentence_count:
            rng = random.Random(sampling_seed)
            sampled_indices = sorted(rng.sample(range(source_sentence_count), sample_size))
            sentences = [all_sentences[index] for index in sampled_indices]
        else:
            sampled_indices = list(range(sample_size))
            sentences = all_sentences[:sample_size]
        await _update_progress(
            experiment_id,
            0.1,
            phase="corpus",
            current_step="Chargement du corpus",
            message=f"{len(sentences)} phrases chargées",
            item_total=len(sentences),
        )

        # Step 2: Inject errors
        corrupted, ground_truth = inject_errors(
            sentences,
            error_rate=error_config.get("error_rate", 0.1),
            error_types=error_config.get("error_types", ["head", "deprel", "pos"]),
            seed=error_config.get("seed", 42),
            errors_per_sentence=error_config.get("errors_per_sentence", 1),
        )
        corrupted_count = sum(1 for item in ground_truth if item.get("has_error"))
        clean_count = len(ground_truth) - corrupted_count
        error_type_counts: Dict[str, int] = {}
        for item in ground_truth:
            for err in item.get("errors", []):
                error_type = err.get("error_type", "unknown")
                error_type_counts[error_type] = error_type_counts.get(error_type, 0) + 1
        dataset_summary = {
            "source_sentences": source_sentence_count,
            "total_sentences": len(ground_truth),
            "corrupted_sentences": corrupted_count,
            "clean_sentences": clean_count,
            "requested_error_rate": error_config.get("error_rate", 0.1),
            "actual_error_rate": round(corrupted_count / len(ground_truth), 4) if ground_truth else 0,
            "errors_per_sentence": error_config.get("errors_per_sentence", 1),
            "error_type_counts": error_type_counts,
            "sampling": {
                "mode": "random" if sample_random else "first_n",
                "seed": sampling_seed,
                "max_sentences": max_sentences,
                "sampled_indices": sampled_indices,
                "selected_sentence_ids": [sentence["id"] for sentence in sentences],
            },
        }
        await _update_progress(
            experiment_id,
            0.2,
            phase="injection",
            current_step="Injection d'erreurs",
            message=f"{corrupted_count} phrases corrompues · {clean_count} phrases originales",
            dataset=dataset_summary,
        )

        # Step 3: Run detectors
        detector_raw = {}
        num_detectors = len(detectors_config)
        detector_span = 0.65 / max(num_detectors, 1)
        for idx, det_config in enumerate(detectors_config):
            det_name = det_config["name"]
            det_params = det_config.get("params", {})
            detector_label = _progress_label(det_name)
            detector_start = 0.2 + detector_span * idx
            await _update_progress(
                experiment_id,
                detector_start,
                phase="detector",
                current_step=f"{detector_label} en cours",
                message=f"Lancement de {detector_label}",
                detector=det_name,
                detector_label=detector_label,
                detector_index=idx + 1,
                detector_total=num_detectors,
                item_index=0,
                item_total=len(corrupted),
                current_sentence_id="",
                current_sentence_text="",
            )

            async def detector_progress(update: Dict[str, Any], detector_idx=idx, name=det_name, label=detector_label):
                completed = update.get("completed", 0)
                total = update.get("total", len(corrupted)) or len(corrupted)
                local_progress = min(1.0, completed / total) if total else 1.0
                global_progress = 0.2 + detector_span * (detector_idx + local_progress)
                await _update_progress(
                    experiment_id,
                    global_progress,
                    phase="detector",
                    current_step=f"{label} en cours",
                    message=f"{label} · {completed}/{total} phrases",
                    detector=name,
                    detector_label=label,
                    detector_index=detector_idx + 1,
                    detector_total=num_detectors,
                    item_index=completed,
                    item_total=total,
                    batch_index=update.get("batch_index"),
                    batch_total=update.get("batch_total"),
                    current_sentence_id=update.get("current_sentence_id", ""),
                    current_sentence_text=update.get("current_sentence_text", ""),
                )

            try:
                detector = _get_detector(det_name, det_params)
                try:
                    results = await detector.detect(corrupted, progress_callback=detector_progress)
                except TypeError:
                    results = await detector.detect(corrupted)
                # Enrich with num_tokens
                for r, s in zip(results, corrupted):
                    if isinstance(r, dict):
                        r.setdefault("details", {})["num_tokens"] = len(s["tokens"])
                    else:
                        r.details["num_tokens"] = len(s["tokens"])

                detector_raw[det_name] = [
                    r if isinstance(r, dict) else r.model_dump()
                    for r in results
                ]
            except NotImplementedError as e:
                logger.warning(f"Detector {det_name} not implemented: {e}")
                detector_raw[det_name] = []
            except Exception as e:
                logger.error(f"Detector {det_name} failed: {e}")
                detector_raw[det_name] = []

            progress = 0.2 + detector_span * (idx + 1)
            await _update_progress(
                experiment_id,
                progress,
                phase="detector",
                current_step=f"{detector_label} terminé",
                message=f"{detector_label} terminé",
                detector=det_name,
                detector_label=detector_label,
                detector_index=idx + 1,
                detector_total=num_detectors,
                item_index=len(corrupted),
                item_total=len(corrupted),
            )

        # Step 4: Compute metrics
        await _update_progress(
            experiment_id,
            0.88,
            phase="metrics",
            current_step="Calcul des métriques",
            message="Calcul des matrices, F1 et accords",
        )
        detector_metrics = {}
        for det_name, preds in detector_raw.items():
            if preds:
                detector_metrics[det_name] = _compute_metrics_for_detector(ground_truth, preds)
            else:
                detector_metrics[det_name] = {
                    "global_metrics": {"precision": 0, "recall": 0, "f1": 0, "accuracy": 0},
                    "confusion_matrix": {"tp": 0, "fp": 0, "fn": 0, "tn": 0},
                    "roc_curve": [],
                    "per_relation": {},
                    "per_length": {},
                    "details": [],
                    "error": "Detector not implemented or failed",
                }

        agreement = _compute_agreement(detector_raw)
        await _update_progress(
            experiment_id,
            0.94,
            phase="exports",
            current_step="Préparation des exports",
            message="Écriture des fichiers résultats",
        )

        # Step 5: Store results
        results = {
            "ground_truth": ground_truth,
            "dataset": dataset_summary,
            "detectors": detector_metrics,
            "agreement": agreement,
        }
        results["exports"] = _write_experiment_exports(experiment_id, experiment_name, results)

        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(
                "UPDATE experiments SET status = 'completed', progress = 1.0, "
                "completed_at = ?, results = ? WHERE id = ?",
                (datetime.utcnow().isoformat(), json.dumps(results), experiment_id),
            )
            await db.commit()
        await _update_progress(
            experiment_id,
            1.0,
            "completed",
            phase="completed",
            current_step="Terminé",
            message="Expérience terminée",
            item_index=len(corrupted),
            item_total=len(corrupted),
        )

    except Exception as e:
        logger.error(f"Experiment {experiment_id} failed: {e}")
        await _update_progress(
            experiment_id,
            EXPERIMENT_PROGRESS.get(experiment_id, {}).get("progress", 0.0),
            "failed",
            phase="failed",
            current_step="Échec",
            message=str(e),
        )
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(
                "UPDATE experiments SET status = 'failed', results = ? WHERE id = ?",
                (json.dumps({"error": str(e)}), experiment_id),
            )
            await db.commit()

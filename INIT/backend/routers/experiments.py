import uuid
import json
import csv
import io
import asyncio
from fastapi import APIRouter, HTTPException, BackgroundTasks, Body
from fastapi.responses import StreamingResponse

from database import database
from models import ExperimentCreate, ExperimentOut, ExperimentDetail, ExperimentProgress
from services.experiment_service import run_experiment, get_experiment_progress
from services.ollama_service import generate as ollama_generate

router = APIRouter()


def _pct(value):
    if value is None:
        return "-"
    return f"{value * 100:.1f} %"


def _detector_label(name: str) -> str:
    return {
        "llm_judge": "LLM-as-a-judge",
        "ulisse": "ULISSE",
        "svm": "SVM",
        "pupa": "PUPA",
    }.get(name, name)


def _get_metric_rows(results: dict) -> list[dict]:
    rows = []
    for name, data in results.get("detectors", {}).items():
        metrics = data.get("global_metrics", {})
        matrix = data.get("confusion_matrix", {})
        rows.append({
            "name": name,
            "label": _detector_label(name),
            "precision": metrics.get("precision", 0),
            "recall": metrics.get("recall", 0),
            "f1": metrics.get("f1", 0),
            "accuracy": metrics.get("accuracy", 0),
            "tp": matrix.get("tp", 0),
            "fp": matrix.get("fp", 0),
            "fn": matrix.get("fn", 0),
            "tn": matrix.get("tn", 0),
        })
    return rows


def _build_interpretation_notes(results: dict) -> list[str]:
    rows = _get_metric_rows(results)
    if not rows:
        return ["Aucun détecteur n'a produit de métriques exploitables."]

    best_f1 = max(rows, key=lambda row: row.get("f1", 0))
    best_recall = max(rows, key=lambda row: row.get("recall", 0))
    best_precision = max(rows, key=lambda row: row.get("precision", 0))
    most_fn = max(rows, key=lambda row: row.get("fn", 0))
    most_fp = max(rows, key=lambda row: row.get("fp", 0))

    notes = [
        f"Le meilleur F1 est obtenu par {best_f1['label']} ({_pct(best_f1['f1'])}).",
        f"Le meilleur rappel est obtenu par {best_recall['label']} ({_pct(best_recall['recall'])}).",
        f"La meilleure précision est obtenue par {best_precision['label']} ({_pct(best_precision['precision'])}).",
        f"Les faux négatifs sont prioritaires à analyser : {most_fn['label']} en compte {most_fn['fn']}.",
        f"Les faux positifs réduisent le rendement : {most_fp['label']} en compte {most_fp['fp']}.",
        "L'accuracy ne doit pas être utilisée seule, car elle peut être gonflée par les phrases originales majoritaires.",
    ]

    agreement = results.get("agreement", {})
    for key, value in agreement.items():
        notes.append(f"L'accord {key.replace('_vs_', ' / ').replace('_', ' ')} est de {_pct(value)} ; il ne prouve pas la correction des verdicts.")

    return notes


def _build_report_markdown(export: dict) -> str:
    experiment = export["experiment"]
    corpus = export["corpus"]
    config = export["config"]
    results = export["results"] or {}
    dataset = results.get("dataset", {})
    rows = _get_metric_rows(results)
    best = max(rows, key=lambda row: row.get("f1", 0), default=None)
    agreement = results.get("agreement", {})
    ulisse_reference = dataset.get("ulisse_reference") or {}
    ulisse_reference_line = None
    if ulisse_reference.get("source") == "ud_french_gsd_train_dev":
        splits = ulisse_reference.get("split_counts", {})
        evaluation = (
            "UD French-GSD test"
            if ulisse_reference.get("evaluation_split") == "ud_french_gsd_test"
            else "le corpus sélectionné"
        )
        ulisse_reference_line = (
            "- Référence ULISSE : UD French-GSD train+dev "
            f"({ulisse_reference.get('sentence_count', 0)} phrases ; "
            f"train={splits.get('train', 0)}, dev={splits.get('dev', 0)}), "
            f"évaluation sur {evaluation}."
        )
    elif ulisse_reference.get("source") == "selected_corpus":
        ulisse_reference_line = (
            "- Référence ULISSE : corpus sélectionné avant injection "
            f"({ulisse_reference.get('sentence_count', 0)} phrases)."
        )

    lines = [
        f"# Rapport Homere — {experiment['name']}",
        "",
        "## Protocole",
        "",
        f"- Corpus : {corpus.get('name', 'Unknown')}",
        f"- Phrases évaluées : {dataset.get('total_sentences', 0)}",
        f"- Échantillonnage : {dataset.get('sampling', {}).get('mode', 'first_n')} "
        f"(seed={dataset.get('sampling', {}).get('seed', '-')})",
        f"- Phrases corrompues : {dataset.get('corrupted_sentences', 0)} ({_pct(dataset.get('actual_error_rate', 0))})",
        f"- Phrases originales : {dataset.get('clean_sentences', 0)}",
        f"- Erreurs injectées : {', '.join(f'{k}={v}' for k, v in dataset.get('error_type_counts', {}).items()) or 'aucune'}",
        *( [ulisse_reference_line] if ulisse_reference_line else [] ),
        f"- Configuration d'injection : `{json.dumps(config.get('error_config', {}), ensure_ascii=False)}`",
        "",
        "Les détecteurs ne reçoivent pas la vérité terrain. Celle-ci sert uniquement après l'exécution pour calculer les métriques.",
        "",
        "## Synthèse des scores",
        "",
        "| Détecteur | Précision | Rappel | F1 | Accuracy | TP | FP | FN | TN |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]

    for row in rows:
        lines.append(
            f"| {row['label']} | {_pct(row['precision'])} | {_pct(row['recall'])} | "
            f"{_pct(row['f1'])} | {_pct(row['accuracy'])} | {row['tp']} | {row['fp']} | {row['fn']} | {row['tn']} |"
        )

    lines.extend(["", "## Lecture rapide", ""])
    for note in _build_interpretation_notes(results):
        lines.append(f"- {note}")

    if agreement:
        lines.extend(["", "## Accord entre méthodes", ""])
        for key, value in agreement.items():
            lines.append(f"- {key.replace('_vs_', ' / ').replace('_', ' ')} : {_pct(value)}")
        lines.append("")
        lines.append("L'accord mesure si deux détecteurs prennent les mêmes décisions. Il ne prouve pas qu'ils ont raison.")

    lines.extend(["", "## Paramètres des détecteurs", ""])
    for detector in config.get("detectors_config", []):
        name = detector.get("name", "unknown")
        params = detector.get("params", {})
        lines.append(f"- **{_detector_label(name)}** : `{json.dumps(params, ensure_ascii=False)}`")

    lines.extend(["", "## Notes méthodologiques", ""])
    lines.append("- La précision mesure la fiabilité des alertes.")
    lines.append("- Le rappel mesure la capacité à retrouver les vraies erreurs.")
    lines.append("- Le F1 résume le compromis précision/rappel.")
    lines.append("- Les faux négatifs sont prioritaires à analyser dans ce projet, car ils laissent passer des analyses erronées.")

    return "\n".join(lines) + "\n"


async def _build_experiment_export(experiment_id: str) -> dict:
    row = await database.fetch_one("SELECT * FROM experiments WHERE id = :id", {"id": experiment_id})
    if not row:
        raise HTTPException(status_code=404, detail="Expérience non trouvée")

    corpus_row = await database.fetch_one(
        "SELECT name, num_sentences, num_tokens FROM corpora WHERE id = :id",
        {"id": row["corpus_id"]},
    )
    results = json.loads(row["results"]) if row["results"] else None

    return {
        "experiment": {
            "id": row["id"],
            "name": row["name"],
            "created_at": row["created_at"],
            "completed_at": row["completed_at"],
            "status": row["status"],
        },
        "corpus": {
            "id": row["corpus_id"],
            "name": corpus_row["name"] if corpus_row else "Unknown",
            "num_sentences": corpus_row["num_sentences"] if corpus_row else None,
            "num_tokens": corpus_row["num_tokens"] if corpus_row else None,
        },
        "config": {
            "error_config": json.loads(row["error_config"]),
            "detectors_config": json.loads(row["detectors_config"]),
        },
        "results": results,
    }


@router.post("", response_model=ExperimentOut)
async def create_experiment(req: ExperimentCreate, background_tasks: BackgroundTasks):
    # Verify corpus exists
    row = await database.fetch_one("SELECT * FROM corpora WHERE id = :id", {"id": req.corpus_id})
    if not row:
        raise HTTPException(status_code=404, detail="Corpus non trouvé")

    experiment_id = str(uuid.uuid4())
    query = """INSERT INTO experiments (id, name, corpus_id, error_config, detectors_config, status, progress)
               VALUES (:id, :name, :corpus_id, :error_config, :detectors_config, 'pending', 0.0)"""
    await database.execute(query, {
        "id": experiment_id,
        "name": req.name,
        "corpus_id": req.corpus_id,
        "error_config": json.dumps(req.error_config.model_dump()),
        "detectors_config": json.dumps(req.detectors_config),
    })

    # Launch experiment in background
    background_tasks.add_task(
        run_experiment,
        experiment_id,
        row["filepath"],
        req.error_config.model_dump(),
        req.detectors_config,
        req.max_sentences,
        req.name,
        req.sample_random,
        req.sample_seed,
    )

    return ExperimentOut(
        id=experiment_id, name=req.name, corpus_id=req.corpus_id,
        status="pending", progress=0.0,
    )


@router.get("", response_model=list[ExperimentOut])
async def list_experiments():
    rows = await database.fetch_all("SELECT * FROM experiments ORDER BY created_at DESC")
    return [ExperimentOut(
        id=r["id"], name=r["name"], corpus_id=r["corpus_id"],
        status=r["status"], progress=r["progress"] or 0.0,
        created_at=r["created_at"],
    ) for r in rows]


@router.get("/{experiment_id}", response_model=ExperimentDetail)
async def get_experiment(experiment_id: str):
    row = await database.fetch_one("SELECT * FROM experiments WHERE id = :id", {"id": experiment_id})
    if not row:
        raise HTTPException(status_code=404, detail="Expérience non trouvée")

    results = None
    if row["results"]:
        try:
            results = json.loads(row["results"])
        except json.JSONDecodeError:
            results = None

    return ExperimentDetail(
        id=row["id"], name=row["name"], corpus_id=row["corpus_id"],
        status=row["status"], progress=row["progress"] or 0.0,
        created_at=row["created_at"], completed_at=row["completed_at"],
        error_config=json.loads(row["error_config"]),
        detectors_config=json.loads(row["detectors_config"]),
        results=results,
    )


@router.get("/{experiment_id}/progress", response_model=ExperimentProgress)
async def get_progress(experiment_id: str):
    row = await database.fetch_one(
        "SELECT status, progress FROM experiments WHERE id = :id",
        {"id": experiment_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Expérience non trouvée")
    step = ""
    progress = row["progress"] or 0.0
    if progress < 0.1:
        step = "Chargement du corpus"
    elif progress < 0.2:
        step = "Injection d'erreurs"
    elif progress < 0.8:
        step = "Exécution des détecteurs"
    elif progress < 0.9:
        step = "Calcul des métriques"
    else:
        step = "Finalisation"
    live = get_experiment_progress(experiment_id) or {}
    payload = {
        **live,
        "status": row["status"],
        "progress": progress,
        "current_step": live.get("current_step") or step,
    }
    return ExperimentProgress(**payload)


@router.delete("/{experiment_id}")
async def delete_experiment(experiment_id: str):
    row = await database.fetch_one("SELECT id FROM experiments WHERE id = :id", {"id": experiment_id})
    if not row:
        raise HTTPException(status_code=404, detail="Expérience non trouvée")
    await database.execute("DELETE FROM experiments WHERE id = :id", {"id": experiment_id})
    return {"ok": True}


@router.get("/{experiment_id}/results/compare")
async def compare_results(experiment_id: str):
    row = await database.fetch_one("SELECT results FROM experiments WHERE id = :id", {"id": experiment_id})
    if not row:
        raise HTTPException(status_code=404, detail="Expérience non trouvée")
    if not row["results"]:
        raise HTTPException(status_code=400, detail="L'expérience n'a pas encore de résultats")
    return json.loads(row["results"])


@router.get("/{experiment_id}/export/json")
async def export_json(experiment_id: str):
    """Export complet de l'expérience en JSON (config + résultats)."""
    export = await _build_experiment_export(experiment_id)

    content = json.dumps(export, indent=2, ensure_ascii=False)
    filename = f"experiment_{export['experiment']['name'].replace(' ', '_')}_{experiment_id[:8]}.json"

    return StreamingResponse(
        io.BytesIO(content.encode("utf-8")),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{experiment_id}/export/report-md")
async def export_report_markdown(experiment_id: str):
    """Export d'un rapport Markdown déterministe, sans génération LLM."""
    export = await _build_experiment_export(experiment_id)
    if not export["results"]:
        raise HTTPException(status_code=400, detail="Pas de résultats")

    content = _build_report_markdown(export)
    filename = f"rapport_{export['experiment']['name'].replace(' ', '_')}_{experiment_id[:8]}.md"
    return StreamingResponse(
        io.BytesIO(content.encode("utf-8")),
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{experiment_id}/report/llm")
async def generate_llm_report(
    experiment_id: str,
    payload: dict = Body(default_factory=dict),
):
    """Génère une interprétation rédigée par LLM à partir des métriques calculées."""
    model = payload.get("model")
    if not model:
        raise HTTPException(status_code=400, detail="Modèle Ollama requis")

    export = await _build_experiment_export(experiment_id)
    if not export["results"]:
        raise HTTPException(status_code=400, detail="Pas de résultats")

    base_report = _build_report_markdown(export)
    compact_data = {
        "experiment": export["experiment"],
        "corpus": export["corpus"],
        "dataset": export["results"].get("dataset", {}),
        "detectors": _get_metric_rows(export["results"]),
        "agreement": export["results"].get("agreement", {}),
        "config": export["config"],
        "allowed_interpretation_notes": _build_interpretation_notes(export["results"]),
    }
    prompt = (
        "Tu rédiges une interprétation scientifique en français pour un rapport de master.\n"
        "Tu dois respecter strictement les chiffres fournis. Ne recalcule rien, n'invente aucune métrique.\n"
        "Utilise uniquement les notes d'interprétation autorisées. Tu peux les reformuler, mais pas ajouter de conclusion chiffrée.\n"
        "Explique les résultats de façon claire : F1, rappel, précision, faux négatifs, faux positifs, accord entre méthodes, limites.\n"
        "N'appelle pas l'accuracy \"performance globale\" et ne l'utilise jamais seule pour classer les détecteurs.\n"
        "Ne mentionne pas que tu es un modèle de langue.\n\n"
        f"Données JSON:\n{json.dumps(compact_data, ensure_ascii=False, indent=2)}\n\n"
        "Rédige uniquement une section Markdown intitulée \"## Interprétation rédigée\"."
    )
    generated = await ollama_generate(
        model=model,
        prompt=prompt,
        temperature=float(payload.get("temperature", 0.2)),
        timeout=float(payload.get("timeout", 180)),
        num_predict=int(payload.get("num_predict", 1400)),
    )
    if generated.startswith("Error:"):
        raise HTTPException(status_code=502, detail=generated)

    return {
        "model": model,
        "markdown": base_report + "\n" + generated.strip() + "\n",
    }


@router.get("/{experiment_id}/export/csv")
async def export_csv(experiment_id: str):
    """Export des résultats détaillés par phrase en CSV."""
    row = await database.fetch_one("SELECT * FROM experiments WHERE id = :id", {"id": experiment_id})
    if not row:
        raise HTTPException(status_code=404, detail="Expérience non trouvée")
    if not row["results"]:
        raise HTTPException(status_code=400, detail="L'expérience n'a pas encore de résultats")

    results = json.loads(row["results"])
    ground_truth = results.get("ground_truth", [])
    detectors = results.get("detectors", {})
    gt_map = {g["sentence_id"]: g for g in ground_truth}
    detector_names = list(detectors.keys())

    output = io.StringIO()
    writer = csv.writer(output)

    # Header
    header = ["sentence_id", "num_tokens", "has_error", "error_types"]
    for dn in detector_names:
        header += [f"{dn}_predicted_error", f"{dn}_confidence", f"{dn}_explanation"]
    writer.writerow(header)

    # Collect all sentence IDs
    all_ids = set(gt_map.keys())
    for dn in detector_names:
        for d in detectors[dn].get("details", []):
            all_ids.add(d["sentence_id"])

    # Build detector prediction maps
    det_maps = {}
    for dn in detector_names:
        det_maps[dn] = {d["sentence_id"]: d for d in detectors[dn].get("details", [])}

    for sid in sorted(all_ids):
        gt = gt_map.get(sid, {})
        has_error = gt.get("has_error", False)
        errors = gt.get("errors", [])
        error_types = ";".join(e.get("error_type", "") for e in errors) if errors else ""

        row_data = [sid]
        # num_tokens from first detector that has it
        num_tokens = ""
        for dn in detector_names:
            pred = det_maps[dn].get(sid, {})
            nt = pred.get("details", {}).get("num_tokens", "")
            if nt:
                num_tokens = nt
                break
        row_data.append(num_tokens)
        row_data.append(has_error)
        row_data.append(error_types)

        for dn in detector_names:
            pred = det_maps[dn].get(sid, {})
            predicted_error = not pred.get("is_correct", True)
            confidence = pred.get("confidence", "")
            explanation = pred.get("details", {}).get("explanation", "")
            row_data += [predicted_error, confidence, explanation]

        writer.writerow(row_data)

    content = output.getvalue()
    filename = f"experiment_{row['name'].replace(' ', '_')}_{row['id'][:8]}_details.csv"

    return StreamingResponse(
        io.BytesIO(content.encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{experiment_id}/export/metrics-csv")
async def export_metrics_csv(experiment_id: str):
    """Export des métriques globales par détecteur en CSV."""
    row = await database.fetch_one("SELECT * FROM experiments WHERE id = :id", {"id": experiment_id})
    if not row:
        raise HTTPException(status_code=404, detail="Expérience non trouvée")
    if not row["results"]:
        raise HTTPException(status_code=400, detail="Pas de résultats")

    results = json.loads(row["results"])
    detectors = results.get("detectors", {})

    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow(["detector", "precision", "recall", "f1", "accuracy", "tp", "fp", "fn", "tn"])
    for dn, data in detectors.items():
        m = data.get("global_metrics", {})
        cm = data.get("confusion_matrix", {})
        writer.writerow([
            dn, m.get("precision"), m.get("recall"), m.get("f1"), m.get("accuracy"),
            cm.get("tp"), cm.get("fp"), cm.get("fn"), cm.get("tn"),
        ])

    content = output.getvalue()
    filename = f"experiment_{row['name'].replace(' ', '_')}_{row['id'][:8]}_metrics.csv"

    return StreamingResponse(
        io.BytesIO(content.encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

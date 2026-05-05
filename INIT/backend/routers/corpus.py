import os
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException, Query
from typing import Optional

from database import database
from models import CorpusOut, CorpusDetail, SentencePage, SentenceDetail, CorpusStats
from services.corpus_service import (
    get_corpus_meta, get_sentences, get_sentence_detail, compute_stats, CORPORA_DIR,
)

router = APIRouter()


@router.post("/upload", response_model=CorpusOut)
async def upload_corpus(file: UploadFile = File(...)):
    if not file.filename.endswith(".conllu"):
        raise HTTPException(status_code=400, detail="Le fichier doit être au format .conllu")

    corpus_id = str(uuid.uuid4())
    os.makedirs(CORPORA_DIR, exist_ok=True)
    filepath = os.path.join(CORPORA_DIR, f"{corpus_id}.conllu")

    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    try:
        meta = get_corpus_meta(filepath)
    except Exception as e:
        os.remove(filepath)
        raise HTTPException(status_code=400, detail=f"Fichier CoNLL-U malformé : {str(e)}")

    name = file.filename.replace(".conllu", "")
    query = """INSERT INTO corpora (id, name, filepath, num_sentences, num_tokens)
               VALUES (:id, :name, :filepath, :num_sentences, :num_tokens)"""
    await database.execute(query, {
        "id": corpus_id, "name": name, "filepath": filepath,
        "num_sentences": meta["num_sentences"], "num_tokens": meta["num_tokens"],
    })

    return CorpusOut(
        id=corpus_id, name=name,
        num_sentences=meta["num_sentences"], num_tokens=meta["num_tokens"],
    )


@router.get("", response_model=list[CorpusOut])
async def list_corpora():
    rows = await database.fetch_all("SELECT * FROM corpora ORDER BY created_at DESC")
    return [CorpusOut(
        id=r["id"], name=r["name"],
        num_sentences=r["num_sentences"], num_tokens=r["num_tokens"],
        created_at=r["created_at"],
    ) for r in rows]


@router.get("/{corpus_id}", response_model=CorpusDetail)
async def get_corpus(corpus_id: str):
    row = await database.fetch_one("SELECT * FROM corpora WHERE id = :id", {"id": corpus_id})
    if not row:
        raise HTTPException(status_code=404, detail="Corpus non trouvé")
    return CorpusDetail(
        id=row["id"], name=row["name"], filepath=row["filepath"],
        num_sentences=row["num_sentences"], num_tokens=row["num_tokens"],
        created_at=row["created_at"],
    )


@router.get("/{corpus_id}/sentences", response_model=SentencePage)
async def list_sentences(
    corpus_id: str,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    filter_deprel: Optional[str] = None,
    min_length: Optional[int] = None,
    max_length: Optional[int] = None,
):
    row = await database.fetch_one("SELECT filepath FROM corpora WHERE id = :id", {"id": corpus_id})
    if not row:
        raise HTTPException(status_code=404, detail="Corpus non trouvé")
    return get_sentences(row["filepath"], page, per_page, filter_deprel, min_length, max_length)


@router.get("/{corpus_id}/sentences/{sent_id}", response_model=SentenceDetail)
async def get_sentence(corpus_id: str, sent_id: str):
    row = await database.fetch_one("SELECT filepath FROM corpora WHERE id = :id", {"id": corpus_id})
    if not row:
        raise HTTPException(status_code=404, detail="Corpus non trouvé")
    detail = get_sentence_detail(row["filepath"], sent_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Phrase non trouvée")
    return detail


@router.get("/{corpus_id}/stats", response_model=CorpusStats)
async def corpus_stats(corpus_id: str):
    row = await database.fetch_one("SELECT filepath FROM corpora WHERE id = :id", {"id": corpus_id})
    if not row:
        raise HTTPException(status_code=404, detail="Corpus non trouvé")
    return compute_stats(row["filepath"])


@router.delete("/{corpus_id}")
async def delete_corpus(corpus_id: str):
    row = await database.fetch_one("SELECT filepath FROM corpora WHERE id = :id", {"id": corpus_id})
    if not row:
        raise HTTPException(status_code=404, detail="Corpus non trouvé")
    if os.path.exists(row["filepath"]):
        os.remove(row["filepath"])
    await database.execute("DELETE FROM corpora WHERE id = :id", {"id": corpus_id})
    return {"ok": True}

import os
import re
from datetime import datetime
from fastapi import APIRouter, HTTPException

from database import database
from models import ParseTextRequest, ParseCorpusRequest
from services.parser_service import parse_text, parse_sentences_to_file
from services.corpus_service import get_corpus_meta, CORPORA_DIR

router = APIRouter()


def _clean_corpus_name(name: str | None, corpus_id: str) -> str:
    if name:
        cleaned = re.sub(r"\s+", " ", name).strip()
        if cleaned:
            return cleaned[:80]
    timestamp = datetime.now().strftime("%Y%m%d_%H%M")
    return f"stanza_text_{timestamp}_{corpus_id[:8]}"


@router.post("/text")
async def parse_text_endpoint(req: ParseTextRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Le texte ne peut pas être vide")
    try:
        conllu = parse_text(req.text)
        return {"conllu": conllu}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur de parsing : {str(e)}")


@router.post("/corpus")
async def parse_corpus_endpoint(req: ParseCorpusRequest):
    if not req.sentences:
        raise HTTPException(status_code=400, detail="La liste de phrases est vide")
    try:
        corpus_id, filepath = parse_sentences_to_file(req.sentences, CORPORA_DIR)
        meta = get_corpus_meta(filepath)
        corpus_name = _clean_corpus_name(req.name, corpus_id)

        query = """INSERT INTO corpora (id, name, filepath, num_sentences, num_tokens)
                   VALUES (:id, :name, :filepath, :num_sentences, :num_tokens)"""
        await database.execute(query, {
            "id": corpus_id, "name": corpus_name,
            "filepath": filepath,
            "num_sentences": meta["num_sentences"], "num_tokens": meta["num_tokens"],
        })

        return {"corpus_id": corpus_id, "name": corpus_name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur de parsing : {str(e)}")

import json
import re
import asyncio
import logging
from typing import List, Dict, Any

from detectors.base import BaseDetector
from models import DetectionResult
from services.ollama_service import generate

logger = logging.getLogger(__name__)

DEFAULT_PROMPT_TEMPLATE = """You are a strict Universal Dependencies (UD) annotation auditor for French.

Task: decide whether the annotation below is acceptable for the sentence.
Judge ONLY the UD annotation, not whether the sentence is well written.
The annotation may come from an official UD corpus, from Stanza, or from an injected-error variant of either.
Do not assume the source is gold; judge only the CoNLL-U analysis shown here.
Focus on UPOS, HEAD and DEPREL. HEAD=0 means root.

Sentence: "{sentence_text}"

CoNLL-U columns:
{conllu_formatted}

Return is_correct=false if one or more tokens has a likely wrong UPOS, HEAD or DEPREL.
Return is_correct=true if the annotation is acceptable, even if another valid parse is possible.
suspect_tokens must contain only integer token IDs.
confidence is your confidence in the boolean verdict, from 0.0 to 1.0, using a dot decimal.
explanation must be brief, in French, max 20 words.

Reply ONLY with valid JSON, no markdown, no extra text:
{"is_correct": true, "confidence": 0.9, "suspect_tokens": [], "explanation": "annotation acceptable"}"""

BATCH_PROMPT_TEMPLATE = """You are a strict Universal Dependencies (UD) annotation auditor for French.

Evaluate each dependency parse independently.
Judge ONLY the UD annotation, not whether the sentence is well written.
The annotation may come from an official UD corpus, from Stanza, or from an injected-error variant of either.
Do not assume the source is gold; judge only the CoNLL-U analysis shown here.
Focus on UPOS, HEAD and DEPREL. HEAD=0 means root.
Return is_correct=false if one or more tokens has a likely wrong UPOS, HEAD or DEPREL.
Return is_correct=true if the annotation is acceptable, even if another valid parse is possible.
suspect_tokens must contain only integer token IDs.
confidence is your confidence in the boolean verdict, from 0.0 to 1.0, using a dot decimal.
explanation must be brief, in French, max 20 words.

{batch_entries}

Reply with EXACTLY {batch_size} JSON objects, one per line, in order. No markdown, no extra text:
{"id": 1, "is_correct": true, "confidence": 0.9, "suspect_tokens": [], "explanation": "annotation acceptable"}
{"id": 2, "is_correct": false, "confidence": 0.8, "suspect_tokens": [3], "explanation": "relation ou tête suspecte"}"""


class LLMJudgeDetector(BaseDetector):
    name = "llm_judge"
    description = "LLM-as-a-judge : utilise un LLM local (Ollama) pour évaluer la correction des analyses syntaxiques"
    is_implemented = True

    def __init__(self, model: str = "llama3", prompt_template: str = None,
                 temperature: float = 0.1, timeout: float = 120.0,
                 few_shot_examples: list = None, concurrency: int = 1,
                 batch_size: int = 1, **kwargs):
        self.model = str(model or "llama3").strip() or "llama3"
        self.prompt_template = prompt_template or DEFAULT_PROMPT_TEMPLATE
        try:
            self.temperature = max(0.0, min(float(temperature), 2.0))
        except (TypeError, ValueError):
            self.temperature = 0.1
        try:
            self.timeout = max(10.0, float(timeout))
        except (TypeError, ValueError):
            self.timeout = 120.0
        self.few_shot_examples = few_shot_examples or []
        try:
            self.concurrency = max(1, min(int(concurrency), 8))
        except (TypeError, ValueError):
            self.concurrency = 1
        try:
            self.batch_size = max(1, min(int(batch_size), 10))
        except (TypeError, ValueError):
            self.batch_size = 1

    def _format_conllu(self, tokens: list) -> str:
        lines = ["ID\tFORM\tUPOS\tHEAD\tDEPREL"]
        for t in tokens:
            lines.append(f"{t['id']}\t{t['form']}\t{t['upos']}\t{t['head']}\t{t['deprel']}")
        return "\n".join(lines)

    def _format_prompt(self, sentence: dict) -> str:
        conllu_formatted = self._format_conllu(sentence["tokens"])
        prompt = self.prompt_template.replace("{sentence_text}", sentence["text"])
        prompt = prompt.replace("{conllu_formatted}", conllu_formatted)
        prompt = prompt.replace("{num_tokens}", str(len(sentence["tokens"])))
        prompt = prompt.replace("{language}", "français")

        if self.few_shot_examples:
            few_shot_text = "\nExemples :\n"
            for ex in self.few_shot_examples:
                few_shot_text += f"\nInput:\n{ex.get('input', '')}\nOutput:\n{ex.get('output', '')}\n"
            prompt = few_shot_text + "\nMaintenant, évalue cette analyse :\n\n" + prompt

        return prompt

    def _format_batch_prompt(self, sentences: List[dict]) -> str:
        entries = []
        for i, sent in enumerate(sentences, 1):
            conllu = self._format_conllu(sent["tokens"])
            entries.append(f"Parse {i}:\nSentence: \"{sent['text']}\"\n{conllu}")
        batch_entries = "\n\n".join(entries)
        return BATCH_PROMPT_TEMPLATE.replace("{batch_entries}", batch_entries).replace("{batch_size}", str(len(sentences)))

    def _parse_response(self, raw: str) -> dict:
        raw = raw.strip()
        raw = re.sub(r'^```(?:json)?\s*', '', raw)
        raw = re.sub(r'\s*```$', '', raw)

        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            pass

        match = re.search(r'\{[^{}]*"is_correct"[^{}]*\}', raw, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass

        lower = raw.lower()
        if "incorrect" in lower or "erreur" in lower or "false" in lower:
            return {"is_correct": False, "confidence": 0.5, "suspect_tokens": [], "explanation": raw[:200]}
        elif "correct" in lower or "true" in lower:
            return {"is_correct": True, "confidence": 0.5, "suspect_tokens": [], "explanation": raw[:200]}

        return {"is_correct": True, "confidence": 0.3, "suspect_tokens": [], "explanation": f"Could not parse: {raw[:200]}"}

    def _parse_batch_response(self, raw: str, expected_count: int) -> List[dict]:
        raw = raw.strip()
        raw = re.sub(r'^```(?:json)?\s*', '', raw)
        raw = re.sub(r'\s*```$', '', raw)

        # Try to parse as JSON array
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return parsed
        except json.JSONDecodeError:
            pass

        # Find all JSON objects in the response
        results = []
        for match in re.finditer(r'\{[^{}]*"is_correct"[^{}]*\}', raw, re.DOTALL):
            try:
                obj = json.loads(match.group())
                results.append(obj)
            except json.JSONDecodeError:
                continue

        if results:
            return results

        # Fallback: return single parse for all
        single = self._parse_response(raw)
        return [single] * expected_count

    def _coerce_bool(self, value: Any, default: bool = True) -> bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            lowered = value.strip().lower()
            if lowered in {"true", "vrai", "yes", "oui", "correct"}:
                return True
            if lowered in {"false", "faux", "no", "non", "incorrect"}:
                return False
        return default

    def _coerce_confidence(self, value: Any, default: float = 0.5) -> float:
        try:
            if isinstance(value, str):
                value = value.strip().replace(",", ".")
            confidence = float(value)
        except (TypeError, ValueError):
            confidence = default
        return max(0.0, min(1.0, confidence))

    async def _detect_one(self, sent: dict, semaphore: asyncio.Semaphore) -> DetectionResult:
        async with semaphore:
            try:
                prompt = self._format_prompt(sent)
                raw_response = await generate(
                    model=self.model,
                    prompt=prompt,
                    temperature=self.temperature,
                    timeout=self.timeout,
                )

                if raw_response.startswith("Error:"):
                    return DetectionResult(
                        sentence_id=sent["id"],
                        is_correct=True,
                        confidence=0.0,
                        details={"error": raw_response, "num_tokens": len(sent["tokens"])},
                    )

                parsed = self._parse_response(raw_response)
                is_correct = self._coerce_bool(parsed.get("is_correct", True), True)
                confidence = self._coerce_confidence(parsed.get("confidence", 0.5), 0.5)
                return DetectionResult(
                    sentence_id=sent["id"],
                    is_correct=is_correct,
                    confidence=confidence,
                    details={
                        "suspect_tokens": parsed.get("suspect_tokens", []),
                        "explanation": parsed.get("explanation", ""),
                        "num_tokens": len(sent["tokens"]),
                        "raw_response_preview": raw_response[:500],
                    },
                )
            except Exception as e:
                logger.error(f"LLM judge failed on sentence {sent['id']}: {e}")
                return DetectionResult(
                    sentence_id=sent["id"],
                    is_correct=True,
                    confidence=0.0,
                    details={"error": str(e), "num_tokens": len(sent["tokens"])},
                )

    async def _detect_batch(self, batch: List[dict], semaphore: asyncio.Semaphore) -> List[DetectionResult]:
        async with semaphore:
            try:
                prompt = self._format_batch_prompt(batch)
                num_predict = 100 * len(batch)
                raw_response = await generate(
                    model=self.model,
                    prompt=prompt,
                    temperature=self.temperature,
                    timeout=self.timeout,
                    num_predict=num_predict,
                )

                if raw_response.startswith("Error:"):
                    return [
                        DetectionResult(
                            sentence_id=sent["id"],
                            is_correct=True,
                            confidence=0.0,
                            details={"error": raw_response, "num_tokens": len(sent["tokens"])},
                        )
                        for sent in batch
                    ]

                parsed_list = self._parse_batch_response(raw_response, len(batch))
                parsed_by_id = {
                    int(item["id"]): item
                    for item in parsed_list
                    if isinstance(item, dict) and str(item.get("id", "")).isdigit()
                }

                results = []
                for i, sent in enumerate(batch):
                    if parsed_by_id:
                        parsed = parsed_by_id.get(i + 1, {
                            "is_correct": True,
                            "confidence": 0.3,
                            "suspect_tokens": [],
                            "explanation": "Réponse absente pour ce parse",
                        })
                    elif i < len(parsed_list):
                        parsed = parsed_list[i]
                    else:
                        parsed = {"is_correct": True, "confidence": 0.3, "suspect_tokens": [], "explanation": "Réponse absente pour ce parse"}

                    results.append(DetectionResult(
                        sentence_id=sent["id"],
                        is_correct=self._coerce_bool(parsed.get("is_correct", True), True),
                        confidence=self._coerce_confidence(parsed.get("confidence", 0.5), 0.5),
                        details={
                            "suspect_tokens": parsed.get("suspect_tokens", []),
                            "explanation": parsed.get("explanation", ""),
                            "num_tokens": len(sent["tokens"]),
                            "raw_response_preview": raw_response[:500],
                        },
                    ))
                return results

            except Exception as e:
                logger.error(f"LLM judge batch failed: {e}")
                return [
                    DetectionResult(
                        sentence_id=sent["id"],
                        is_correct=True,
                        confidence=0.0,
                        details={"error": str(e), "num_tokens": len(sent["tokens"])},
                    )
                    for sent in batch
                ]

    async def detect(self, sentences: List[Dict[str, Any]], progress_callback=None) -> List[DetectionResult]:
        semaphore = asyncio.Semaphore(self.concurrency)

        if self.batch_size <= 1:
            async def run_one(index: int, sent: dict):
                return index, await self._detect_one(sent, semaphore)

            tasks = [run_one(i, sent) for i, sent in enumerate(sentences)]
            results = [None] * len(sentences)
            completed = 0
            for task in asyncio.as_completed(tasks):
                index, result = await task
                results[index] = result
                completed += 1
                if progress_callback:
                    await progress_callback({
                        "completed": completed,
                        "total": len(sentences),
                        "current_sentence_id": sentences[index].get("id", ""),
                        "current_sentence_text": sentences[index].get("text", ""),
                    })
            return results

        # Batch mode: group sentences and send fewer API calls
        batches = []
        for i in range(0, len(sentences), self.batch_size):
            batches.append(sentences[i:i + self.batch_size])

        logger.info(f"LLM judge: {len(sentences)} sentences in {len(batches)} batches of ~{self.batch_size}")

        async def run_batch(index: int, batch: list):
            return index, await self._detect_batch(batch, semaphore)

        tasks = [run_batch(i, batch) for i, batch in enumerate(batches)]
        batch_results = [None] * len(batches)
        completed_sentences = 0
        for task in asyncio.as_completed(tasks):
            batch_index, result = await task
            batch_results[batch_index] = result
            completed_sentences += len(batches[batch_index])
            if progress_callback:
                first_sent = batches[batch_index][0] if batches[batch_index] else {}
                await progress_callback({
                    "completed": min(completed_sentences, len(sentences)),
                    "total": len(sentences),
                    "batch_index": batch_index + 1,
                    "batch_total": len(batches),
                    "current_sentence_id": first_sent.get("id", ""),
                    "current_sentence_text": first_sent.get("text", ""),
                })

        # Flatten results
        results = []
        for batch_result in batch_results:
            results.extend(batch_result)
        return results

    def get_config_schema(self) -> dict:
        return {
            "model": {"type": "string", "default": "llama3", "description": "Nom du modèle Ollama"},
            "prompt_template": {"type": "string", "description": "Template de prompt"},
            "temperature": {"type": "number", "default": 0.1, "min": 0, "max": 2},
            "timeout": {"type": "number", "default": 120, "description": "Timeout en secondes"},
            "few_shot_examples": {"type": "array", "description": "Exemples few-shot"},
            "concurrency": {"type": "integer", "default": 1, "min": 1, "max": 8, "description": "Nombre de requêtes parallèles vers Ollama"},
            "batch_size": {"type": "integer", "default": 1, "min": 1, "max": 10, "description": "Nombre de phrases par requête LLM (batch)"},
        }

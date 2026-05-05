import stanza
import os
import uuid

_nlp = None


def _get_pipeline():
    global _nlp
    if _nlp is None:
        _nlp = stanza.Pipeline("fr", processors="tokenize,mwt,pos,lemma,depparse", verbose=False)
    return _nlp


def parse_text(text: str) -> str:
    nlp = _get_pipeline()
    doc = nlp(text)
    conllu_lines = []
    for i, sent in enumerate(doc.sentences):
        conllu_lines.append(f"# sent_id = s{i+1}")
        conllu_lines.append(f"# text = {sent.text}")
        for word in sent.words:
            fields = [
                str(word.id),
                word.text,
                word.lemma if word.lemma else "_",
                word.upos if word.upos else "_",
                word.xpos if word.xpos else "_",
                str(word.feats) if word.feats else "_",
                str(word.head),
                word.deprel if word.deprel else "_",
                "_",
                "_",
            ]
            conllu_lines.append("\t".join(fields))
        conllu_lines.append("")
    return "\n".join(conllu_lines)


def parse_sentences_to_file(sentences: list[str], output_dir: str) -> tuple[str, str]:
    corpus_id = str(uuid.uuid4())
    filepath = os.path.join(output_dir, f"{corpus_id}.conllu")
    nlp = _get_pipeline()

    conllu_lines = []
    for i, text in enumerate(sentences):
        doc = nlp(text)
        for j, sent in enumerate(doc.sentences):
            conllu_lines.append(f"# sent_id = s{i+1}_{j+1}")
            conllu_lines.append(f"# text = {sent.text}")
            for word in sent.words:
                fields = [
                    str(word.id),
                    word.text,
                    word.lemma if word.lemma else "_",
                    word.upos if word.upos else "_",
                    word.xpos if word.xpos else "_",
                    str(word.feats) if word.feats else "_",
                    str(word.head),
                    word.deprel if word.deprel else "_",
                    "_",
                    "_",
                ]
                conllu_lines.append("\t".join(fields))
            conllu_lines.append("")

    with open(filepath, "w", encoding="utf-8") as f:
        f.write("\n".join(conllu_lines))

    return corpus_id, filepath

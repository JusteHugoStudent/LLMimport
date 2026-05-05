export function parseConllu(text) {
  const sentences = []
  const blocks = text.trim().split(/\n\s*\n/)

  for (const block of blocks) {
    const lines = block.trim().split('\n')
    const metadata = {}
    const tokens = []

    for (const line of lines) {
      if (line.startsWith('#')) {
        const match = line.match(/^#\s*(\w+)\s*=\s*(.+)$/)
        if (match) metadata[match[1]] = match[2].trim()
        continue
      }
      const parts = line.split('\t')
      if (parts.length >= 10) {
        const id = parts[0]
        if (id.includes('-') || id.includes('.')) continue
        tokens.push({
          id: parseInt(id),
          form: parts[1],
          lemma: parts[2],
          upos: parts[3],
          xpos: parts[4],
          feats: parts[5],
          head: parseInt(parts[6]),
          deprel: parts[7],
          deps: parts[8],
          misc: parts[9],
        })
      }
    }

    if (tokens.length > 0) {
      sentences.push({
        id: metadata.sent_id || `s${sentences.length + 1}`,
        text: metadata.text || tokens.map(t => t.form).join(' '),
        tokens,
      })
    }
  }

  return sentences
}

export const POS_COLORS = {
  NOUN: '#3b82f6',
  VERB: '#ef4444',
  DET: '#22c55e',
  ADJ: '#f97316',
  ADV: '#a855f7',
  ADP: '#06b6d4',
  PRON: '#ec4899',
  PROPN: '#6366f1',
  AUX: '#f43f5e',
  CCONJ: '#84cc16',
  SCONJ: '#14b8a6',
  PUNCT: '#9ca3af',
  NUM: '#eab308',
  PART: '#78716c',
  INTJ: '#d946ef',
  SYM: '#64748b',
  X: '#94a3b8',
}

export function getPosColor(pos) {
  return POS_COLORS[pos] || '#6b7280'
}

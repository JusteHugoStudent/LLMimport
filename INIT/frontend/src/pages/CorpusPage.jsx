import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Download, FilePlus2, Filter, MoreHorizontal, Search, Sparkles, Trash2, Upload, X } from 'lucide-react'
import api from '../api/client'

function formatDate(value) {
  return value ? String(value).slice(0, 10) : '-'
}

function CorpusList() {
  const navigate = useNavigate()
  const [corpora, setCorpora] = useState([])
  const [showImport, setShowImport] = useState(false)
  const [showTextImport, setShowTextImport] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [rawText, setRawText] = useState('')
  const [error, setError] = useState('')

  const load = () => api.get('/corpus').then(res => setCorpora(res.data)).catch(() => setCorpora([]))

  useEffect(() => { load() }, [])

  const uploadCorpus = async (file) => {
    if (!file) return
    setUploading(true)
    setError('')
    const form = new FormData()
    form.append('file', file)
    try {
      await api.post('/corpus/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      setShowImport(false)
      await load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Import impossible')
    } finally {
      setUploading(false)
    }
  }

  const createFromText = async () => {
    let sentences = rawText.split(/\n+/).map(line => line.trim()).filter(Boolean)
    if (sentences.length <= 1) {
      sentences = (rawText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [])
        .map(sentence => sentence.trim())
        .filter(Boolean)
    }
    if (sentences.length === 0) {
      setError('Ajoute au moins une phrase.')
      return
    }

    setParsing(true)
    setError('')
    try {
      const res = await api.post('/parse/corpus', { sentences })
      setShowTextImport(false)
      setRawText('')
      await load()
      navigate(`/corpus/${res.data.corpus_id}`)
    } catch (err) {
      setError(err.response?.data?.detail || 'Parsing impossible')
    } finally {
      setParsing(false)
    }
  }

  const removeCorpus = async (event, id) => {
    event.preventDefault()
    event.stopPropagation()
    if (!confirm('Supprimer ce corpus ?')) return
    await api.delete(`/corpus/${id}`)
    await load()
  }

  const totalTokens = corpora.reduce((sum, c) => sum + (c.num_tokens || 0), 0)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="row gap-sm mb-sm">
            <span className="numeral">I.</span>
            <span className="smallcaps">Bibliothèque</span>
          </div>
          <h1 className="page-title">Corpus</h1>
          <p className="page-sub">Corpus annotés au format CoNLL-U.</p>
        </div>
        <div className="row gap-md" style={{ flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => { setError(''); setShowTextImport(true) }}><Sparkles size={14} /> Depuis texte brut</button>
          <button className="btn btn-accent" onClick={() => setShowImport(true)}><Upload size={14} /> Importer .conllu</button>
        </div>
      </div>

      <div className="row gap-md mb-md" style={{ flexWrap: 'wrap' }}>
        <div style={{ flex: 1, position: 'relative', maxWidth: 360 }}>
          <Search size={16} style={{ position: 'absolute', left: 10, top: 8, color: 'var(--ink-3)' }} />
          <input className="input" placeholder="Rechercher un corpus..." style={{ paddingLeft: 32 }} />
        </div>
        <button className="btn btn-ghost"><Filter size={14} /> Filtres</button>
        <div style={{ flex: 1 }} />
        <span className="muted" style={{ fontSize: 12 }}>{corpora.length} corpus · {totalTokens.toLocaleString('fr-FR')} tokens</span>
      </div>

      <div className="card">
        {corpora.length === 0 ? (
          <div className="empty">
            <div className="empty-mark">·</div>
            Aucun corpus importé
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Nom</th>
                <th style={{ width: 120 }}>ID</th>
                <th style={{ width: 100, textAlign: 'right' }}>Phrases</th>
                <th style={{ width: 110, textAlign: 'right' }}>Tokens</th>
                <th style={{ width: 130 }}>Importé</th>
                <th style={{ width: 60 }} />
              </tr>
            </thead>
            <tbody>
              {corpora.map(corpus => (
                <tr key={corpus.id} style={{ cursor: 'pointer' }}>
                  <td>
                    <Link to={`/corpus/${corpus.id}`} style={{ textDecoration: 'none' }}>
                      <div style={{ fontWeight: 500, color: 'var(--ink)' }}>{corpus.name}</div>
                      <div className="mono muted-2" style={{ fontSize: 11, marginTop: 2 }}>{corpus.id}</div>
                    </Link>
                  </td>
                  <td><span className="mono muted" style={{ fontSize: 11.5 }}>{corpus.id.slice(0, 8)}</span></td>
                  <td style={{ textAlign: 'right' }}>{corpus.num_sentences?.toLocaleString('fr-FR')}</td>
                  <td style={{ textAlign: 'right' }}>{corpus.num_tokens?.toLocaleString('fr-FR')}</td>
                  <td><span className="muted">{formatDate(corpus.created_at)}</span></td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={(e) => removeCorpus(e, corpus.id)} style={{ padding: 4, color: 'var(--terracotta)' }}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showImport && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,15,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowImport(false)}>
          <div className="card" style={{ width: 540, padding: 0 }} onClick={(e) => e.stopPropagation()}>
            <div className="between" style={{ padding: '16px 20px', borderBottom: '1px solid var(--line-2)' }}>
              <div className="row gap-sm">
                <span className="numeral" style={{ fontSize: 14 }}>·</span>
                <span style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 500 }}>Importer un corpus</span>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowImport(false)} style={{ padding: 4 }}><X size={14} /></button>
            </div>
            <div style={{ padding: 22 }}>
              <label style={{ border: '1.5px dashed var(--line)', borderRadius: 8, padding: 36, textAlign: 'center', background: 'var(--bg-elev)', display: 'block', cursor: 'pointer' }}>
                <Upload size={28} style={{ margin: '0 auto 8px', color: 'var(--terracotta)' }} />
                <div style={{ fontWeight: 500, marginBottom: 4 }}>{uploading ? 'Import en cours...' : 'Sélectionner un fichier .conllu'}</div>
                <input type="file" accept=".conllu" style={{ display: 'none' }} disabled={uploading} onChange={(e) => uploadCorpus(e.target.files?.[0])} />
              </label>
              {error && <div className="pill pill-danger mt-md">{error}</div>}
            </div>
          </div>
        </div>
      )}

      {showTextImport && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,15,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setShowTextImport(false)}>
          <div className="card" style={{ width: 620, padding: 0, maxWidth: '100%' }} onClick={(e) => e.stopPropagation()}>
            <div className="between" style={{ padding: '16px 20px', borderBottom: '1px solid var(--line-2)' }}>
              <div className="row gap-sm">
                <span className="numeral" style={{ fontSize: 14 }}>·</span>
                <span style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 500 }}>Créer depuis texte brut</span>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowTextImport(false)} style={{ padding: 4 }}><X size={14} /></button>
            </div>
            <div style={{ padding: 22 }}>
              <label className="label">Phrases</label>
              <textarea
                className="textarea"
                rows={10}
                value={rawText}
                onChange={(event) => setRawText(event.target.value)}
                placeholder="Une phrase par ligne, ou un paragraphe court."
              />
              <div className="between mt-md">
                <span className="muted" style={{ fontSize: 12 }}>Analyse locale via Stanza puis sauvegarde en CoNLL-U.</span>
                <button className="btn btn-accent" onClick={createFromText} disabled={parsing}>
                  <Sparkles size={14} /> {parsing ? 'Analyse...' : 'Créer le corpus'}
                </button>
              </div>
              {error && <div className="pill pill-danger mt-md">{error}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CorpusDetail({ id }) {
  const navigate = useNavigate()
  const [corpus, setCorpus] = useState(null)
  const [stats, setStats] = useState(null)
  const [tab, setTab] = useState('stats')
  const [sentences, setSentences] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filterDeprel, setFilterDeprel] = useState('')
  const [minLength, setMinLength] = useState('')
  const [maxLength, setMaxLength] = useState('')
  const [openSentence, setOpenSentence] = useState(null)

  useEffect(() => {
    api.get(`/corpus/${id}`).then(res => setCorpus(res.data)).catch(() => navigate('/corpus'))
    api.get(`/corpus/${id}/stats`).then(res => setStats(res.data)).catch(() => setStats(null))
  }, [id, navigate])

  const loadSentences = () => {
    const params = { page, per_page: 50 }
    if (filterDeprel) params.filter_deprel = filterDeprel
    if (minLength) params.min_length = parseInt(minLength)
    if (maxLength) params.max_length = parseInt(maxLength)
    api.get(`/corpus/${id}/sentences`, { params }).then(res => {
      setSentences(res.data.sentences)
      setTotal(res.data.total)
    }).catch(() => {
      setSentences([])
      setTotal(0)
    })
  }

  useEffect(() => { if (tab === 'sents') loadSentences() }, [tab, page, id])

  if (!corpus) return <div className="page"><div className="empty">Chargement...</div></div>

  return (
    <div className="page">
      <div className="row gap-sm mb-md">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/corpus')}>Corpus</button>
        <span className="muted-2">/</span>
        <span className="mono muted" style={{ fontSize: 11.5 }}>{corpus.id.slice(0, 8)}</span>
      </div>

      <div className="page-header">
        <div>
          <div className="row gap-sm mb-sm"><span className="smallcaps">Corpus</span></div>
          <h1 className="page-title">{corpus.name}</h1>
          <div className="row gap-md mt-sm">
            <span className="mono muted" style={{ fontSize: 12 }}>{corpus.filepath}</span>
            <span className="muted-2">·</span>
            <span className="muted" style={{ fontSize: 12 }}>importé le {formatDate(corpus.created_at)}</span>
          </div>
        </div>
        <div className="row gap-md">
          <button className="btn"><Download size={14} /> Télécharger</button>
          <Link className="btn btn-accent" to="/experiments/new"><FilePlus2 size={14} /> Lancer une expérience</Link>
        </div>
      </div>

      <div className="card mb-lg">
        <div className="stat-row" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
          <div className="stat"><div className="stat-label">Phrases</div><div className="stat-value">{corpus.num_sentences}</div></div>
          <div className="stat"><div className="stat-label">Tokens</div><div className="stat-value">{corpus.num_tokens?.toLocaleString('fr-FR')}</div></div>
          <div className="stat"><div className="stat-label">Long. moy.</div><div className="stat-value">{stats?.length_stats?.mean ?? '-'}</div><div className="stat-sub">médiane {stats?.length_stats?.median ?? '-'} · min {stats?.length_stats?.min ?? '-'} · max {stats?.length_stats?.max ?? '-'}</div></div>
          <div className="stat"><div className="stat-label">Profondeur</div><div className="stat-value">{stats?.avg_tree_depth ?? '-'}</div></div>
          <div className="stat"><div className="stat-label">UPOS uniques</div><div className="stat-value">{Object.keys(stats?.pos_distribution || {}).length}</div></div>
          <div className="stat"><div className="stat-label">DEPREL uniques</div><div className="stat-value">{Object.keys(stats?.deprel_distribution || {}).length}</div></div>
        </div>
      </div>

      <div className="tabs">
        {[['stats','Statistiques'], ['sents','Phrases'], ['raw','CoNLL-U brut']].map(([key, label]) => (
          <div key={key} className={`tab${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>{label}</div>
        ))}
      </div>

      {tab === 'stats' && <CorpusStats stats={stats} />}
      {tab === 'sents' && (
        <SentenceList
          corpusId={id}
          sentences={sentences}
          total={total}
          page={page}
          setPage={setPage}
          filterDeprel={filterDeprel}
          setFilterDeprel={setFilterDeprel}
          minLength={minLength}
          setMinLength={setMinLength}
          maxLength={maxLength}
          setMaxLength={setMaxLength}
          onFilter={() => { setPage(1); loadSentences() }}
          openSentence={openSentence}
          setOpenSentence={setOpenSentence}
        />
      )}
      {tab === 'raw' && <div className="codeblock">Le fichier brut est disponible dans {corpus.filepath}</div>}
    </div>
  )
}

function CorpusStats({ stats }) {
  if (!stats) return <div className="empty">Statistiques indisponibles</div>
  const pos = Object.entries(stats.pos_distribution || {}).slice(0, 14)
  const deprels = Object.entries(stats.deprel_distribution || {}).slice(0, 14)
  const maxPos = Math.max(...pos.map(([, n]) => n), 1)
  const maxDeprel = Math.max(...deprels.map(([, n]) => n), 1)

  return (
    <div className="grid-2">
      <Distribution title="Distribution UPOS" items={pos} max={maxPos} />
      <Distribution title="Distribution DEPREL" items={deprels} max={maxDeprel} accent />
      <div className="card card-pad" style={{ gridColumn: '1 / -1' }}>
        <div className="between mb-md">
          <h3 className="section-title" style={{ fontSize: 18 }}>Top combinaisons UPOS + DEPREL</h3>
        </div>
        <div className="grid-4" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {(stats.top_pos_deprel || []).slice(0, 8).map((row, index) => (
            <div key={`${row.pos}-${row.deprel}-${index}`} style={{ padding: '10px 12px', border: '1px solid var(--line-2)', borderRadius: 6, background: 'var(--bg-elev)' }}>
              <div className="mono" style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                <span style={{ color: 'var(--aegean)' }}>{row.pos}</span> + <span style={{ color: 'var(--terracotta)' }}>{row.deprel}</span>
              </div>
              <div className="mono" style={{ fontSize: 14, fontWeight: 600, marginTop: 3 }}>{row.count.toLocaleString('fr-FR')}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Distribution({ title, items, max, accent = false }) {
  return (
    <div className="card card-pad">
      <div className="between mb-md">
        <h3 className="section-title" style={{ fontSize: 18 }}>{title}</h3>
        <span className="muted" style={{ fontSize: 11.5 }}>{items.length} entrées</span>
      </div>
      {items.map(([label, count]) => (
        <div key={label} className="bar-row">
          <span className="bar-lbl" style={accent ? { color: 'var(--terracotta)' } : undefined}>{label}</span>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${(count / max) * 95}%`, background: accent ? 'var(--terracotta)' : 'var(--ink)' }} /></div>
          <span className="bar-val">{count.toLocaleString('fr-FR')}</span>
        </div>
      ))}
    </div>
  )
}

function SentenceList(props) {
  const totalPages = Math.max(1, Math.ceil(props.total / 50))
  return (
    <div>
      <div className="row gap-md mb-md">
        <select className="select" style={{ maxWidth: 180 }} value={props.filterDeprel} onChange={e => props.setFilterDeprel(e.target.value)}>
          <option value="">Toutes les relations</option>
          {['nsubj', 'obj', 'obl', 'nmod', 'amod', 'det', 'case'].map(rel => <option key={rel} value={rel}>{rel}</option>)}
        </select>
        <div className="row gap-sm">
          <span className="muted" style={{ fontSize: 12 }}>Long.</span>
          <input className="input" type="number" value={props.minLength} onChange={e => props.setMinLength(e.target.value)} style={{ width: 60 }} />
          <span className="muted-2">-</span>
          <input className="input" type="number" value={props.maxLength} onChange={e => props.setMaxLength(e.target.value)} style={{ width: 60 }} />
        </div>
        <button className="btn btn-sm" onClick={props.onFilter}>Filtrer</button>
        <div style={{ flex: 1 }} />
        <span className="muted" style={{ fontSize: 12 }}>{props.total} phrases · page {props.page}/{totalPages}</span>
        <button className="btn btn-sm btn-ghost" disabled={props.page === 1} onClick={() => props.setPage(p => Math.max(1, p - 1))}>‹</button>
        <button className="btn btn-sm btn-ghost" disabled={props.page === totalPages} onClick={() => props.setPage(p => Math.min(totalPages, p + 1))}>›</button>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {props.sentences.map(sentence => {
          const isOpen = props.openSentence === sentence.id
          return (
            <div key={sentence.id} style={{ borderBottom: '1px solid var(--line-3)' }}>
              <div className="between" style={{ padding: '12px 18px', cursor: 'pointer' }} onClick={() => props.setOpenSentence(isOpen ? null : sentence.id)}>
                <div className="row gap-md" style={{ flex: 1 }}>
                  <span className="mono muted-2" style={{ fontSize: 11.5, width: 80 }}>{sentence.id}</span>
                  <span style={{ flex: 1, fontFamily: 'var(--serif)', fontSize: 15 }}>{sentence.text}</span>
                </div>
                <span className="pill pill-mute">{sentence.num_tokens} tokens</span>
                <MoreHorizontal size={14} style={{ color: 'var(--ink-4)' }} />
              </div>
              {isOpen && <SentenceDetail corpusId={props.corpusId} sentenceId={sentence.id} />}
            </div>
          )
        })}
        {props.sentences.length === 0 && <div className="empty">Aucune phrase</div>}
      </div>
    </div>
  )
}

function SentenceDetail({ corpusId, sentenceId }) {
  const [sentence, setSentence] = useState(null)
  useEffect(() => {
    api.get(`/corpus/${corpusId}/sentences/${sentenceId}`).then(res => setSentence(res.data)).catch(() => setSentence(null))
  }, [corpusId, sentenceId])

  if (!sentence) return <div className="empty">Chargement...</div>

  return (
    <div style={{ padding: '0 18px 20px' }}>
      <DependencyView sentence={sentence} />
    </div>
  )
}

function DependencyView({ sentence }) {
  const tokens = sentence.tokens || []
  const tokenById = useMemo(() => Object.fromEntries(tokens.map(t => [t.id, t])), [tokens])
  const tokenWidth = 90
  const baselineY = 112
  const width = tokens.length * tokenWidth + 50
  const height = 205
  const posColor = {
    NOUN: 'var(--ink-2)', VERB: 'var(--terracotta)', PROPN: 'var(--aegean)',
    DET: 'var(--ink-3)', ADP: 'var(--ink-3)', ADJ: 'var(--olive)',
    PRON: 'var(--ink-3)', PUNCT: 'var(--ink-4)', AUX: 'var(--ink-3)',
  }

  return (
    <div className="depvis">
      <div className="between mb-md">
        <div>
          <div className="row gap-sm mb-sm"><span className="mono muted" style={{ fontSize: 11.5 }}>{sentence.id}</span></div>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 18 }}>{sentence.text}</div>
        </div>
      </div>
      <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
        <svg width={width} height={height} style={{ display: 'block' }}>
          {tokens.map(token => {
            if (!token.head || token.head === 0 || !tokenById[token.head]) return null
            const tokenIndex = tokens.findIndex(t => t.id === token.id)
            const headIndex = tokens.findIndex(t => t.id === token.head)
            const x1 = 30 + tokenIndex * tokenWidth + tokenWidth / 2
            const x2 = 30 + headIndex * tokenWidth + tokenWidth / 2
            const arcHeight = Math.min(70, 18 + Math.abs(headIndex - tokenIndex) * 10)
            const y0 = baselineY - 8
            const cx = (x1 + x2) / 2
            const cy = y0 - arcHeight
            return (
              <g key={`${token.id}-${token.head}`}>
                <path d={`M ${x1} ${y0} Q ${cx} ${cy} ${x2} ${y0}`} fill="none" stroke="var(--ink-3)" strokeWidth="1" opacity="0.56" />
                <path d={`M ${x2 - 3} ${y0 - 4} L ${x2} ${y0} L ${x2 + 3} ${y0 - 4}`} fill="none" stroke="var(--ink-3)" strokeWidth="1" opacity="0.7" />
                <rect x={cx - String(token.deprel).length * 3.5} y={cy - 8} width={String(token.deprel).length * 7} height={14} rx={3} fill="var(--bg-elev)" />
                <text x={cx} y={cy + 2} textAnchor="middle" fontSize="10.5" fontFamily="var(--mono)" fill="var(--aegean)" fontWeight="500">{token.deprel}</text>
              </g>
            )
          })}
          {tokens.map((token, index) => {
            const x = 30 + index * tokenWidth + tokenWidth / 2
            return (
              <g key={token.id}>
                <text x={x} y={baselineY - 18} textAnchor="middle" fontSize="9.5" fontFamily="var(--mono)" fill="var(--ink-4)">{token.id}</text>
                <text x={x} y={baselineY + 6} textAnchor="middle" fontSize="14" fontFamily="var(--serif)" fontWeight="500" fill="var(--ink)">{token.form}</text>
                <rect x={x - 22} y={baselineY + 14} width={44} height={16} rx={3} fill="var(--bg-sunk)" />
                <text x={x} y={baselineY + 25} textAnchor="middle" fontSize="9.5" fontFamily="var(--mono)" fontWeight="600" fill={posColor[token.upos] || 'var(--ink-3)'}>{token.upos}</text>
              </g>
            )
          })}
        </svg>
      </div>
      <div className="mt-md">
        <div className="smallcaps mb-sm">Tableau CoNLL-U</div>
        <div className="card" style={{ background: 'var(--bg)', overflow: 'auto' }}>
          <table className="tbl" style={{ fontSize: 12 }}>
            <thead><tr>{['ID','FORM','LEMMA','UPOS','XPOS','FEATS','HEAD','DEPREL','DEPS','MISC'].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {tokens.map(token => (
                <tr key={token.id}>
                  <td className="mono">{token.id}</td>
                  <td className="mono" style={{ fontWeight: 500 }}>{token.form}</td>
                  <td className="mono muted">{token.lemma}</td>
                  <td className="mono">{token.upos}</td>
                  <td className="mono muted-2">{token.xpos}</td>
                  <td className="mono muted-2" style={{ fontSize: 11 }}>{token.feats}</td>
                  <td className="mono">{token.head}</td>
                  <td className="mono" style={{ color: 'var(--aegean)' }}>{token.deprel}</td>
                  <td className="mono muted-2">{token.deps}</td>
                  <td className="mono muted-2">{token.misc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default function CorpusPage() {
  const { id } = useParams()
  return id ? <CorpusDetail id={id} /> : <CorpusList />
}

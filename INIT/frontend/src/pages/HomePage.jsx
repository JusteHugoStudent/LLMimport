import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FlaskConical, Upload } from 'lucide-react'
import api from '../api/client'

const statusDot = {
  completed: 'done',
  running: 'running',
  failed: 'failed',
  pending: 'pending',
}

export default function HomePage() {
  const [corpora, setCorpora] = useState([])
  const [experiments, setExperiments] = useState([])
  const [detectors, setDetectors] = useState([])
  const [models, setModels] = useState([])

  useEffect(() => {
    Promise.all([
      api.get('/corpus').then(r => r.data).catch(() => []),
      api.get('/experiments').then(r => r.data).catch(() => []),
      api.get('/detectors').then(r => r.data).catch(() => []),
      api.get('/ollama/models').then(r => r.data).catch(() => []),
    ]).then(([c, e, d, m]) => {
      setCorpora(c)
      setExperiments(e)
      setDetectors(d)
      setModels(m)
    })
  }, [])

  const totals = useMemo(() => ({
    sentences: corpora.reduce((sum, c) => sum + (c.num_sentences || 0), 0),
    tokens: corpora.reduce((sum, c) => sum + (c.num_tokens || 0), 0),
    completed: experiments.filter(e => e.status === 'completed').length,
    running: experiments.find(e => e.status === 'running'),
    readyDetectors: detectors.filter(d => d.is_implemented).length,
  }), [corpora, experiments, detectors])

  return (
    <div className="page">
      <div style={{ marginBottom: 36, paddingBottom: 28, borderBottom: '1px solid var(--line-2)' }}>
        <div className="row gap-sm" style={{ marginBottom: 14 }}>
          <span className="numeral" style={{ fontSize: 14 }}>I.</span>
          <span className="smallcaps">Atelier</span>
        </div>
        <h1 className="home-hero-title">
          Fiabilité des arbres<br />
          <span style={{ color: 'var(--terracotta)', fontStyle: 'italic' }}>morpho-syntaxiques.</span>
        </h1>
        <p style={{ color: 'var(--ink-3)', fontSize: 16, maxWidth: 660, margin: 0, lineHeight: 1.55 }}>
          Plateforme locale d'évaluation d'analyses au format <span className="mono" style={{ fontSize: 13 }}>CoNLL-U</span>.
        </p>
        <div className="row gap-md mt-md" style={{ flexWrap: 'wrap' }}>
          <Link className="btn btn-accent" to="/experiments/new"><FlaskConical size={14} /> Nouvelle expérience</Link>
          <Link className="btn" to="/corpus"><Upload size={14} /> Importer un corpus</Link>
        </div>
      </div>

      <div className="meander mb-lg" />

      <div className="card mb-lg">
        <div className="stat-row">
          <div className="stat">
            <div className="stat-label">Corpus</div>
            <div className="stat-value">{corpora.length}</div>
            <div className="stat-sub">{totals.sentences.toLocaleString('fr-FR')} phrases · {totals.tokens.toLocaleString('fr-FR')} tokens</div>
          </div>
          <div className="stat">
            <div className="stat-label">Expériences</div>
            <div className="stat-value">{experiments.length}</div>
            <div className="stat-sub">{totals.completed} terminées · {totals.running ? '1 en cours' : '0 en cours'}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Méthodes</div>
            <div className="stat-value">{totals.readyDetectors}<span style={{ color: 'var(--ink-4)', fontSize: 18 }}>/{detectors.length || 4}</span></div>
            <div className="stat-sub">LLM, ULISSE, SVM, PUPA</div>
          </div>
          <div className="stat">
            <div className="stat-label">Modèles Ollama</div>
            <div className="stat-value">{models.length}</div>
            <div className="stat-sub">{models[0]?.name || 'aucun modèle local'}</div>
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <div>
          <div className="section-eyebrow">
            <span className="numeral">II.</span>
            <h2 className="section-title">En cours</h2>
          </div>
          {totals.running ? (
            <Link className="card card-pad" to={`/experiments/${totals.running.id}`} style={{ display: 'block', textDecoration: 'none' }}>
              <div className="between mb-md">
                <div>
                  <div className="row gap-sm mb-sm">
                    <span className="dot dot-running" />
                    <span className="smallcaps" style={{ color: 'var(--aegean)' }}>en cours</span>
                  </div>
                  <div style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 500 }}>{totals.running.name}</div>
                  <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{totals.running.id}</div>
                </div>
                <span className="mono" style={{ fontSize: 13, color: 'var(--terracotta)' }}>{Math.round((totals.running.progress || 0) * 100)}%</span>
              </div>
              <div className="progress mb-sm"><div className="progress-fill" style={{ width: `${(totals.running.progress || 0) * 100}%` }} /></div>
            </Link>
          ) : (
            <div className="card card-pad empty">Aucune expérience en cours</div>
          )}

          <div className="section-eyebrow mt-lg">
            <span className="numeral">III.</span>
            <h2 className="section-title">Expériences récentes</h2>
          </div>
          <div className="card">
            {experiments.slice(0, 4).map(exp => (
              <Link key={exp.id} className="between" to={`/experiments/${exp.id}`} style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-3)', cursor: 'pointer', textDecoration: 'none' }}>
                <div>
                  <div className="row gap-sm">
                    <span className={`dot dot-${statusDot[exp.status] || 'pending'}`} />
                    <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{exp.name}</span>
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 3, marginLeft: 16 }}>{exp.status}</div>
                </div>
                <div className="muted-2 mono" style={{ fontSize: 11 }}>{exp.id.slice(0, 8)}</div>
              </Link>
            ))}
            {experiments.length === 0 && <div className="empty">Aucune expérience</div>}
          </div>
        </div>

        <div>
          <div className="section-eyebrow">
            <span className="numeral">·</span>
            <span className="smallcaps">Système</span>
          </div>
          <div className="card card-pad" style={{ background: 'var(--bg-elev)', borderStyle: 'dashed' }}>
            <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 18, lineHeight: 1.5, color: 'var(--ink-2)' }}>
              Homere mesure les écarts entre analyseurs.
            </div>
            <div className="meander" style={{ margin: '14px -4px 12px' }} />
            <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.55 }}>
              Corpus annotés, erreurs injectées, détecteurs comparés, résultats exportables.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { MoreHorizontal, Pause, Plus, RefreshCw, X } from 'lucide-react'
import api from '../api/client'
import ExperimentConfig from '../components/experiments/ExperimentConfig'

const statusMap = {
  completed: ['pill-success', 'terminée', 'done'],
  running: ['pill-info', 'en cours', 'running'],
  pending: ['pill-warn', 'en attente', 'pending'],
  failed: ['pill-danger', 'échec', 'failed'],
}

function statusBadge(status) {
  const [cls, label] = statusMap[status] || statusMap.pending
  return <span className={`pill ${cls}`}>{label}</span>
}

function percent(progress) {
  return progress <= 1 ? Math.round(progress * 100) : Math.round(progress)
}

function formatDuration(seconds) {
  if (seconds == null) return '—'
  if (seconds < 60) return `${Math.round(seconds)} s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return `${minutes} min ${rest.toString().padStart(2, '0')} s`
}

function ExperimentsList() {
  const [experiments, setExperiments] = useState([])
  const load = () => api.get('/experiments').then(res => setExperiments(res.data)).catch(() => setExperiments([]))

  useEffect(() => { load() }, [])

  const removeExperiment = async (event, id) => {
    event.preventDefault()
    event.stopPropagation()
    if (!confirm('Supprimer cette expérience ?')) return
    await api.delete(`/experiments/${id}`)
    await load()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="row gap-sm mb-sm"><span className="numeral">II.</span><span className="smallcaps">Atelier</span></div>
          <h1 className="page-title">Expériences</h1>
          <p className="page-sub">Configurer, lancer et suivre les comparaisons de détecteurs.</p>
        </div>
        <div className="row gap-md" style={{ flexWrap: 'wrap' }}>
          <button className="btn" onClick={load}><RefreshCw size={14} /> Actualiser</button>
          <Link className="btn btn-accent" to="/experiments/new"><Plus size={14} /> Nouvelle expérience</Link>
        </div>
      </div>

      <div className="row gap-sm mb-md" style={{ flexWrap: 'wrap' }}>
        {['Toutes', 'En cours', 'Terminées', 'En attente', 'Échec'].map((filter, i) => (
          <button key={filter} className={`btn btn-sm${i === 0 ? ' btn-primary' : ''}`}>{filter}</button>
        ))}
        <div style={{ flex: 1 }} />
        <span className="muted" style={{ fontSize: 12 }}>{experiments.length} expériences</span>
      </div>

      <div className="card">
        {experiments.length === 0 ? (
          <div className="empty"><div className="empty-mark">·</div>Aucune expérience</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Nom</th>
                <th style={{ width: 100 }}>Statut</th>
                <th style={{ width: 130 }}>Corpus</th>
                <th style={{ width: 130 }}>Progression</th>
                <th style={{ width: 130 }}>Créée</th>
                <th style={{ width: 60 }} />
              </tr>
            </thead>
            <tbody>
              {experiments.map(exp => (
                <tr key={exp.id} style={{ cursor: 'pointer' }}>
                  <td>
                    <Link to={`/experiments/${exp.id}`} style={{ textDecoration: 'none' }}>
                      <div style={{ fontWeight: 500, color: 'var(--ink)' }}>{exp.name}</div>
                      <div className="mono muted-2" style={{ fontSize: 11, marginTop: 2 }}>{exp.id}</div>
                    </Link>
                  </td>
                  <td>{statusBadge(exp.status)}</td>
                  <td><span className="mono muted" style={{ fontSize: 11.5 }}>{exp.corpus_id?.slice(0, 8)}</span></td>
                  <td>
                    <div className="progress" style={{ width: 100 }}>
                      <div className="progress-fill" style={{ width: `${percent(exp.progress || 0)}%`, background: exp.status === 'failed' ? 'var(--terracotta)' : exp.status === 'completed' ? 'var(--success)' : 'var(--terracotta)' }} />
                    </div>
                    <div className="mono muted-2" style={{ fontSize: 10.5, marginTop: 3 }}>{percent(exp.progress || 0)}%</div>
                  </td>
                  <td><span className="muted" style={{ fontSize: 11.5 }}>{exp.created_at?.slice(0, 10) || '-'}</span></td>
                  <td><button className="btn btn-ghost btn-sm" onClick={(event) => removeExperiment(event, exp.id)} style={{ padding: 4 }}><MoreHorizontal size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function ExperimentDetail({ id }) {
  const [experiment, setExperiment] = useState(null)
  const [progress, setProgress] = useState(null)

  useEffect(() => {
    api.get(`/experiments/${id}`).then(res => setExperiment(res.data)).catch(() => setExperiment(null))
  }, [id])

  useEffect(() => {
    const load = () => api.get(`/experiments/${id}/progress`).then(res => setProgress(res.data)).catch(() => {})
    load()
    const interval = setInterval(load, 1000)
    return () => clearInterval(interval)
  }, [id])

  if (!experiment) return <div className="page"><div className="empty">Chargement...</div></div>
  const currentStatus = progress?.status || experiment.status
  const currentProgress = percent(progress?.progress ?? experiment.progress ?? 0)
  const [, label, dot] = statusMap[currentStatus] || statusMap.pending
  const detectors = experiment.detectors_config?.map(d => d.name).join(' · ') || '-'
  const errorTypes = experiment.error_config?.error_types?.join(', ') || '-'
  const activeDetector = progress?.detector_label || progress?.detector || '—'
  const itemLabel = progress?.item_total ? `${progress.item_index || 0}/${progress.item_total}` : '—'
  const batchLabel = progress?.batch_total ? `${progress.batch_index || 0}/${progress.batch_total}` : '—'

  return (
    <div className="page">
      <div className="row gap-sm mb-md">
        <Link className="btn btn-ghost btn-sm" to="/experiments">Expériences</Link>
        <span className="muted-2">/</span>
        <span className="mono muted" style={{ fontSize: 11.5 }}>{experiment.id.slice(0, 8)}</span>
      </div>

      <div className="page-header">
        <div>
          <div className="row gap-sm mb-sm">
            <span className={`dot dot-${dot}`} />
            <span className="smallcaps" style={{ color: currentStatus === 'failed' ? 'var(--terracotta)' : 'var(--ink-3)' }}>{label}</span>
          </div>
          <h1 className="page-title">{experiment.name}</h1>
          <p className="page-sub">{detectors} · erreurs {errorTypes}</p>
        </div>
        <div className="row gap-md">
          {currentStatus === 'running' && <button className="btn"><Pause size={14} /> Suspendre</button>}
          {currentStatus === 'running' && <button className="btn"><X size={14} style={{ color: 'var(--terracotta)' }} /> Annuler</button>}
          {currentStatus === 'completed' && <Link className="btn btn-accent" to="/dashboard">Voir les résultats</Link>}
        </div>
      </div>

      <div className="card card-pad mb-lg">
        <div className="between mb-md">
          <div>
            <h3 className="section-title" style={{ fontSize: 18 }}>Progression globale</h3>
            <div className="muted" style={{ fontSize: 12 }}>{progress?.message || progress?.current_step || 'En attente du prochain état'}</div>
          </div>
          <span className="mono" style={{ fontSize: 14, fontWeight: 600, color: 'var(--terracotta)' }}>{currentProgress} %</span>
        </div>
        <div className="progress mb-md" style={{ height: 6 }}><div className="progress-fill" style={{ width: `${currentProgress}%` }} /></div>
        <div className="grid-3" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, borderTop: '1px solid var(--line-3)', paddingTop: 12 }}>
          <div className="stat" style={{ paddingLeft: 0 }}><div className="stat-label">Étape</div><div className="stat-value" style={{ fontSize: 22 }}>{progress?.current_step || '—'}</div></div>
          <div className="stat"><div className="stat-label">Détecteur</div><div className="stat-value" style={{ fontSize: 22 }}>{activeDetector}</div></div>
          <div className="stat"><div className="stat-label">Phrases</div><div className="stat-value mono" style={{ fontSize: 22 }}>{itemLabel}</div></div>
          <div className="stat" style={{ paddingRight: 0, borderRight: 'none' }}><div className="stat-label">ETA</div><div className="stat-value mono" style={{ fontSize: 22 }}>{formatDuration(progress?.eta_seconds)}</div></div>
        </div>
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: '1.2fr 1fr', alignItems: 'flex-start' }}>
        <div className="card card-pad">
          <h3 className="section-title mb-md" style={{ fontSize: 18 }}>Activité en cours</h3>
          <div style={{ fontSize: 12.5, lineHeight: 1.9 }}>
            <div className="between"><span className="muted">Phase</span><span className="mono">{progress?.phase || '—'}</span></div>
            <div className="between"><span className="muted">Détecteur</span><span>{activeDetector}</span></div>
            <div className="between"><span className="muted">Batch LLM</span><span className="mono">{batchLabel}</span></div>
            <div className="between"><span className="muted">Temps écoulé</span><span className="mono">{formatDuration(progress?.elapsed_seconds)}</span></div>
            <div className="between"><span className="muted">Phrase</span><span className="mono">{progress?.current_sentence_id || '—'}</span></div>
          </div>
          {progress?.current_sentence_text && (
            <div className="codeblock mt-md" style={{ whiteSpace: 'normal', fontFamily: 'var(--sans)' }}>
              {progress.current_sentence_text}
            </div>
          )}
        </div>

        <div className="card card-pad">
          <h3 className="section-title mb-md" style={{ fontSize: 18 }}>Journal</h3>
          {(progress?.events || []).length === 0 ? (
            <div className="muted">Aucun événement détaillé pour le moment.</div>
          ) : (
            <div className="col gap-sm">
              {progress.events.slice().reverse().map((event, index) => (
                <div key={`${event.time}-${index}`} className="row gap-md" style={{ alignItems: 'flex-start', paddingBottom: 8, borderBottom: '1px solid var(--line-3)' }}>
                  <span className={`dot dot-${event.phase === 'failed' ? 'failed' : event.phase === 'detector' ? 'running' : 'done'}`} style={{ marginTop: 6 }} />
                  <div>
                    <div style={{ fontWeight: 500 }}>{event.message}</div>
                    <div className="muted-2 mono" style={{ fontSize: 11 }}>{event.time?.slice(11, 19)} · {event.phase || 'phase'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid-2 mt-lg" style={{ gridTemplateColumns: '1.2fr 1fr', alignItems: 'flex-start' }}>
        <div className="card card-pad">
          <h3 className="section-title mb-md" style={{ fontSize: 18 }}>Configuration</h3>
          <div style={{ fontSize: 12.5, lineHeight: 1.9 }}>
            <div className="between"><span className="muted">Corpus</span><span className="mono">{experiment.corpus_id}</span></div>
            <div className="between"><span className="muted">Détecteurs</span><span>{detectors}</span></div>
            <div className="between"><span className="muted">Types</span><span className="mono">{errorTypes}</span></div>
            <div className="between"><span className="muted">Créée</span><span>{experiment.created_at?.slice(0, 19) || '-'}</span></div>
            <div className="between"><span className="muted">Terminée</span><span>{experiment.completed_at?.slice(0, 19) || '-'}</span></div>
          </div>
        </div>
        <div className="card card-pad">
          <h3 className="section-title mb-md" style={{ fontSize: 18 }}>Résultat</h3>
          {experiment.results?.error ? (
            <div className="pill pill-danger">{experiment.results.error}</div>
          ) : experiment.status === 'completed' ? (
            <Link className="btn btn-accent" to="/dashboard">Ouvrir dans Résultats</Link>
          ) : (
            <div className="muted">En attente de finalisation.</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ExperimentPage() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()

  if (location.pathname === '/experiments/new') {
    return <ExperimentConfig onSubmit={(experimentId) => navigate(`/experiments/${experimentId}`)} />
  }
  return id ? <ExperimentDetail id={id} /> : <ExperimentsList />
}

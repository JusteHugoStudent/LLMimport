import { useEffect, useMemo, useState } from 'react'
import {
  BrainCircuit,
  Database,
  Folder,
  HardDrive,
  Monitor,
  RefreshCw,
  Settings,
  Sun,
  Trash2,
} from 'lucide-react'
import api from '../api/client'

const sections = [
  { key: 'system', label: 'Système', icon: Settings },
  { key: 'ollama', label: 'Ollama & modèles', icon: BrainCircuit },
  { key: 'stanza', label: 'Stanza & langue', icon: Monitor },
  { key: 'paths', label: 'Chemins locaux', icon: Folder },
  { key: 'display', label: 'Affichage', icon: Sun },
  { key: 'data', label: 'Données', icon: Trash2 },
]

export default function SettingsPage() {
  const [section, setSection] = useState('system')
  const [theme, setTheme] = useState(() => localStorage.getItem('homere-theme') || 'light')
  const [status, setStatus] = useState({ available: false, models: [] })
  const [models, setModels] = useState([])
  const [health, setHealth] = useState(null)
  const [corpora, setCorpora] = useState([])
  const [experiments, setExperiments] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = () => {
    setLoading(true)
    Promise.all([
      api.get('/health').then(r => r.data).catch(() => null),
      api.get('/ollama/status').then(r => r.data).catch(() => ({ available: false, models: [] })),
      api.get('/ollama/models').then(r => r.data).catch(() => []),
      api.get('/corpus').then(r => r.data).catch(() => []),
      api.get('/experiments').then(r => r.data).catch(() => []),
    ]).then(([h, s, m, c, e]) => {
      setHealth(h)
      setStatus(s)
      setModels(m)
      setCorpora(c)
      setExperiments(e)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { refresh() }, [])

  useEffect(() => {
    const syncTheme = event => {
      if (event.detail === 'light' || event.detail === 'dark') setTheme(event.detail)
    }

    window.addEventListener('homere-theme-change', syncTheme)
    return () => window.removeEventListener('homere-theme-change', syncTheme)
  }, [])

  useEffect(() => {
    localStorage.setItem('homere-theme', theme)
    document.documentElement.setAttribute('data-theme', theme)
    window.dispatchEvent(new CustomEvent('homere-theme-change', { detail: theme }))
  }, [theme])

  const totals = useMemo(() => ({
    sentences: corpora.reduce((sum, corpus) => sum + (corpus.num_sentences || 0), 0),
    tokens: corpora.reduce((sum, corpus) => sum + (corpus.num_tokens || 0), 0),
    completed: experiments.filter(exp => exp.status === 'completed').length,
    failed: experiments.filter(exp => exp.status === 'failed').length,
  }), [corpora, experiments])

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="row gap-sm mb-sm"><span className="numeral">V.</span><span className="smallcaps">Configuration</span></div>
          <h1 className="page-title">Paramètres</h1>
          <p className="page-sub">Statut local, modèles, chemins et préférences d'affichage.</p>
        </div>
        <button className="btn" onClick={refresh}>
          <RefreshCw size={14} className={loading ? 'spin-icon' : ''} />
          Recharger
        </button>
      </div>

      <div className="grid-2 settings-layout">
        <aside className="settings-nav">
          {sections.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setSection(key)}
              className={`settings-link${section === key ? ' active' : ''}`}
            >
              <Icon size={15} strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          ))}
        </aside>

        <div className="col gap-lg">
          {section === 'system' && (
            <>
              <div className="card card-pad">
                <div className="row gap-sm mb-md"><span className="numeral">i.</span><h3 className="section-title" style={{ fontSize: 17 }}>Statut</h3></div>
                <div className="grid-2">
                  <StatusRow
                    ok={Boolean(health?.ok)}
                    title="Backend Python"
                    detail={health?.service || 'FastAPI · port 8000'}
                    okLabel="en ligne"
                    failLabel="hors ligne"
                  />
                  <StatusRow
                    ok={status.available}
                    title="Ollama"
                    detail={`localhost:11434 · ${models.length} modèle${models.length > 1 ? 's' : ''}`}
                    okLabel="actif"
                    failLabel="arrêté"
                  />
                  <StatusRow
                    ok
                    title="Base SQLite"
                    detail="data/nlp_eval.db"
                    okLabel="connectée"
                  />
                  <StatusRow
                    ok
                    title="Stanza"
                    detail="analyse UD · français / anglais"
                    okLabel="prêt"
                  />
                </div>
              </div>

              <div className="card">
                <div className="stat-row">
                  <Metric label="Corpus" value={corpora.length} sub={`${totals.sentences.toLocaleString('fr-FR')} phrases`} />
                  <Metric label="Tokens" value={totals.tokens.toLocaleString('fr-FR')} sub="CoNLL-U importés" />
                  <Metric label="Expériences" value={experiments.length} sub={`${totals.completed} terminées · ${totals.failed} échouées`} />
                  <Metric label="Modèles" value={models.length} sub={models[0]?.name || 'aucun modèle'} />
                </div>
              </div>
            </>
          )}

          {section === 'ollama' && (
            <div className="card card-pad">
              <div className="between mb-md">
                <div className="row gap-sm"><span className="numeral">i.</span><h3 className="section-title" style={{ fontSize: 17 }}>Modèles installés</h3></div>
                <span className={`pill ${status.available ? 'pill-success' : 'pill-danger'}`}>{status.available ? 'actif' : 'indisponible'}</span>
              </div>
              <table className="tbl">
                <thead><tr><th>Modèle</th><th style={{ width: 120 }}>Taille</th><th style={{ width: 150 }}>Modifié</th></tr></thead>
                <tbody>
                  {models.map((model) => (
                    <tr key={model.name}>
                      <td className="mono" style={{ fontWeight: 500 }}>{model.name}</td>
                      <td className="mono">{model.size ? `${(model.size / 1e9).toFixed(1)} GB` : '-'}</td>
                      <td><span className="muted">{model.modified_at?.slice(0, 10) || '-'}</span></td>
                    </tr>
                  ))}
                  {models.length === 0 && (
                    <tr><td colSpan={3}><div className="empty" style={{ padding: 26 }}>Aucun modèle détecté</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {section === 'stanza' && (
            <div className="card card-pad">
              <div className="row gap-sm mb-md"><span className="numeral">i.</span><h3 className="section-title" style={{ fontSize: 17 }}>Stanza & langue</h3></div>
              <div className="grid-2" style={{ alignItems: 'end' }}>
                <div>
                  <label className="label">Langue d'analyse par défaut</label>
                  <select className="select" defaultValue="fr"><option value="fr">Français (fr)</option><option value="en">Anglais (en)</option></select>
                </div>
                <span className="pill pill-success" style={{ width: 'fit-content' }}>pipeline disponible</span>
              </div>
              <div className="meander mt-lg mb-md" />
              <h4 className="settings-subtitle">Modules attendus</h4>
              <div className="codeblock">{`tokenize
mwt
pos
lemma
depparse`}</div>
            </div>
          )}

          {section === 'paths' && (
            <div className="card card-pad">
              <div className="row gap-sm mb-md"><span className="numeral">i.</span><h3 className="section-title" style={{ fontSize: 17 }}>Chemins locaux</h3></div>
              {[
                ['data/', 'Racine des données locales', `${corpora.length} corpus`],
                ['data/corpora/', 'Corpus CoNLL-U importés', `${totals.sentences.toLocaleString('fr-FR')} phrases`],
                ['data/nlp_eval.db', 'Base SQLite', `${experiments.length} expériences`],
                ['results/', 'Exports et résultats exploitables', `${totals.completed} dossiers potentiels`],
              ].map(([path, detail, stat]) => (
                <PathRow key={path} path={path} detail={detail} stat={stat} />
              ))}
            </div>
          )}

          {section === 'display' && (
            <div className="card card-pad">
              <div className="row gap-sm mb-md"><span className="numeral">i.</span><h3 className="section-title" style={{ fontSize: 17 }}>Affichage</h3></div>
              <label className="label">Thème</label>
              <div className="row gap-sm mb-lg">
                <button className={`btn btn-sm${theme === 'light' ? ' btn-primary' : ''}`} onClick={() => setTheme('light')}>Clair</button>
                <button className={`btn btn-sm${theme === 'dark' ? ' btn-primary' : ''}`} onClick={() => setTheme('dark')}>Nuit</button>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>Les préférences d'affichage restent locales au navigateur.</div>
            </div>
          )}

          {section === 'data' && (
            <div className="card card-pad">
              <div className="row gap-sm mb-md"><span className="numeral">i.</span><h3 className="section-title" style={{ fontSize: 17 }}>Données locales</h3></div>
              <DataAction title="Cache LLM" detail="Réponses intermédiaires et essais de prompts" />
              <DataAction title="Expériences échouées" detail={`${totals.failed} expérience${totals.failed > 1 ? 's' : ''} concernée${totals.failed > 1 ? 's' : ''}`} />
              <DataAction title="Base complète" detail="Corpus, expériences et résultats" danger />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatusRow({ ok, title, detail, okLabel = 'ok', failLabel = 'erreur' }) {
  return (
    <div className="row gap-md settings-status-row">
      <span className={`dot dot-${ok ? 'done' : 'failed'}`} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500 }}>{title}</div>
        <div className="muted-2 mono" style={{ fontSize: 11 }}>{detail}</div>
      </div>
      <span className={`pill ${ok ? 'pill-success' : 'pill-danger'}`}>{ok ? okLabel : failLabel}</span>
    </div>
  )
}

function Metric({ label, value, sub }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  )
}

function PathRow({ path, detail, stat }) {
  return (
    <div className="between settings-path-row">
      <div className="row gap-md">
        <HardDrive size={16} color="var(--ink-3)" />
        <div>
          <div className="mono" style={{ fontWeight: 500 }}>{path}</div>
          <div className="muted-2" style={{ fontSize: 11, marginTop: 2 }}>{detail}</div>
        </div>
      </div>
      <span className="muted mono" style={{ fontSize: 11.5 }}>{stat}</span>
    </div>
  )
}

function DataAction({ title, detail, danger = false }) {
  return (
    <div className="between settings-path-row">
      <div>
        <div style={{ fontWeight: 500, color: danger ? 'var(--terracotta)' : 'var(--ink)' }}>{title}</div>
        <div className="muted-2" style={{ fontSize: 11.5, marginTop: 2 }}>{detail}</div>
      </div>
      <button className="btn btn-sm" style={danger ? { color: 'var(--terracotta)', borderColor: '#E5BFB2' } : undefined}>
        {danger ? 'Réinitialiser' : 'Nettoyer'}
      </button>
    </div>
  )
}

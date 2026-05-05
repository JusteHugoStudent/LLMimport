import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Download, FileText, Search, Sparkles } from 'lucide-react'
import api from '../api/client'

const DETECTOR_LABELS = {
  llm_judge: 'LLM-as-a-judge',
  ulisse: 'ULISSE',
  svm: 'SVM',
  pupa: 'PUPA',
}

function detectorLabel(name) {
  return DETECTOR_LABELS[name] || name
}

function metricRows(results) {
  return Object.entries(results?.detectors || {}).map(([name, data]) => ({
    detector: name,
    label: detectorLabel(name),
    ...(data.global_metrics || {}),
    ...(data.confusion_matrix || {}),
    perRelation: data.per_relation || {},
    perLength: data.per_length || {},
    details: data.details || [],
  }))
}

function fmt(value, digits = 3) {
  return typeof value === 'number' ? value.toFixed(digits) : '-'
}

function pct(value, digits = 1) {
  return typeof value === 'number' ? `${(value * 100).toFixed(digits)} %` : '-'
}

function ratio(count, total) {
  return total > 0 ? count / total : 0
}

function datasetSummary(results) {
  return results?.dataset || summarizeDataset(results?.ground_truth || [])
}

function detectorMaps(rows) {
  return Object.fromEntries(rows.map(row => [
    row.detector,
    Object.fromEntries((row.details || []).map(detail => [detail.sentence_id, detail])),
  ]))
}

function buildErrorTypeDiagnostics(results, rows) {
  const groundTruth = results?.ground_truth || []
  const maps = detectorMaps(rows)
  const byType = {}

  for (const gt of groundTruth) {
    for (const error of gt.errors || []) {
      const type = error.error_type || 'unknown'
      if (!byType[type]) {
        byType[type] = {
          type,
          total: 0,
          detectors: Object.fromEntries(rows.map(row => [row.detector, { detected: 0, missed: 0 }])),
        }
      }
      byType[type].total += 1
      for (const row of rows) {
        const pred = maps[row.detector]?.[gt.sentence_id]
        const detected = pred ? !pred.is_correct : false
        if (detected) byType[type].detectors[row.detector].detected += 1
        else byType[type].detectors[row.detector].missed += 1
      }
    }
  }

  return Object.values(byType).sort((a, b) => b.total - a.total)
}

function getCriticalRows(results, rows) {
  const groundTruth = results?.ground_truth || []
  const maps = detectorMaps(rows)
  return groundTruth.map(gt => {
    const predictions = Object.fromEntries(rows.map(row => {
      const pred = maps[row.detector]?.[gt.sentence_id]
      return [row.detector, pred ? !pred.is_correct : null]
    }))
    return { gt, predictions }
  })
}

function downloadText(filename, content) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export default function DashboardPage() {
  const [experiments, setExperiments] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [results, setResults] = useState(null)
  const [benchmarkResults, setBenchmarkResults] = useState([])
  const [tab, setTab] = useState('overview')

  useEffect(() => {
    api.get('/experiments').then(res => {
      const completed = res.data.filter(exp => exp.status === 'completed')
      setExperiments(completed)
      if (completed[0]) setSelectedId(completed[0].id)
    }).catch(() => setExperiments([]))
  }, [])

  useEffect(() => {
    if (!selectedId) return
    setResults(null)
    api.get(`/experiments/${selectedId}/results/compare`)
      .then(res => setResults(res.data))
      .catch(() => setResults(null))
  }, [selectedId])

  useEffect(() => {
    if (experiments.length === 0) return
    Promise.all(experiments.map(exp =>
      api.get(`/experiments/${exp.id}/results/compare`)
        .then(res => ({ experiment: exp, results: res.data }))
        .catch(() => null),
    )).then(items => setBenchmarkResults(items.filter(Boolean)))
  }, [experiments])

  const rows = useMemo(() => metricRows(results), [results])
  const best = rows.slice().sort((a, b) => (b.f1 || 0) - (a.f1 || 0))[0]
  const selectedExperiment = experiments.find(exp => exp.id === selectedId)

  if (experiments.length === 0) {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <div className="row gap-sm mb-sm"><span className="numeral">IV.</span><span className="smallcaps">Mesure</span></div>
            <h1 className="page-title">Résultats</h1>
            <p className="page-sub">Aucune expérience terminée pour l’instant.</p>
          </div>
        </div>
        <div className="card">
          <div className="empty"><div className="empty-mark">·</div>Aucune expérience terminée</div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="row gap-sm mb-sm"><span className="numeral">IV.</span><span className="smallcaps">Évaluation</span></div>
          <h1 className="page-title">Résultats</h1>
          <p className="page-sub">Lecture structurée des verdicts : erreurs retrouvées, erreurs manquées, accords et exports exploitables.</p>
        </div>
        <div className="row gap-md">
          <select className="select" value={selectedId} onChange={e => setSelectedId(e.target.value)} style={{ minWidth: 280 }}>
            {experiments.map(exp => <option key={exp.id} value={exp.id}>{exp.name}</option>)}
          </select>
          <a className="btn" href={`/api/experiments/${selectedId}/export/report-md`}><FileText size={14} /> Rapport</a>
          <a className="btn btn-ghost" href={`/api/experiments/${selectedId}/export/json`}><Download size={14} /> JSON</a>
        </div>
      </div>

      <div className="tabs">
        {[
          ['overview', 'Synthèse'],
          ['confusion', 'Matrices'],
          ['diagnostic', 'Diagnostic'],
          ['benchmark', 'Benchmark'],
          ['agree', 'Accord'],
          ['perSent', 'Phrases'],
          ['report', 'Rapport'],
        ].map(([key, label]) => (
          <div key={key} className={`tab${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>{label}</div>
        ))}
      </div>

      {!results ? (
        <div className="card"><div className="empty">Chargement des résultats</div></div>
      ) : (
        <>
          {tab === 'overview' && <Overview rows={rows} best={best} results={results} experiment={selectedExperiment} />}
          {tab === 'confusion' && <Confusion rows={rows} />}
          {tab === 'diagnostic' && <Diagnostic rows={rows} results={results} />}
          {tab === 'benchmark' && <Benchmark items={benchmarkResults} />}
          {tab === 'agree' && <Agreement rows={rows} agreement={results?.agreement || {}} />}
          {tab === 'perSent' && <PerSentence results={results} rows={rows} />}
          {tab === 'report' && <Report selectedId={selectedId} experiment={selectedExperiment} results={results} />}
        </>
      )}
    </div>
  )
}

function Overview({ rows, best, results, experiment }) {
  if (!best) return <div className="empty">Résultats indisponibles</div>
  const dataset = datasetSummary(results)
  const sampling = dataset.sampling || {}
  const totalErrors = dataset.corrupted_sentences || 0
  const totalClean = dataset.clean_sentences || 0
  const falseNegativeTotal = rows.reduce((sum, row) => sum + (row.fn || 0), 0)
  const risky = rows.slice().sort((a, b) => (b.fn || 0) - (a.fn || 0))[0]

  return (
    <div>
      <div className="result-hero card card-pad mb-lg">
        <div>
          <div className="smallcaps mb-sm">Expérience</div>
          <h2 className="section-title" style={{ fontSize: 30 }}>{experiment?.name || 'Expérience'}</h2>
          <p className="muted" style={{ maxWidth: 720, margin: '8px 0 0' }}>
            Le but n’est pas de savoir si les phrases sont grammaticalement jolies, mais si un détecteur repère correctement les annotations CoNLL-U corrompues.
          </p>
        </div>
        <div className="result-callout">
          <div className="smallcaps mb-sm">Meilleur F1</div>
          <div className="serif" style={{ fontSize: 32 }}>{best.label}</div>
          <div className="result-score">{pct(best.f1)}</div>
        </div>
      </div>

      <div className="card mb-lg">
        <div className="stat-row">
          <div className="stat">
            <div className="stat-label">Phrases</div>
            <div className="stat-value">{dataset.total_sentences || 0}</div>
            <div className="stat-sub">évaluées</div>
          </div>
          <div className="stat">
            <div className="stat-label">Corrompues</div>
            <div className="stat-value">{totalErrors}</div>
            <div className="stat-sub">{pct(dataset.actual_error_rate || 0)} réel</div>
          </div>
          <div className="stat">
            <div className="stat-label">Originales</div>
            <div className="stat-value">{totalClean}</div>
            <div className="stat-sub">contrôle négatif</div>
          </div>
          <div className="stat">
            <div className="stat-label">Erreurs manquées</div>
            <div className="stat-value">{falseNegativeTotal}</div>
            <div className="stat-sub">tous détecteurs confondus</div>
          </div>
          <div className="stat">
            <div className="stat-label">Échantillon</div>
            <div className="stat-value" style={{ fontSize: 24 }}>{sampling.mode === 'random' ? 'Aléa' : 'Début'}</div>
            <div className="stat-sub">seed {sampling.seed ?? '-'}</div>
          </div>
        </div>
      </div>

      <div className="grid-3 mb-lg">
        <InterpretationCard
          title="Priorité projet"
          value="Rappel"
          text="Un faux négatif laisse passer une analyse erronée. Pour générer des exercices, c’est le risque le plus important."
        />
        <InterpretationCard
          title="Fiabilité des alertes"
          value="Précision"
          text="Une faible précision veut dire que le détecteur rejette beaucoup de phrases pourtant correctes."
        />
        <InterpretationCard
          title="Score résumé"
          value="F1"
          text="Le F1 résume le compromis précision/rappel. Il sert à classer, mais il ne remplace pas l’analyse des FN et FP."
        />
      </div>

      <div className="card mb-lg">
        <table className="tbl">
          <thead>
            <tr>
              <th>Détecteur</th>
              <th style={{ textAlign: 'right' }}>Précision</th>
              <th style={{ textAlign: 'right' }}>Rappel</th>
              <th style={{ textAlign: 'right' }}>F1</th>
              <th style={{ textAlign: 'right' }}>Accuracy</th>
              <th style={{ textAlign: 'right' }}>FN</th>
              <th style={{ textAlign: 'right' }}>FP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.detector}>
                <td>
                  <div style={{ fontWeight: 600 }}>{row.label}</div>
                  <div className="muted-2 mono" style={{ fontSize: 11 }}>{row.detector}</div>
                </td>
                <td className="mono" style={{ textAlign: 'right' }}>{fmt(row.precision)}</td>
                <td className="mono" style={{ textAlign: 'right', color: 'var(--aegean)', fontWeight: 600 }}>{fmt(row.recall)}</td>
                <td className="mono" style={{ textAlign: 'right', color: row.detector === best.detector ? 'var(--terracotta)' : 'var(--ink-2)', fontWeight: 700 }}>{fmt(row.f1)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{fmt(row.accuracy)}</td>
                <td className="mono" style={{ textAlign: 'right', color: row.fn ? 'var(--terracotta)' : 'var(--ink-3)' }}>{row.fn || 0}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{row.fp || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card card-pad">
        <div className="row gap-md">
          <AlertTriangle size={18} color="var(--terracotta)" />
          <div>
            <div style={{ fontWeight: 600 }}>À lire avant de conclure</div>
            <div className="muted" style={{ fontSize: 13 }}>
              L’accuracy peut paraître bonne si le corpus contient beaucoup de phrases propres. Le détecteur à auditer en priorité est {risky ? ` ${risky.label}` : ''} si ses faux négatifs restent élevés.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function InterpretationCard({ title, value, text }) {
  return (
    <div className="card card-pad">
      <div className="smallcaps mb-sm">{title}</div>
      <div className="serif" style={{ fontSize: 28, color: 'var(--terracotta)' }}>{value}</div>
      <p className="muted" style={{ margin: '8px 0 0', fontSize: 13 }}>{text}</p>
    </div>
  )
}

function Confusion({ rows }) {
  return (
    <div>
      <div className="card card-pad mb-lg">
        <h3 className="section-title" style={{ fontSize: 18 }}>Lire une matrice de confusion</h3>
        <div className="grid-4 mt-md">
          <LegendItem label="TP" text="Erreur présente et détectée." tone="success" />
          <LegendItem label="FN" text="Erreur présente mais acceptée. Critique." tone="danger" />
          <LegendItem label="FP" text="Phrase propre rejetée à tort." tone="warn" />
          <LegendItem label="TN" text="Phrase propre acceptée." tone="success" />
        </div>
      </div>

      <div className="grid-2">
        {rows.map(row => (
          <div key={row.detector} className="card card-pad">
            <div className="between mb-md">
              <div>
                <h3 className="section-title" style={{ fontSize: 18 }}>{row.label}</h3>
                <div className="muted mono" style={{ fontSize: 11 }}>{row.detector}</div>
              </div>
              <span className="pill pill-info">F1 {fmt(row.f1)}</span>
            </div>
            <div className="confusion-layout">
              <div className="cm" style={{ width: '100%' }}>
                <div className="cm-cell tp"><div className="v">{row.tp || 0}</div><div className="l">TP</div></div>
                <div className="cm-cell fn"><div className="v">{row.fn || 0}</div><div className="l">FN</div></div>
                <div className="cm-cell fp"><div className="v">{row.fp || 0}</div><div className="l">FP</div></div>
                <div className="cm-cell tn"><div className="v">{row.tn || 0}</div><div className="l">TN</div></div>
              </div>
              <div className="col gap-md">
                <MetricLine label="Précision" value={row.precision} />
                <MetricLine label="Rappel" value={row.recall} />
                <MetricLine label="F1" value={row.f1} accent />
                <MetricLine label="Accuracy" value={row.accuracy} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function LegendItem({ label, text, tone }) {
  return (
    <div className="legend-item">
      <span className={`pill ${tone === 'danger' ? 'pill-danger' : tone === 'warn' ? 'pill-warn' : 'pill-success'}`}>{label}</span>
      <span className="muted">{text}</span>
    </div>
  )
}

function MetricLine({ label, value, accent }) {
  return (
    <div>
      <div className="between mb-sm">
        <span className="smallcaps">{label}</span>
        <span className="mono" style={{ fontWeight: 700, color: accent ? 'var(--terracotta)' : 'var(--ink-2)' }}>{fmt(value)}</span>
      </div>
      <div className="bar-track" style={{ height: 7 }}>
        <div className="bar-fill" style={{ width: `${Math.max(0, Math.min(1, value || 0)) * 100}%`, background: accent ? 'var(--terracotta)' : 'var(--aegean)' }} />
      </div>
    </div>
  )
}

function Diagnostic({ rows, results }) {
  const errorTypes = buildErrorTypeDiagnostics(results, rows)
  const lengths = ['1-5', '6-10', '11-15', '16-20', '21-30', '31+']

  return (
    <div className="grid-2">
      <div className="card card-pad">
        <h3 className="section-title mb-sm" style={{ fontSize: 18 }}>Détection par type d’erreur</h3>
        <p className="muted mb-md" style={{ fontSize: 13 }}>
          Ici on regarde uniquement les phrases corrompues : combien d’erreurs de chaque type sont retrouvées par chaque détecteur.
        </p>
        {errorTypes.length === 0 ? <div className="empty">Aucune erreur injectée</div> : (
          <table className="tbl" style={{ fontSize: 12.5 }}>
            <thead>
              <tr>
                <th>Type</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                {rows.map(row => <th key={row.detector} style={{ textAlign: 'right' }}>{row.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {errorTypes.map(item => (
                <tr key={item.type}>
                  <td className="mono" style={{ color: 'var(--terracotta)' }}>{item.type}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{item.total}</td>
                  {rows.map(row => {
                    const stats = item.detectors[row.detector]
                    const rate = ratio(stats.detected, item.total)
                    return (
                      <td key={row.detector} className="mono" style={{ textAlign: 'right' }}>
                        {stats.detected}/{item.total} <span className="muted-2">({pct(rate, 0)})</span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card card-pad">
        <h3 className="section-title mb-sm" style={{ fontSize: 18 }}>Performance par longueur</h3>
        <p className="muted mb-md" style={{ fontSize: 13 }}>
          Utile pour voir si les longues phrases dégradent les verdicts.
        </p>
        <table className="tbl" style={{ fontSize: 12.5 }}>
          <thead>
            <tr>
              <th>Longueur</th>
              {rows.map(row => <th key={row.detector} style={{ textAlign: 'right' }}>{row.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {lengths.map(bucket => (
              <tr key={bucket}>
                <td className="mono">{bucket}</td>
                {rows.map(row => <td key={row.detector} className="mono" style={{ textAlign: 'right' }}>{fmt(row.perLength?.[bucket]?.f1)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Agreement({ rows, agreement }) {
  const entries = Object.entries(agreement)
  return (
    <div className="grid-2">
      <div className="card card-pad">
        <h3 className="section-title mb-sm" style={{ fontSize: 18 }}>Accord inter-méthodes</h3>
        <p className="muted mb-md" style={{ fontSize: 13 }}>
          L’accord dit si deux méthodes prennent la même décision. Il ne dit pas si elles ont raison.
        </p>
        {entries.length === 0 ? <div className="empty">Aucun accord calculé</div> : entries.map(([key, value]) => (
          <div key={key} className="mb-md">
            <div className="between mb-sm">
              <span style={{ fontWeight: 600 }}>{formatAgreementKey(key)}</span>
              <span className="mono" style={{ fontWeight: 700 }}>{pct(value, 0)}</span>
            </div>
            <div className="bar-track" style={{ height: 8 }}><div className="bar-fill" style={{ width: `${value * 100}%` }} /></div>
          </div>
        ))}
      </div>
      <div className="card card-pad">
        <h3 className="section-title mb-sm" style={{ fontSize: 18 }}>Interprétation</h3>
        <div className="col gap-md">
          <p className="muted" style={{ margin: 0 }}>
            Un accord élevé avec des F1 faibles signifie que les méthodes se trompent souvent ensemble.
          </p>
          <p className="muted" style={{ margin: 0 }}>
            Un accord faible peut être intéressant : les méthodes capturent peut-être des erreurs différentes.
          </p>
          <div className="codeblock">
            {rows.map(row => `${row.label}: F1=${fmt(row.f1)} FN=${row.fn || 0} FP=${row.fp || 0}`).join('\n')}
          </div>
        </div>
      </div>
    </div>
  )
}

function Benchmark({ items }) {
  const flatRows = items.flatMap(item => {
    const dataset = datasetSummary(item.results)
    return metricRows(item.results).map(row => ({
      experiment: item.experiment.name,
      created_at: item.experiment.created_at,
      detector: row.detector,
      label: row.label,
      precision: row.precision,
      recall: row.recall,
      f1: row.f1,
      accuracy: row.accuracy,
      tp: row.tp,
      fp: row.fp,
      fn: row.fn,
      tn: row.tn,
      total: dataset.total_sentences,
      corrupted: dataset.corrupted_sentences,
      sampling: dataset.sampling || {},
    }))
  })
  const detectorNames = [...new Set(flatRows.map(row => row.detector))]
  const summaries = detectorNames.map(detector => {
    const rows = flatRows.filter(row => row.detector === detector)
    return {
      detector,
      label: detectorLabel(detector),
      runs: rows.length,
      precision: average(rows.map(row => row.precision)),
      recall: average(rows.map(row => row.recall)),
      f1: average(rows.map(row => row.f1)),
      accuracy: average(rows.map(row => row.accuracy)),
      fn: average(rows.map(row => row.fn)),
      fp: average(rows.map(row => row.fp)),
    }
  }).sort((a, b) => (b.f1 || 0) - (a.f1 || 0))

  return (
    <div>
      <div className="card card-pad mb-lg">
        <h3 className="section-title mb-sm" style={{ fontSize: 18 }}>Comparaison multi-expériences</h3>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Cette vue agrège les expériences terminées. Elle sert à comparer plusieurs seeds ou plusieurs modèles sans conclure sur un seul run.
        </p>
      </div>

      <div className="card mb-lg">
        <table className="tbl">
          <thead>
            <tr>
              <th>Détecteur</th>
              <th style={{ textAlign: 'right' }}>Runs</th>
              <th style={{ textAlign: 'right' }}>Précision moy.</th>
              <th style={{ textAlign: 'right' }}>Rappel moy.</th>
              <th style={{ textAlign: 'right' }}>F1 moy.</th>
              <th style={{ textAlign: 'right' }}>FN moy.</th>
              <th style={{ textAlign: 'right' }}>FP moy.</th>
            </tr>
          </thead>
          <tbody>
            {summaries.map(row => (
              <tr key={row.detector}>
                <td><strong>{row.label}</strong></td>
                <td className="mono" style={{ textAlign: 'right' }}>{row.runs}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{fmt(row.precision)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{fmt(row.recall)}</td>
                <td className="mono" style={{ textAlign: 'right', color: 'var(--terracotta)', fontWeight: 700 }}>{fmt(row.f1)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{fmt(row.fn, 1)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{fmt(row.fp, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <table className="tbl">
          <thead>
            <tr>
              <th>Expérience</th>
              <th>Détecteur</th>
              <th style={{ textAlign: 'right' }}>Phrases</th>
              <th style={{ textAlign: 'right' }}>Corrompues</th>
              <th>Échantillon</th>
              <th style={{ textAlign: 'right' }}>Précision</th>
              <th style={{ textAlign: 'right' }}>Rappel</th>
              <th style={{ textAlign: 'right' }}>F1</th>
              <th style={{ textAlign: 'right' }}>FN</th>
              <th style={{ textAlign: 'right' }}>FP</th>
            </tr>
          </thead>
          <tbody>
            {flatRows.map((row, index) => (
              <tr key={`${row.experiment}-${row.detector}-${index}`}>
                <td>{row.experiment}</td>
                <td>{row.label}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{row.total}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{row.corrupted}</td>
                <td className="mono">{row.sampling.mode || 'first_n'} · {row.sampling.seed ?? '-'}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{fmt(row.precision)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{fmt(row.recall)}</td>
                <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(row.f1)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{row.fn}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{row.fp}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function average(values) {
  const clean = values.filter(value => typeof value === 'number')
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0
}

function formatAgreementKey(key) {
  return key.split('_vs_').map(part => detectorLabel(part)).join(' / ')
}

function PerSentence({ results, rows }) {
  const [onlyDisagreements, setOnlyDisagreements] = useState(false)
  const [onlyErrors, setOnlyErrors] = useState(false)
  const [query, setQuery] = useState('')
  const groundTruth = results?.ground_truth || []
  const detectorNames = rows.map(row => row.detector)
  const maps = detectorMaps(rows)
  let sentenceRows = getCriticalRows(results, rows)

  if (onlyDisagreements) {
    sentenceRows = sentenceRows.filter(row => {
      const vals = Object.values(row.predictions).filter(value => value !== null)
      return vals.length > 1 && !vals.every(value => value === vals[0])
    })
  }
  if (onlyErrors) {
    sentenceRows = sentenceRows.filter(row => row.gt.has_error)
  }
  if (query.trim()) {
    const q = query.trim().toLowerCase()
    sentenceRows = sentenceRows.filter(row => {
      const errorText = (row.gt.errors || []).map(err => `${err.error_type} ${err.original_value || ''} ${err.corrupted_value || ''}`).join(' ')
      return row.gt.sentence_id.toLowerCase().includes(q) || errorText.toLowerCase().includes(q)
    })
  }

  return (
    <div>
      <div className="row gap-md mb-md">
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 10, top: 8, color: 'var(--ink-3)' }} />
          <input className="input" value={query} onChange={event => setQuery(event.target.value)} placeholder="Filtrer par ID, type d’erreur, relation..." style={{ paddingLeft: 32 }} />
        </div>
        <label className="row gap-sm muted" style={{ fontSize: 12 }}>
          <input type="checkbox" checked={onlyErrors} onChange={e => setOnlyErrors(e.target.checked)} />
          Corrompues
        </label>
        <label className="row gap-sm muted" style={{ fontSize: 12 }}>
          <input type="checkbox" checked={onlyDisagreements} onChange={e => setOnlyDisagreements(e.target.checked)} />
          Désaccords
        </label>
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>ID</th>
              <th>Vérité</th>
              <th>Erreur injectée</th>
              {detectorNames.map(name => <th key={name}>{detectorLabel(name)}</th>)}
            </tr>
          </thead>
          <tbody>
            {sentenceRows.slice(0, 300).map(({ gt }) => (
              <tr key={gt.sentence_id}>
                <td className="mono muted-2">{gt.sentence_id}</td>
                <td><span className={`pill ${gt.has_error ? 'pill-danger' : 'pill-success'}`}>{gt.has_error ? 'Corrompue' : 'Originale'}</span></td>
                <td>
                  <span className="mono muted" style={{ fontSize: 11.5 }}>
                    {(gt.errors || []).length ? formatErrors(gt.errors) : '—'}
                  </span>
                </td>
                {detectorNames.map(name => {
                  const pred = maps[name]?.[gt.sentence_id]
                  const predictedError = pred ? !pred.is_correct : null
                  return (
                    <td key={name}>
                      <span className={`pill ${predictedError ? 'pill-danger' : 'pill-success'}`}>
                        {pred ? (predictedError ? 'Détectée' : 'Acceptée') : '-'}
                      </span>
                      {pred?.confidence !== undefined && <span className="mono muted-2" style={{ marginLeft: 8, fontSize: 11 }}>{fmt(pred.confidence, 2)}</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sentenceRows.length > 300 && <div className="muted mt-md" style={{ fontSize: 12 }}>Affichage limité aux 300 premières lignes filtrées.</div>}
    </div>
  )
}

function formatErrors(errors) {
  return errors.map(error => {
    const change = error.original_value !== undefined ? ` ${error.original_value}→${error.corrupted_value}` : ''
    return `${error.error_type}${change}`
  }).join(' · ')
}

function Report({ selectedId, experiment }) {
  const [models, setModels] = useState([])
  const [model, setModel] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/ollama/models').then(res => {
      setModels(res.data)
      if (res.data[0]) setModel(res.data[0].name)
    }).catch(() => setModels([]))
  }, [])

  const generateWithLlm = async () => {
    if (!model) return
    setGenerating(true)
    setError('')
    setGenerated('')
    try {
      const res = await api.post(`/experiments/${selectedId}/report/llm`, {
        model,
        temperature: 0.2,
        timeout: 180,
        num_predict: 1400,
      })
      setGenerated(res.data.markdown)
    } catch (err) {
      setError(err.response?.data?.detail || err.message)
    } finally {
      setGenerating(false)
    }
  }

  const filename = `rapport_${(experiment?.name || 'homere').replaceAll(' ', '_')}.md`

  return (
    <div className="grid-2">
      <div className="card card-pad">
        <h3 className="section-title mb-sm" style={{ fontSize: 18 }}>Rapport déterministe</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Généré uniquement à partir des métriques calculées par Homere. C’est la version la plus sûre pour archiver les résultats.
        </p>
        <a className="btn btn-primary" href={`/api/experiments/${selectedId}/export/report-md`}>
          <Download size={14} /> Télécharger Markdown
        </a>
      </div>

      <div className="card card-pad">
        <h3 className="section-title mb-sm" style={{ fontSize: 18 }}>Interprétation LLM</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Option utile pour rédiger les paragraphes. Le LLM reçoit les scores déjà calculés et n’a pas le droit d’en inventer.
        </p>
        <div className="row gap-md">
          <select className="select" value={model} onChange={event => setModel(event.target.value)}>
            {models.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
            {models.length === 0 && <option value="">Aucun modèle détecté</option>}
          </select>
          <button className="btn btn-accent" disabled={!model || generating} onClick={generateWithLlm}>
            {generating ? <span className="spinner" /> : <Sparkles size={14} />} Rédiger
          </button>
        </div>
        {error && <div className="pill pill-danger mt-md">{error}</div>}
      </div>

      {generated && (
        <div className="card card-pad" style={{ gridColumn: '1 / -1' }}>
          <div className="between mb-md">
            <div>
              <h3 className="section-title" style={{ fontSize: 18 }}>Rapport généré</h3>
              <div className="muted" style={{ fontSize: 12 }}>À relire avant intégration dans le mémoire.</div>
            </div>
            <button className="btn" onClick={() => downloadText(filename, generated)}><Download size={14} /> Télécharger</button>
          </div>
          <pre className="codeblock report-preview">{generated}</pre>
        </div>
      )}
    </div>
  )
}

function summarizeDataset(groundTruth) {
  const errorTypeCounts = {}
  let corrupted = 0
  for (const item of groundTruth) {
    if (item.has_error) corrupted += 1
    for (const err of item.errors || []) {
      errorTypeCounts[err.error_type] = (errorTypeCounts[err.error_type] || 0) + 1
    }
  }
  return {
    total_sentences: groundTruth.length,
    corrupted_sentences: corrupted,
    clean_sentences: groundTruth.length - corrupted,
    actual_error_rate: groundTruth.length ? corrupted / groundTruth.length : 0,
    error_type_counts: errorTypeCounts,
  }
}

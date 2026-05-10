import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, BrainCircuit, Check, Play, RotateCcw } from 'lucide-react'
import api from '../../api/client'

const DEFAULT_PROMPT = `You are a strict Universal Dependencies (UD) annotation auditor for French.

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
{"is_correct": true, "confidence": 0.9, "suspect_tokens": [], "explanation": "annotation acceptable"}`

const presets = [
  { key: 'fast', label: 'Rapide', sub: 'LLM + ULISSE · 50 phrases', maxSentences: '50', detectors: ['llm_judge', 'ulisse'], errorRate: 10 },
  { key: 'llm', label: 'LLM seul', sub: 'Juge neuronal uniquement', maxSentences: '100', detectors: ['llm_judge'], errorRate: 10 },
  { key: 'baseline', label: 'Baselines classiques', sub: 'ULISSE + PUPA-inspiré + SVM', maxSentences: '', detectors: ['ulisse', 'pupa', 'svm'], errorRate: 10 },
  { key: 'compare', label: 'Comparaison complète', sub: 'LLM + ULISSE + PUPA + SVM · corpus entier', maxSentences: '', detectors: ['llm_judge', 'ulisse', 'pupa', 'svm'], errorRate: 15 },
  { key: 'heavy', label: 'Modèle lourd', sub: 'LLM local gourmand · 50 phrases', maxSentences: '50', detectors: ['llm_judge'], errorRate: 10 },
]

function formatLocalExperimentTimestamp(date = new Date()) {
  const pad = value => String(value).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + `-${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function ExperimentConfig({ onSubmit }) {
  const [corpora, setCorpora] = useState([])
  const [detectorsList, setDetectorsList] = useState([])
  const [ollamaModels, setOllamaModels] = useState([])
  const [preset, setPreset] = useState('compare')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const [name, setName] = useState('')
  const [corpusId, setCorpusId] = useState('')
  const [maxSentences, setMaxSentences] = useState('')
  const [sampleRandom, setSampleRandom] = useState(true)
  const [errorRate, setErrorRate] = useState(15)
  const [errorTypes, setErrorTypes] = useState(['head', 'deprel'])
  const [seed, setSeed] = useState(42)
  const [selectedDetectors, setSelectedDetectors] = useState([])
  const [llmConfig, setLlmConfig] = useState({
    model: 'llama3',
    temperature: 0.1,
    prompt_template: DEFAULT_PROMPT,
    timeout: 120,
    few_shot_examples: [],
    concurrency: 1,
    batch_size: 1,
  })
  const [ulisseConfig, setUlisseConfig] = useState({
    length_range: 3,
    use_arc_lemma_feat: true,
    threshold_percentile: 25,
  })
  const [pupaConfig, setPupaConfig] = useState({
    threshold_percentile: 15,
    threshold_source: 'target',
    alpha: 0.1,
  })
  const [svmConfig, setSvmConfig] = useState({
    max_train_sentences: 1000,
    c_value: 0.5,
    decision_threshold: 0.5,
    auto_threshold: true,
  })

  useEffect(() => {
    api.get('/corpus').then(res => {
      setCorpora(res.data)
      if (res.data.length > 0) setCorpusId(current => current || res.data[0].id)
    }).catch(() => setCorpora([]))

    api.get('/detectors').then(res => {
      setDetectorsList(res.data)
      const defaults = res.data
        .filter(detector => detector.is_implemented && ['llm_judge', 'ulisse', 'pupa', 'svm'].includes(detector.name))
        .map(detector => detector.name)
      setSelectedDetectors(current => current.length ? current : defaults)
    }).catch(() => setDetectorsList([]))

    api.get('/ollama/models').then(res => {
      setOllamaModels(res.data)
      if (res.data.length > 0) {
        const preferred = res.data.find(model => model.name === 'llama3.2:3b') || res.data.find(model => /3b|4b|7b/i.test(model.name)) || res.data[0]
        setLlmConfig(config => ({ ...config, model: preferred.name }))
      }
    }).catch(() => setOllamaModels([]))
  }, [])

  const selectedCorpus = useMemo(
    () => corpora.find(corpus => corpus.id === corpusId),
    [corpora, corpusId],
  )
  const llmSelected = selectedDetectors.includes('llm_judge')
  const ulisseSelected = selectedDetectors.includes('ulisse')
  const pupaSelected = selectedDetectors.includes('pupa')
  const svmSelected = selectedDetectors.includes('svm')

  const applyPreset = (nextPreset) => {
    const config = presets.find(item => item.key === nextPreset)
    if (!config) return
    const implemented = new Set(detectorsList.filter(detector => detector.is_implemented).map(detector => detector.name))
    setPreset(nextPreset)
    setMaxSentences(config.maxSentences)
    setErrorRate(config.errorRate)
    setSelectedDetectors(config.detectors.filter(detector => implemented.has(detector)))
    if (nextPreset === 'heavy') {
      const heavyModel = ollamaModels.find(model => /14b|27b|32b|70b/i.test(model.name))
      if (heavyModel) setLlmConfig(current => ({ ...current, model: heavyModel.name, concurrency: 1, batch_size: 2 }))
    }
  }

  const toggleErrorType = (type) => {
    setErrorTypes(current => current.includes(type) ? current.filter(item => item !== type) : [...current, type])
  }

  const toggleDetector = (detectorName) => {
    setSelectedDetectors(current =>
      current.includes(detectorName)
        ? current.filter(item => item !== detectorName)
        : [...current, detectorName],
    )
  }

  const handleSubmit = async () => {
    if (!corpusId) {
      setError('Importe ou sélectionne un corpus avant de lancer une expérience.')
      return
    }
    if (selectedDetectors.length === 0) {
      setError('Sélectionne au moins un détecteur.')
      return
    }
    if (errorTypes.length === 0) {
      setError('Sélectionne au moins un type d’erreur.')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const detectors_config = selectedDetectors.map(detectorName => {
        if (detectorName === 'llm_judge') return { name: detectorName, params: llmConfig }
        if (detectorName === 'ulisse') return { name: detectorName, params: ulisseConfig }
        if (detectorName === 'pupa') return { name: detectorName, params: pupaConfig }
        if (detectorName === 'svm') return { name: detectorName, params: svmConfig }
        return { name: detectorName, params: {} }
      })
      const res = await api.post('/experiments', {
        name: name || `Homere-${formatLocalExperimentTimestamp()}`,
        corpus_id: corpusId,
        max_sentences: maxSentences ? Number.parseInt(maxSentences, 10) : null,
        sample_random: sampleRandom,
        sample_seed: seed,
        error_config: {
          error_rate: errorRate / 100,
          error_types: errorTypes,
          seed,
          errors_per_sentence: 1,
        },
        detectors_config,
      })
      onSubmit(res.data.id)
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de la création')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page">
      <div className="row gap-sm mb-md">
        <Link className="btn btn-ghost btn-sm" to="/experiments"><ArrowLeft size={12} /> Expériences</Link>
        <span className="muted-2">/</span>
        <span className="muted" style={{ fontSize: 12 }}>nouvelle</span>
      </div>

      <div className="page-header">
        <div>
          <div className="row gap-sm mb-sm"><span className="smallcaps">Configuration</span></div>
          <div className="row gap-sm">
            <h1 className="page-title" style={{ marginBottom: 0 }}>Nouvelle expérience</h1>
            <HelpTip text="Une expérience prend un corpus CoNLL-U, injecte des erreurs contrôlées, lance un ou plusieurs détecteurs, puis calcule les métriques de comparaison." />
          </div>
          <p className="page-sub">Corpus, erreurs injectées, détecteurs, paramètres LLM et exports reproductibles.</p>
        </div>
      </div>

      <div className="mb-lg">
        <div className="row gap-sm mb-sm">
          <div className="smallcaps">Préréglages</div>
          <HelpTip text="Raccourcis de configuration. Ils changent automatiquement le nombre de phrases, le taux d'erreur et les détecteurs sélectionnés." />
        </div>
        <div className="experiment-presets">
          {presets.map(item => (
            <button
              key={item.key}
              type="button"
              className={`preset-card${preset === item.key ? ' active' : ''}`}
              onClick={() => applyPreset(item.key)}
            >
              <span>{item.label}</span>
              <small>{item.sub}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="grid-2 experiment-config-grid">
        <div className="col gap-lg">
          <div className="card card-pad">
            <div className="row gap-sm mb-md"><span className="numeral">i.</span><h3 className="section-title" style={{ fontSize: 17 }}>Identité</h3></div>
            <LabelWithHelp label="Nom de l'expérience" text="Nom libre utilisé pour retrouver cette exécution dans les résultats et les exports." />
            <input className="input" value={name} onChange={event => setName(event.target.value)} placeholder="Comparaison LLM vs ULISSE" />

            <LabelWithHelp label="Corpus" text="Corpus annoté au format CoNLL-U sur lequel Homere va injecter des erreurs puis tester les détecteurs." className="mt-md" />
            <select className="select" value={corpusId} onChange={event => setCorpusId(event.target.value)}>
              {corpora.map(corpus => (
                <option key={corpus.id} value={corpus.id}>{corpus.name} ({corpus.num_sentences} phrases)</option>
              ))}
            </select>
            {corpora.length === 0 && (
              <div className="empty" style={{ padding: '24px 12px' }}>
                Aucun corpus disponible. <Link to="/corpus">Importer un corpus</Link>
              </div>
            )}
          </div>

          <div className="card card-pad">
            <div className="row gap-sm mb-md"><span className="numeral">ii.</span><h3 className="section-title" style={{ fontSize: 17 }}>Échantillonnage</h3></div>
            <div className="grid-2" style={{ gap: 14 }}>
              <div>
                <LabelWithHelp label="Limite" text="Nombre maximal de phrases utilisées. Vide signifie que l'expérience prend tout le corpus." />
                <input className="input mono" type="number" min="1" value={maxSentences} onChange={event => setMaxSentences(event.target.value)} placeholder={selectedCorpus?.num_sentences || 'Tout'} />
              </div>
              <div>
                <LabelWithHelp label="Seed" text="Graine aléatoire. Une même seed reproduit la même injection d'erreurs, utile pour comparer équitablement deux méthodes." />
                <input className="input mono" type="number" value={seed} onChange={event => setSeed(Number.parseInt(event.target.value, 10) || 0)} />
              </div>
            </div>
            <button
              type="button"
              className={`choice-row mt-md${sampleRandom ? ' active' : ''}`}
              onClick={() => setSampleRandom(value => !value)}
            >
              <Check size={13} />
              <span>Échantillon aléatoire reproductible</span>
              <HelpTip text="Si activé, Homere tire les phrases aléatoirement avec la seed indiquée. Si désactivé, il prend les premières phrases du corpus." />
            </button>
            <div className="muted mt-sm" style={{ fontSize: 12 }}>
              {maxSentences ? `${maxSentences} phrase(s) analysées` : 'Corpus entier'} · {sampleRandom ? 'tirage aléatoire' : 'premières phrases'}{selectedCorpus ? ` · ${selectedCorpus.num_sentences} phrases disponibles` : ''}
            </div>
          </div>

          <div className="card card-pad">
            <div className="row gap-sm mb-md"><span className="numeral">iii.</span><h3 className="section-title" style={{ fontSize: 17 }}>Injection d'erreurs</h3></div>
            <LabelWithHelp label="Taux d'erreur" text="Proportion approximative de phrases ou d'annotations que l'on rend volontairement incorrectes pour construire la vérité terrain." />
            <div className="row gap-md">
              <input type="range" min="0" max="50" step="1" value={errorRate} onChange={event => setErrorRate(Number.parseInt(event.target.value, 10))} style={{ flex: 1 }} />
              <span className="mono" style={{ fontSize: 14, fontWeight: 600, color: 'var(--terracotta)', width: 52, textAlign: 'right' }}>{errorRate} %</span>
            </div>
            <LabelWithHelp label="Types d'erreurs" text="Familles d'erreurs injectées dans les arbres de dépendances. Elles permettent de tester si les détecteurs repèrent différents types de fautes." className="mt-md" />
            <div className="grid-2" style={{ gap: 8 }}>
              {[
                ['head', 'head', "Change la tête syntaxique d'un token : le mot pointe vers le mauvais parent dans l'arbre."],
                ['deprel', 'deprel', "Change la relation de dépendance : par exemple nsubj, obj, det, case."],
                ['pos', 'UPOS', "Change la catégorie grammaticale universelle : NOUN, VERB, DET, ADP, etc."],
                ['combined', 'combined', "Combine plusieurs perturbations sur une même phrase pour simuler des analyses plus abîmées."],
              ].map(([key, label, help]) => (
                <button
                  key={key}
                  type="button"
                  className={`choice-row${errorTypes.includes(key) ? ' active' : ''}`}
                  onClick={() => toggleErrorType(key)}
                >
                  <Check size={13} />
                  <span className="mono">{label}</span>
                  <HelpTip text={help} />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="col gap-lg">
          <div className="card card-pad">
            <div className="row gap-sm mb-md">
              <span className="numeral">iv.</span>
              <h3 className="section-title" style={{ fontSize: 17 }}>Détecteurs</h3>
              <HelpTip text="Méthodes qui jugent si une analyse syntaxique est correcte. C'est ici que l'on compare ULISSE aux LLM-as-a-judge." />
            </div>
            {detectorsList.map(detector => (
              <button
                key={detector.name}
                type="button"
                disabled={!detector.is_implemented}
                onClick={() => toggleDetector(detector.name)}
                className={`detector-choice${selectedDetectors.includes(detector.name) ? ' active' : ''}`}
              >
                <span className={`dot dot-${detector.is_implemented ? 'done' : 'pending'}`} />
                <span style={{ flex: 1 }}>
                  <strong>{labelDetector(detector.name)}</strong>
                  <small>{detector.description}</small>
                </span>
                <span className={`pill ${detector.name === 'llm_judge' ? 'pill-info' : detector.is_implemented ? 'pill-success' : 'pill-warn'}`}>
                  {detector.is_implemented ? 'prêt' : 'WIP'}
                </span>
                <HelpTip text={detectorHelp(detector.name)} />
              </button>
            ))}
          </div>

          {llmSelected && (
            <div className="card card-pad">
              <div className="row gap-sm mb-md">
                <span className="numeral">v.</span>
                <h3 className="section-title" style={{ fontSize: 17 }}>LLM-as-a-judge</h3>
                <span style={{ flex: 1 }} />
                <span className="pill pill-info"><BrainCircuit size={11} /> Ollama</span>
              </div>
              <LabelWithHelp label="Modèle" text="Modèle Ollama local utilisé pour juger chaque phrase annotée. Les modèles lourds peuvent être plus lents mais parfois plus fiables." />
              <select className="select" value={llmConfig.model} onChange={event => setLlmConfig(config => ({ ...config, model: event.target.value }))}>
                {ollamaModels.map(model => <option key={model.name} value={model.name}>{model.name}</option>)}
                {ollamaModels.length === 0 && <option value={llmConfig.model}>Aucun modèle détecté</option>}
              </select>
              <div className="grid-2 mt-md" style={{ gap: 14 }}>
                <NumberField label="Température" help="Contrôle l'aléatoire du LLM. Pour juger des annotations, on garde une valeur basse pour obtenir des réponses stables." value={llmConfig.temperature} step="0.1" onChange={value => setLlmConfig(config => ({ ...config, temperature: value }))} />
                <NumberField label="Timeout (s)" help="Temps maximal accordé à Ollama pour répondre avant de considérer la requête comme échouée." value={llmConfig.timeout} onChange={value => setLlmConfig(config => ({ ...config, timeout: value }))} />
                <NumberField label="Parallélisme" help="Nombre de requêtes Ollama envoyées en même temps. Plus haut peut accélérer, mais peut saturer la machine." value={llmConfig.concurrency} onChange={value => setLlmConfig(config => ({ ...config, concurrency: value }))} />
                <NumberField label="Batch" help="Nombre de phrases évaluées dans une même requête LLM. Un batch plus grand réduit les appels, mais peut compliquer la réponse JSON." value={llmConfig.batch_size} onChange={value => setLlmConfig(config => ({ ...config, batch_size: value }))} />
              </div>
              <LabelWithHelp label="Prompt template" text="Instruction envoyée au LLM. Les variables sont remplacées par la phrase et son annotation CoNLL-U au moment de l'expérience." className="mt-md" />
              <textarea
                className="textarea"
                rows={8}
                value={llmConfig.prompt_template}
                onChange={event => setLlmConfig(config => ({ ...config, prompt_template: event.target.value }))}
              />
            </div>
          )}

          {ulisseSelected && (
            <div className="card card-pad">
              <div className="row gap-sm mb-md"><span className="numeral">vi.</span><h3 className="section-title" style={{ fontSize: 17 }}>ULISSE</h3></div>
              <div className="grid-2" style={{ gap: 14 }}>
                <NumberField label="length_range" help="Fenêtre de longueurs comparables pour ULISSE. 0 compare avec des phrases de même longueur, 3 accepte +/-3 tokens." value={ulisseConfig.length_range} onChange={value => setUlisseConfig(config => ({ ...config, length_range: value }))} />
                <NumberField label="threshold_percentile" help="Seuil de décision d'ULISSE. Plus il est haut, plus le détecteur rejette de phrases comme suspectes." value={ulisseConfig.threshold_percentile} onChange={value => setUlisseConfig(config => ({ ...config, threshold_percentile: value }))} />
              </div>
              <button
                type="button"
                className={`choice-row mt-md${ulisseConfig.use_arc_lemma_feat ? ' active' : ''}`}
                onClick={() => setUlisseConfig(config => ({ ...config, use_arc_lemma_feat: !config.use_arc_lemma_feat }))}
              >
                <Check size={13} />
                <span className="mono">ArcLemmaFeat</span>
                <HelpTip text="Ajoute des traits lexicaux fondés sur les lemmes dans le score ULISSE. Utile mais plus dépendant du corpus." />
              </button>
            </div>
          )}

          {pupaSelected && (
            <div className="card card-pad">
              <div className="row gap-sm mb-md"><span className="numeral">vii.</span><h3 className="section-title" style={{ fontSize: 17 }}>PUPA</h3></div>
              <div className="grid-2" style={{ gap: 14 }}>
                <NumberField label="threshold_percentile" help="Seuil de rejet fondé sur les scores de cohérence locale UPOS, têtes et DEPREL." value={pupaConfig.threshold_percentile} onChange={value => setPupaConfig(config => ({ ...config, threshold_percentile: value }))} />
                <NumberField label="alpha" help="Lissage des motifs rares. Plus haut réduit la pénalité des motifs jamais vus." value={pupaConfig.alpha} step="0.1" onChange={value => setPupaConfig(config => ({ ...config, alpha: value }))} />
              </div>
              <label className="label mt-md">threshold_source</label>
              <select className="select" value={pupaConfig.threshold_source} onChange={event => setPupaConfig(config => ({ ...config, threshold_source: event.target.value }))}>
                <option value="target">target</option>
                <option value="reference">reference</option>
              </select>
            </div>
          )}

          {svmSelected && (
            <div className="card card-pad">
              <div className="row gap-sm mb-md"><span className="numeral">viii.</span><h3 className="section-title" style={{ fontSize: 17 }}>SVM</h3></div>
              <div className="grid-2" style={{ gap: 14 }}>
                <NumberField label="max_train_sentences" help="Nombre de phrases propres tirées de la référence pour entraîner le SVM." value={svmConfig.max_train_sentences} onChange={value => setSvmConfig(config => ({ ...config, max_train_sentences: value }))} />
                <NumberField label="C" help="Paramètre de régularisation du SVM linéaire." value={svmConfig.c_value} step="0.1" onChange={value => setSvmConfig(config => ({ ...config, c_value: value }))} />
                <NumberField label="decision_threshold" help="Seuil manuel de probabilité d'erreur si le calibrage automatique est désactivé." value={svmConfig.decision_threshold} step="0.05" onChange={value => setSvmConfig(config => ({ ...config, decision_threshold: value }))} />
              </div>
              <button
                type="button"
                className={`choice-row mt-md${svmConfig.auto_threshold ? ' active' : ''}`}
                onClick={() => setSvmConfig(config => ({ ...config, auto_threshold: !config.auto_threshold }))}
              >
                <Check size={13} />
                <span>Seuil calibré sur l'entraînement</span>
                <HelpTip text="Le SVM choisit le seuil qui maximise le F1 sur les exemples propres et injectés du corpus de référence." />
              </button>
            </div>
          )}

          <div className="card card-pad" style={{ background: 'var(--bg-elev)', borderStyle: 'dashed' }}>
            <div className="smallcaps mb-sm">Récapitulatif</div>
            <div style={{ fontSize: 13, lineHeight: 1.75 }}>
              <SummaryLine label="Corpus" value={selectedCorpus?.name || 'aucun'} />
              <SummaryLine label="Phrases" value={maxSentences || selectedCorpus?.num_sentences || '-'} />
              <SummaryLine label="Échantillon" value={sampleRandom ? `aléatoire · seed ${seed}` : 'premières phrases'} />
              <SummaryLine label="Erreurs" value={`${errorRate}% · ${errorTypes.join(', ') || '-'}`} />
              <SummaryLine label="Détecteurs" value={selectedDetectors.map(labelDetector).join(' · ') || '-'} />
              <SummaryLine label="LLM" value={llmSelected ? llmConfig.model : '-'} />
            </div>
          </div>

          {error && <div className="pill pill-danger">{error}</div>}
          <div className="row gap-md experiment-actions">
            <Link className="btn" to="/experiments">Annuler</Link>
            <button className="btn btn-ghost" type="button" onClick={() => applyPreset(preset)}><RotateCcw size={14} /> Réinitialiser</button>
            <button className="btn btn-accent" type="button" onClick={handleSubmit} disabled={submitting || !corpusId || selectedDetectors.length === 0}>
              <Play size={14} /> {submitting ? 'Lancement...' : "Lancer l'expérience"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function NumberField({ label, help, value, onChange, step = '1' }) {
  return (
    <div>
      <LabelWithHelp label={label} text={help} />
      <input className="input mono" type="number" step={step} value={value} onChange={event => onChange(Number.parseFloat(event.target.value) || 0)} />
    </div>
  )
}

function LabelWithHelp({ label, text, className = '' }) {
  return (
    <label className={`label label-help ${className}`}>
      <span>{label}</span>
      {text && <HelpTip text={text} />}
    </label>
  )
}

function HelpTip({ text }) {
  return (
    <span className="help-tip" aria-label={text}>
      ?
      <span className="tip-pop">{text}</span>
    </span>
  )
}

function SummaryLine({ label, value }) {
  return (
    <div className="between">
      <span className="muted">{label}</span>
      <span className="mono" style={{ textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function labelDetector(name) {
  return {
    llm_judge: 'LLM-as-a-judge',
    ulisse: 'ULISSE',
    svm: 'SVM',
    pupa: 'PUPA',
  }[name] || name
}

function detectorHelp(name) {
  return {
    llm_judge: "Le LLM reçoit la phrase et son CoNLL-U, puis répond si l'analyse lui semble correcte.",
    ulisse: "Méthode non supervisée qui repère les arbres atypiques à partir de statistiques linguistiques du corpus.",
    svm: "Baseline supervisée au niveau phrase, entraînée sur la référence propre et une copie avec erreurs injectées.",
    pupa: "Adaptation inspirée de PUPA qui mesure la cohérence locale UPOS, têtes et DEPREL.",
  }[name] || 'Méthode de détection utilisée dans les comparaisons.'
}

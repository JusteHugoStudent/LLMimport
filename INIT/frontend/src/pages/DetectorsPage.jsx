import { useEffect, useState } from 'react'
import { BrainCircuit, RefreshCw, Sparkles } from 'lucide-react'
import api from '../api/client'

export default function DetectorsPage() {
  const [detectors, setDetectors] = useState([])
  const [models, setModels] = useState([])
  const [ollama, setOllama] = useState({ available: false })
  const [tab, setTab] = useState('llm_judge')

  useEffect(() => {
    Promise.all([
      api.get('/detectors').then(r => r.data).catch(() => []),
      api.get('/ollama/models').then(r => r.data).catch(() => []),
      api.get('/ollama/status').then(r => r.data).catch(() => ({ available: false })),
    ]).then(([d, m, o]) => {
      setDetectors(d)
      setModels(m)
      setOllama(o)
      if (d.length) setTab(d[0].name)
    })
  }, [])

  const selected = detectors.find(d => d.name === tab) || detectors[0]

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="row gap-sm mb-sm"><span className="numeral">III.</span><span className="smallcaps">Méthodes</span></div>
          <h1 className="page-title">Détecteurs</h1>
          <p className="page-sub">Méthodes classiques et LLM-as-a-judge utilisées dans les expériences.</p>
        </div>
      </div>

      <div className="grid-4" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 28, gap: 14 }}>
        {detectors.map(detector => (
          <div
            key={detector.name}
            className="card card-pad"
            style={{
              cursor: 'pointer',
              borderColor: tab === detector.name ? 'var(--terracotta)' : 'var(--line-2)',
              background: tab === detector.name ? 'var(--bg-elev)' : 'var(--bg-panel)',
            }}
            onClick={() => setTab(detector.name)}
          >
            <div className="between mb-sm">
              <span className={`pill ${detector.name === 'llm_judge' ? 'pill-info' : 'pill-mute'}`} style={{ fontSize: 10 }}>{detector.name === 'llm_judge' ? 'LLM' : 'classique'}</span>
              {detector.is_implemented ? <span className="pill pill-success" style={{ fontSize: 10 }}>prêt</span> : <span className="pill pill-warn" style={{ fontSize: 10 }}>WIP</span>}
            </div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 500, marginBottom: 4 }}>{labelDetector(detector.name)}</div>
            <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>{detector.description}</div>
          </div>
        ))}
      </div>

      <div className="meander mb-lg" />

      <div className="tabs">
        {detectors.map(detector => (
          <div key={detector.name} className={`tab${tab === detector.name ? ' active' : ''}`} onClick={() => setTab(detector.name)}>{labelDetector(detector.name)}</div>
        ))}
      </div>

      {selected?.name === 'llm_judge' && <LLMSettings models={models} ollama={ollama} />}
      {selected?.name === 'ulisse' && <UlisseSettings schema={selected.config_schema || {}} />}
      {selected?.name === 'pupa' && <PupaSettings />}
      {selected?.name === 'svm' && <SvmSettings />}
      {selected && !['llm_judge', 'ulisse', 'pupa', 'svm'].includes(selected.name) && <DetectorPlaceholder detector={selected} />}
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

function LLMSettings({ models, ollama }) {
  const defaultPrompt = `You are a strict Universal Dependencies (UD) annotation auditor for French.

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

  return (
    <div className="grid-2" style={{ gridTemplateColumns: '1.1fr 1fr', alignItems: 'flex-start' }}>
      <div className="col gap-lg">
        <div className="card card-pad">
          <div className="row gap-sm mb-md">
            <span className="numeral">i.</span>
            <h3 className="section-title" style={{ fontSize: 17 }}>Modèle Ollama</h3>
            <span style={{ flex: 1 }} />
            <span className={`pill ${ollama.available ? 'pill-success' : 'pill-danger'}`}><span className={`dot ${ollama.available ? 'dot-done' : 'dot-failed'}`} /> {ollama.base_url || 'http://localhost:11434'}</span>
          </div>
          <div className="card" style={{ overflow: 'hidden' }}>
            {models.map((model, index) => (
              <div key={model.name} className="between" style={{ padding: '11px 14px', borderBottom: '1px solid var(--line-3)', background: index === 0 ? 'var(--bg-elev)' : 'transparent' }}>
                <div className="row gap-md">
                  <input type="radio" checked={index === 0} readOnly />
                  <div>
                    <div className="mono" style={{ fontWeight: 500 }}>{model.name}</div>
                    <div className="muted-2" style={{ fontSize: 11, marginTop: 2 }}>{model.size ? `${(model.size / 1e9).toFixed(1)} GB` : '-'} · {model.modified_at?.slice(0, 10) || '-'}</div>
                  </div>
                </div>
                {index === 0 && <span className="pill pill-info" style={{ fontSize: 10 }}>par défaut</span>}
              </div>
            ))}
            {models.length === 0 && <div className="empty">Aucun modèle</div>}
          </div>
        </div>

        <div className="card card-pad">
          <div className="row gap-sm mb-md"><span className="numeral">ii.</span><h3 className="section-title" style={{ fontSize: 17 }}>Paramètres d'inférence</h3></div>
          <div className="grid-2" style={{ gap: 14 }}>
            <div><label className="label">Température</label><input className="input mono" defaultValue="0.1" /></div>
            <div><label className="label">Timeout (s)</label><input className="input mono" defaultValue="120" /></div>
            <div><label className="label">Requêtes parallèles</label><input className="input mono" defaultValue="1" /></div>
            <div><label className="label">Taille des batchs</label><input className="input mono" defaultValue="5" /></div>
          </div>
        </div>
      </div>

      <div className="col gap-lg">
        <div className="card card-pad">
          <div className="row gap-sm mb-md">
            <span className="numeral">iii.</span>
            <h3 className="section-title" style={{ fontSize: 17 }}>Prompt template</h3>
          </div>
          <textarea className="textarea" rows={16} defaultValue={defaultPrompt} />
          <div className="row gap-sm mt-md">
            <span className="pill pill-mute" style={{ fontSize: 10 }}>{'{sentence_text}'}</span>
            <span className="pill pill-mute" style={{ fontSize: 10 }}>{'{conllu_formatted}'}</span>
            <span className="pill pill-mute" style={{ fontSize: 10 }}>{'{num_tokens}'}</span>
            <span style={{ flex: 1 }} />
            <button className="btn btn-sm btn-accent"><Sparkles size={12} /> Tester</button>
          </div>
        </div>

        <div className="card card-pad">
          <div className="row gap-sm mb-md"><span className="numeral">iv.</span><h3 className="section-title" style={{ fontSize: 17 }}>Format attendu</h3></div>
          <div className="codeblock" style={{ fontSize: 11.5 }}>{`{
  "is_correct": boolean,
  "confidence": float,
  "suspect_tokens": [int],
  "explanation": string
}`}</div>
        </div>
      </div>
    </div>
  )
}

function UlisseSettings() {
  return (
    <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'flex-start' }}>
      <div className="col gap-lg">
        <div className="card card-pad">
          <div className="row gap-sm mb-md"><span className="numeral">i.</span><h3 className="section-title" style={{ fontSize: 17 }}>Paramètres principaux</h3></div>
          <label className="label">length_range</label>
          <input className="input mono" defaultValue="3" style={{ width: 120 }} />
          <label className="label mt-md">threshold_percentile</label>
          <div className="row gap-md"><input type="range" min={1} max={99} defaultValue={25} style={{ flex: 1 }} /><span className="mono" style={{ fontSize: 14, fontWeight: 600, color: 'var(--terracotta)', width: 50, textAlign: 'right' }}>25</span></div>
          <div className="row gap-sm mt-md">
            <input type="checkbox" id="arc" defaultChecked />
            <label htmlFor="arc" className="mono" style={{ fontSize: 12.5 }}>use_arc_lemma_feat</label>
          </div>
        </div>

        <div className="card card-pad">
          <div className="row gap-sm mb-md"><span className="numeral">ii.</span><h3 className="section-title" style={{ fontSize: 17 }}>Quality score</h3></div>
          <div className="muted" style={{ fontSize: 12, lineHeight: 1.55 }}>
            Score élevé : analyse fiable. Score faible : annotation suspecte.
          </div>
        </div>
      </div>

      <div className="card card-pad">
        <div className="row gap-sm mb-md"><span className="numeral">iii.</span><h3 className="section-title" style={{ fontSize: 17 }}>Features linguistiques</h3></div>
        {['tree_depth', 'avg_complement_depth', 'verbal_root_ratio', 'avg_verbal_arity', 'subordinate_ratio', 'avg_dependency_length', 'arc_pos_deprel'].map((feature, index) => (
          <div key={feature} className="row gap-md" style={{ padding: '9px 0', borderBottom: '1px solid var(--line-3)' }}>
            <span className="mono" style={{ fontSize: 11.5, color: 'var(--aegean)', width: 170 }}>{feature}</span>
            <div className="bar-track" style={{ flex: 1 }}><div className="bar-fill" style={{ width: `${35 + index * 8}%` }} /></div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PupaSettings() {
  return (
    <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'flex-start' }}>
      <div className="card card-pad">
        <div className="row gap-sm mb-md"><span className="numeral">i.</span><h3 className="section-title" style={{ fontSize: 17 }}>Paramètres</h3></div>
        <label className="label">threshold_percentile</label>
        <div className="row gap-md"><input type="range" min={1} max={99} defaultValue={15} style={{ flex: 1 }} /><span className="mono" style={{ fontSize: 14, fontWeight: 600, color: 'var(--terracotta)', width: 50, textAlign: 'right' }}>15</span></div>
        <label className="label mt-md">threshold_source</label>
        <select className="select" defaultValue="target"><option>target</option><option>reference</option></select>
        <label className="label mt-md">alpha</label>
        <input className="input mono" defaultValue="0.1" style={{ width: 120 }} />
      </div>

      <div className="card card-pad">
        <div className="row gap-sm mb-md"><span className="numeral">ii.</span><h3 className="section-title" style={{ fontSize: 17 }}>Adaptation UD</h3></div>
        <p className="muted" style={{ fontSize: 12, lineHeight: 1.55, marginTop: 0 }}>
          Baseline inspirée de PUPA, adaptée ici aux arbres de dépendances Universal Dependencies.
        </p>
        <div className="smallcaps mb-sm">Signaux utilisés</div>
        {['UPOS', 'DEPREL', 'gouverneur UPOS + DEPREL', 'distance de dépendance', 'racines', 'cycles et têtes invalides'].map(item => (
          <div key={item} className="row gap-md" style={{ padding: '10px 0', borderBottom: '1px solid var(--line-3)' }}>
            <span className="mono" style={{ fontSize: 12, color: 'var(--aegean)', width: 180 }}>{item}</span>
            <div className="muted" style={{ fontSize: 12 }}>cohérence locale</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SvmSettings() {
  return (
    <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'flex-start' }}>
      <div className="card card-pad">
        <div className="row gap-sm mb-md"><span className="numeral">i.</span><h3 className="section-title" style={{ fontSize: 17 }}>Entraînement</h3></div>
        <p className="muted" style={{ fontSize: 12, lineHeight: 1.55, marginTop: 0 }}>
          Baseline supervisée au niveau phrase, entraînée sur une référence propre et une copie avec erreurs injectées.
        </p>
        <label className="label">max_train_sentences</label>
        <input className="input mono" defaultValue="1000" style={{ width: 140 }} />
        <label className="label mt-md">C</label>
        <input className="input mono" defaultValue="0.5" style={{ width: 120 }} />
        <div className="row gap-sm mt-md">
          <input type="checkbox" id="svm-auto" defaultChecked />
          <label htmlFor="svm-auto" className="mono" style={{ fontSize: 12.5 }}>auto_threshold</label>
        </div>
      </div>

      <div className="card card-pad">
        <div className="row gap-sm mb-md"><span className="numeral">ii.</span><h3 className="section-title" style={{ fontSize: 17 }}>Features</h3></div>
        {['longueur', 'profondeur', 'distance moyenne', 'ratios UPOS', 'ratios DEPREL', 'score PUPA', 'anomalies structurelles'].map(item => (
          <div key={item} className="row gap-md" style={{ padding: '10px 0', borderBottom: '1px solid var(--line-3)' }}>
            <span className="mono" style={{ fontSize: 12, color: 'var(--aegean)', width: 170 }}>{item}</span>
            <div className="bar-track" style={{ flex: 1 }}><div className="bar-fill" style={{ width: '58%' }} /></div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DetectorPlaceholder({ detector }) {
  return (
    <div className="card card-pad empty">
      <div className="empty-mark">·</div>
      <div style={{ fontFamily: 'var(--serif)', fontSize: 22, marginBottom: 6 }}>{labelDetector(detector.name)} {detector.is_implemented ? '' : '— en cours d’implémentation'}</div>
      <div className="muted" style={{ maxWidth: 420, margin: '0 auto', fontSize: 13 }}>{detector.description}</div>
    </div>
  )
}

import { useState } from 'react'
import api from '../../api/client'

const DEFAULT_PROMPT = `Dependency parse correctness check.

Sentence: "{sentence_text}"

{conllu_formatted}

Is this dependency annotation correct? Check POS tags, HEAD and DEPREL.
Reply ONLY with valid JSON, no markdown, no explanation:
{"is_correct": true, "confidence": 0.9, "suspect_tokens": [], "explanation": "brief"}`

export default function PromptEditor({ value, onChange }) {
  const [testResult, setTestResult] = useState(null)
  const [testing, setTesting] = useState(false)

  const prompt = value || DEFAULT_PROMPT

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await api.post('/ollama/generate', {
        model: 'llama3',
        prompt: prompt
          .replace('{sentence_text}', 'Le chat mange la souris.')
          .replace('{conllu_formatted}', 'ID\tFORM\tUPOS\tHEAD\tDEPREL\n1\tLe\tDET\t2\tdet\n2\tchat\tNOUN\t3\tnsubj\n3\tmange\tVERB\t0\troot\n4\tla\tDET\t5\tdet\n5\tsouris\tNOUN\t3\tobj\n6\t.\tPUNCT\t3\tpunct')
          .replace('{num_tokens}', '6')
          .replace('{language}', 'français'),
        temperature: 0.1,
      })
      setTestResult(res.data.response)
    } catch (err) {
      setTestResult('Erreur : ' + (err.response?.data?.detail || err.message))
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-gray-500 mb-1">Template de prompt</label>
        <textarea
          value={prompt}
          onChange={e => onChange(e.target.value)}
          rows={10}
          className="w-full ui-input px-3 py-2 text-sm font-mono resize-y"
        />
      </div>
      <div className="text-xs text-gray-400">
        Variables : <code className="bg-gray-100 px-1 rounded">{'{sentence_text}'}</code>{' '}
        <code className="bg-gray-100 px-1 rounded">{'{conllu_formatted}'}</code>{' '}
        <code className="bg-gray-100 px-1 rounded">{'{num_tokens}'}</code>{' '}
        <code className="bg-gray-100 px-1 rounded">{'{language}'}</code>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleTest}
          disabled={testing}
          className="ui-button px-3 py-1.5 text-xs disabled:opacity-50"
        >
          {testing ? 'Test en cours...' : 'Tester'}
        </button>
        <button
          onClick={() => onChange(DEFAULT_PROMPT)}
          className="text-gray-500 px-3 py-1.5 text-xs hover:text-gray-700"
        >
          Réinitialiser
        </button>
      </div>
      {testResult && (
        <div className="ui-card-soft p-3">
          <p className="text-xs text-gray-500 mb-1">Réponse du LLM :</p>
          <pre className="text-xs whitespace-pre-wrap text-gray-800 max-h-40 overflow-y-auto">{testResult}</pre>
        </div>
      )}
    </div>
  )
}

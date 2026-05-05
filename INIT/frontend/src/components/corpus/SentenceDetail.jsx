import { useState, useEffect } from 'react'
import api from '../../api/client'
import { getPosColor } from '../../utils/conllu'
import DependencyTree from '../trees/DependencyTree'

export default function SentenceDetail({ corpusId, sentenceId }) {
  const [sentence, setSentence] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/corpus/${corpusId}/sentences/${sentenceId}`)
      .then(res => setSentence(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [corpusId, sentenceId])

  if (loading) return <div className="text-gray-500 text-center py-10">Chargement...</div>
  if (!sentence) return <div className="text-red-500 text-center py-10">Phrase non trouvée</div>

  return (
    <div className="space-y-6">
      <div className="ui-card p-5">
        <p className="text-sm text-gray-500 mb-1">Phrase</p>
        <p className="text-lg font-medium text-gray-900">{sentence.text}</p>
        <p className="text-xs text-gray-400 mt-1">{sentence.id}</p>
      </div>

      <div className="ui-card p-5 overflow-x-auto">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Tableau CoNLL-U</h4>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-200">
              {['ID', 'FORM', 'LEMMA', 'UPOS', 'XPOS', 'FEATS', 'HEAD', 'DEPREL', 'DEPS', 'MISC'].map(h => (
                <th key={h} className="px-3 py-2 font-medium text-xs">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sentence.tokens.map(t => (
              <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 font-mono">{t.id}</td>
                <td className="px-3 py-2 font-medium">{t.form}</td>
                <td className="px-3 py-2 text-gray-600">{t.lemma}</td>
                <td className="px-3 py-2">
                  <span
                    className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium text-white"
                    style={{ backgroundColor: getPosColor(t.upos) }}
                  >
                    {t.upos}
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-500">{t.xpos}</td>
                <td className="px-3 py-2 text-gray-500 text-xs max-w-[120px] truncate">{t.feats}</td>
                <td className="px-3 py-2 font-mono">{t.head}</td>
                <td className="px-3 py-2 font-medium text-blue-800">{t.deprel}</td>
                <td className="px-3 py-2 text-gray-500">{t.deps}</td>
                <td className="px-3 py-2 text-gray-500 text-xs max-w-[100px] truncate">{t.misc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ui-card p-5">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Arbre de dépendances</h4>
        <DependencyTree tokens={sentence.tokens} />
      </div>
    </div>
  )
}

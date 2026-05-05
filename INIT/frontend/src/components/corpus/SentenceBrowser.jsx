import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import api from '../../api/client'

export default function SentenceBrowser({ corpusId, onSelect }) {
  const [sentences, setSentences] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [perPage] = useState(50)
  const [filterDeprel, setFilterDeprel] = useState('')
  const [minLength, setMinLength] = useState('')
  const [maxLength, setMaxLength] = useState('')
  const [loading, setLoading] = useState(false)

  const load = () => {
    setLoading(true)
    const params = { page, per_page: perPage }
    if (filterDeprel) params.filter_deprel = filterDeprel
    if (minLength) params.min_length = parseInt(minLength)
    if (maxLength) params.max_length = parseInt(maxLength)
    api.get(`/corpus/${corpusId}/sentences`, { params })
      .then(res => {
        setSentences(res.data.sentences)
        setTotal(res.data.total)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [corpusId, page])

  const totalPages = Math.ceil(total / perPage)

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-end ui-card p-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Relation (deprel)</label>
          <input
            value={filterDeprel}
            onChange={e => setFilterDeprel(e.target.value)}
            placeholder="nsubj, obj..."
            className="ui-input px-3 py-1.5 text-sm w-32"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Long. min</label>
          <input
            type="number"
            value={minLength}
            onChange={e => setMinLength(e.target.value)}
            className="ui-input px-3 py-1.5 text-sm w-20"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Long. max</label>
          <input
            type="number"
            value={maxLength}
            onChange={e => setMaxLength(e.target.value)}
            className="ui-input px-3 py-1.5 text-sm w-20"
          />
        </div>
        <button
          onClick={() => { setPage(1); load() }}
          className="ui-button ui-button-primary px-4 py-1.5 text-sm"
        >
          Filtrer
        </button>
        <span className="text-sm text-gray-500 ml-auto">{total} phrases</span>
      </div>

      {loading ? (
        <div className="text-gray-500 text-center py-10">Chargement...</div>
      ) : (
        <div className="ui-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 font-medium w-48">ID</th>
                <th className="px-4 py-3 font-medium">Texte</th>
                <th className="px-4 py-3 font-medium text-right w-24">Tokens</th>
              </tr>
            </thead>
            <tbody>
              {sentences.map(s => (
                <tr
                  key={s.id}
                  onClick={() => onSelect(s.id)}
                  className="border-b border-gray-100 cursor-pointer hover:bg-blue-50 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{s.id}</td>
                  <td className="px-4 py-3 truncate max-w-lg">{s.text}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{s.num_tokens}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 rounded-2xl hover:bg-gray-100 disabled:opacity-30"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm text-gray-600">Page {page} / {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-2 rounded-2xl hover:bg-gray-100 disabled:opacity-30"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </div>
  )
}

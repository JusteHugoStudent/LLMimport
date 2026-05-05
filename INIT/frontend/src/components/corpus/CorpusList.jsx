import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, Trash2, Database } from 'lucide-react'
import api from '../../api/client'

export default function CorpusList() {
  const [corpora, setCorpora] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const load = () => {
    api.get('/corpus').then(res => setCorpora(res.data)).catch(() => {})
  }

  useEffect(() => { load() }, [])

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    const form = new FormData()
    form.append('file', file)
    try {
      await api.post('/corpus/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      load()
      setShowModal(false)
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de l\'upload')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Supprimer ce corpus ?')) return
    await api.delete(`/corpus/${id}`)
    load()
  }

  return (
    <div>
      <div className="mb-6 flex justify-end">
        <button
          onClick={() => setShowModal(true)}
          className="ui-button ui-button-primary whitespace-nowrap px-4 py-2 text-sm"
        >
          <Upload size={16} /> Importer
        </button>
      </div>

      {corpora.length === 0 ? (
        <div className="mx-auto flex max-w-sm flex-col items-center px-8 py-20 text-center text-[#6e6e73]">
          <Database size={40} className="mb-4 text-[#a1a1a6]" />
          <p className="ui-title text-xl">Aucun corpus</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {corpora.map(c => (
            <div
              key={c.id}
              onClick={() => navigate(`/corpus/${c.id}`)}
              className="ui-card p-5 cursor-pointer hover:border-[#7eb7f1] hover:shadow-sm transition-all"
            >
              <div className="flex justify-between items-start">
                <h4 className="font-semibold text-gray-900">{c.name}</h4>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(c.id) }}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="mt-3 flex gap-4 text-sm text-gray-500">
                <span>{c.num_sentences} phrases</span>
                <span>{c.num_tokens} tokens</span>
              </div>
              {c.created_at && (
                <p className="mt-2 text-xs text-gray-400">{c.created_at.slice(0, 19)}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1d1d1f]/35 p-6 backdrop-blur-sm">
          <div className="ui-card w-full max-w-md p-6">
            <h3 className="ui-title mb-4 text-lg">Importer un corpus</h3>
            <p className="text-sm text-gray-600 mb-4">
              Sélectionnez un fichier au format <code className="bg-gray-100 px-1 rounded">.conllu</code>
            </p>
            <input
              type="file"
              accept=".conllu"
              onChange={handleUpload}
              disabled={uploading}
              className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-full file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-800 hover:file:bg-blue-100"
            />
            {uploading && <p className="mt-3 text-sm text-[#0071e3]">Upload en cours...</p>}
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="ui-button px-4 py-2 text-sm"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

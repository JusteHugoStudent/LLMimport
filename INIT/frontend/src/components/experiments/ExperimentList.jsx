import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import api from '../../api/client'

const statusStyles = {
  pending: 'bg-gray-100 text-gray-700',
  running: 'bg-blue-100 text-blue-800',
  completed: 'bg-blue-100 text-blue-700',
  failed: 'bg-red-100 text-red-700',
}

export default function ExperimentList() {
  const [experiments, setExperiments] = useState([])
  const navigate = useNavigate()

  const load = () => {
    api.get('/experiments').then(res => setExperiments(res.data)).catch(() => {})
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (id) => {
    if (!confirm('Supprimer cette expérience ?')) return
    await api.delete(`/experiments/${id}`)
    load()
  }

  return (
    <div>
      <div className="mb-6 flex justify-end">
        <button
          onClick={() => navigate('/experiments/new')}
          className="ui-button ui-button-primary whitespace-nowrap px-4 py-2 text-sm"
        >
          <Plus size={16} /> Nouvelle
        </button>
      </div>

      {experiments.length === 0 ? (
        <div className="mx-auto max-w-sm px-8 py-20 text-center text-[#6e6e73]">
          <p className="ui-title text-xl">Aucune expérience</p>
        </div>
      ) : (
        <div className="ui-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5 bg-white/45 text-left text-[#6e6e73]">
                <th className="px-4 py-3 font-medium">Nom</th>
                <th className="px-4 py-3 font-medium">Corpus</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Progression</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {experiments.map(exp => (
                <tr
                  key={exp.id}
                  onClick={() => navigate(`/experiments/${exp.id}`)}
                  className="border-b border-gray-100 cursor-pointer hover:bg-blue-50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium">{exp.name}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{exp.corpus_id.slice(0, 8)}...</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusStyles[exp.status] || statusStyles.pending}`}>
                      {exp.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="w-24 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-[#0071e3] h-2 rounded-full transition-all"
                        style={{ width: `${(exp.progress || 0) * 100}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{exp.created_at?.slice(0, 19)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(exp.id) }}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

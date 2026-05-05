import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import api from '../../api/client'

export default function CorpusStats({ corpusId }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/corpus/${corpusId}/stats`)
      .then(res => setStats(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [corpusId])

  if (loading) return <div className="text-gray-500 text-center py-10">Chargement...</div>
  if (!stats) return <div className="text-red-500 text-center py-10">Erreur de chargement</div>

  const posData = Object.entries(stats.pos_distribution).map(([name, value]) => ({ name, value }))
  const deprelData = Object.entries(stats.deprel_distribution).map(([name, value]) => ({ name, value }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Phrases', value: stats.num_sentences },
          { label: 'Tokens', value: stats.num_tokens },
          { label: 'Long. moyenne', value: stats.length_stats.mean },
          { label: 'Prof. moyenne', value: stats.avg_tree_depth },
        ].map(({ label, value }) => (
          <div key={label} className="ui-card p-4">
            <p className="text-sm text-gray-500">{label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{typeof value === 'number' ? value.toLocaleString('fr-FR') : value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="ui-card p-5">
          <h4 className="text-sm font-semibold text-gray-700 mb-4">Distribution des POS tags</h4>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={posData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="ui-card p-5">
          <h4 className="text-sm font-semibold text-gray-700 mb-4">Distribution des relations</h4>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={deprelData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#f97316" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="ui-card p-5">
        <h4 className="text-sm font-semibold text-gray-700 mb-4">Top 10 combinaisons POS-DEPREL</h4>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-200">
              <th className="pb-2 font-medium">POS</th>
              <th className="pb-2 font-medium">DEPREL</th>
              <th className="pb-2 font-medium text-right">Count</th>
            </tr>
          </thead>
          <tbody>
            {stats.top_pos_deprel.map((row, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="py-2 font-medium">{row.pos}</td>
                <td className="py-2">{row.deprel}</td>
                <td className="py-2 text-right text-gray-600">{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

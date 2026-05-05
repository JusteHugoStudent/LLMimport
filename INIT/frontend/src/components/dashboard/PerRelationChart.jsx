import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { DETECTOR_COLORS } from '../../utils/metrics'

export default function PerRelationChart({ detectors }) {
  const allRelations = new Set()
  detectors.forEach(d => {
    Object.keys(d.perRelation || {}).forEach(r => allRelations.add(r))
  })

  const data = [...allRelations].map(rel => {
    const row = { relation: rel }
    detectors.forEach(d => {
      row[d.name] = d.perRelation?.[rel]?.f1 || 0
    })
    return row
  })

  if (data.length === 0) {
    return (
      <div className="ui-card p-5">
        <h4 className="text-sm font-semibold text-gray-700 mb-4">Performance par relation</h4>
        <p className="text-sm text-gray-500 text-center py-8">Aucune donnée par relation disponible.</p>
      </div>
    )
  }

  return (
    <div className="ui-card p-5">
      <h4 className="text-sm font-semibold text-gray-700 mb-4">Performance par relation (F1)</h4>
      <ResponsiveContainer width="100%" height={Math.max(300, data.length * 40)}>
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" domain={[0, 1]} tick={{ fontSize: 11 }} />
          <YAxis dataKey="relation" type="category" tick={{ fontSize: 11 }} width={100} />
          <Tooltip formatter={(v) => `${(v * 100).toFixed(1)}%`} />
          <Legend />
          {detectors.map((d, i) => (
            <Bar key={d.name} dataKey={d.name} fill={DETECTOR_COLORS[i % DETECTOR_COLORS.length]} radius={[0, 4, 4, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

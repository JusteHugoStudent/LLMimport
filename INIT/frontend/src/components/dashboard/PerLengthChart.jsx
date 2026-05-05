import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { DETECTOR_COLORS } from '../../utils/metrics'

const BUCKET_ORDER = ['1-5', '6-10', '11-15', '16-20', '21-30', '31+']

export default function PerLengthChart({ detectors }) {
  const allBuckets = new Set()
  detectors.forEach(d => {
    Object.keys(d.perLength || {}).forEach(b => allBuckets.add(b))
  })

  const data = BUCKET_ORDER.filter(b => allBuckets.has(b)).map(bucket => {
    const row = { bucket }
    detectors.forEach(d => {
      row[d.name] = d.perLength?.[bucket]?.f1 || 0
    })
    return row
  })

  if (data.length === 0) {
    return (
      <div className="ui-card p-5">
        <h4 className="text-sm font-semibold text-gray-700 mb-4">Performance par longueur</h4>
        <p className="text-sm text-gray-500 text-center py-8">Aucune donnée par longueur disponible.</p>
      </div>
    )
  }

  return (
    <div className="ui-card p-5">
      <h4 className="text-sm font-semibold text-gray-700 mb-4">Performance par longueur de phrase (F1)</h4>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
          <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v) => `${(v * 100).toFixed(1)}%`} />
          <Legend />
          {detectors.map((d, i) => (
            <Line
              key={d.name}
              type="monotone"
              dataKey={d.name}
              stroke={DETECTOR_COLORS[i % DETECTOR_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

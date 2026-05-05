import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts'
import { DETECTOR_COLORS } from '../../utils/metrics'

export default function ComparisonChart({ detectors }) {
  const barData = ['precision', 'recall', 'f1', 'accuracy'].map(metric => {
    const row = { metric: metric === 'f1' ? 'F1' : metric.charAt(0).toUpperCase() + metric.slice(1) }
    detectors.forEach(d => {
      row[d.name] = d.metrics[metric]
    })
    return row
  })

  const radarData = ['precision', 'recall', 'f1', 'accuracy'].map(metric => {
    const row = { metric: metric === 'f1' ? 'F1' : metric.charAt(0).toUpperCase() + metric.slice(1) }
    detectors.forEach(d => {
      row[d.name] = d.metrics[metric]
    })
    return row
  })

  return (
    <div className="space-y-6">
      <div className="ui-card p-5">
        <h4 className="text-sm font-semibold text-gray-700 mb-4">Comparaison (barres)</h4>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={barData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="metric" tick={{ fontSize: 12 }} />
            <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => `${(v * 100).toFixed(1)}%`} />
            <Legend />
            {detectors.map((d, i) => (
              <Bar key={d.name} dataKey={d.name} fill={DETECTOR_COLORS[i % DETECTOR_COLORS.length]} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="ui-card p-5">
        <h4 className="text-sm font-semibold text-gray-700 mb-4">Comparaison (radar)</h4>
        <ResponsiveContainer width="100%" height={350}>
          <RadarChart data={radarData}>
            <PolarGrid />
            <PolarAngleAxis dataKey="metric" tick={{ fontSize: 12 }} />
            <PolarRadiusAxis domain={[0, 1]} tick={{ fontSize: 10 }} />
            {detectors.map((d, i) => (
              <Radar
                key={d.name}
                name={d.name}
                dataKey={d.name}
                stroke={DETECTOR_COLORS[i % DETECTOR_COLORS.length]}
                fill={DETECTOR_COLORS[i % DETECTOR_COLORS.length]}
                fillOpacity={0.15}
              />
            ))}
            <Legend />
            <Tooltip formatter={(v) => `${(v * 100).toFixed(1)}%`} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

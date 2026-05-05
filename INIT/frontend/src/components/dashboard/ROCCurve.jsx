import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'
import { DETECTOR_COLORS } from '../../utils/metrics'

export default function ROCCurve({ detectors }) {
  // Merge all ROC points by FPR
  const allFprs = new Set()
  detectors.forEach(d => {
    (d.roc || []).forEach(pt => allFprs.add(pt.fpr))
  })
  allFprs.add(0)
  allFprs.add(1)

  const sortedFprs = [...allFprs].sort((a, b) => a - b)
  const data = sortedFprs.map(fpr => {
    const row = { fpr }
    detectors.forEach(d => {
      const points = d.roc || []
      const exact = points.find(p => p.fpr === fpr)
      if (exact) {
        row[d.name] = exact.tpr
      } else {
        // Interpolate
        let lower = null, upper = null
        for (const p of points) {
          if (p.fpr <= fpr) lower = p
          if (p.fpr >= fpr && !upper) upper = p
        }
        if (lower && upper && lower.fpr !== upper.fpr) {
          const ratio = (fpr - lower.fpr) / (upper.fpr - lower.fpr)
          row[d.name] = lower.tpr + ratio * (upper.tpr - lower.tpr)
        } else if (lower) {
          row[d.name] = lower.tpr
        }
      }
    })
    return row
  })

  return (
    <div className="ui-card p-5">
      <h4 className="text-sm font-semibold text-gray-700 mb-4">Courbes ROC</h4>
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="fpr"
            type="number"
            domain={[0, 1]}
            tick={{ fontSize: 11 }}
            label={{ value: 'FPR', position: 'bottom', offset: 0, style: { fontSize: 12 } }}
          />
          <YAxis
            domain={[0, 1]}
            tick={{ fontSize: 11 }}
            label={{ value: 'TPR', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
          />
          <Tooltip formatter={(v) => `${(v * 100).toFixed(1)}%`} />
          <Legend />
          <ReferenceLine
            segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]}
            stroke="#9ca3af"
            strokeDasharray="5 5"
          />
          {detectors.map((d, i) => (
            <Line
              key={d.name}
              type="monotone"
              dataKey={d.name}
              stroke={DETECTOR_COLORS[i % DETECTOR_COLORS.length]}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

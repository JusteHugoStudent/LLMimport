import { getMetricColor, getMetricBgColor, formatPercent } from '../../utils/metrics'

export default function MetricsCards({ detectors }) {
  const metricNames = ['precision', 'recall', 'f1', 'accuracy']

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${detectors.length}, 1fr)` }}>
      {detectors.map(det => (
        <div key={det.name} className="ui-card p-5">
          <h4 className="font-semibold text-sm text-gray-700 mb-3">{det.name}</h4>
          <div className="space-y-3">
            {metricNames.map(m => (
              <div key={m} className={`flex justify-between items-center px-3 py-2 rounded-2xl border ${getMetricBgColor(det.metrics[m])}`}>
                <span className="text-sm text-gray-600 capitalize">{m === 'f1' ? 'F1-Score' : m}</span>
                <span className={`text-lg font-bold ${getMetricColor(det.metrics[m])}`}>
                  {formatPercent(det.metrics[m])}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

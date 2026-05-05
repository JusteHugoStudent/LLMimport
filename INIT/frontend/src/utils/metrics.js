export function computeF1(precision, recall) {
  if (precision + recall === 0) return 0
  return 2 * precision * recall / (precision + recall)
}

export function getMetricColor(value) {
  if (value >= 0.8) return 'text-green-600'
  if (value >= 0.5) return 'text-amber-600'
  return 'text-red-600'
}

export function getMetricBgColor(value) {
  if (value >= 0.8) return 'bg-green-50 border-green-200'
  if (value >= 0.5) return 'bg-amber-50 border-amber-200'
  return 'bg-red-50 border-red-200'
}

export function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`
}

export const DETECTOR_COLORS = [
  '#3b82f6',
  '#ef4444',
  '#22c55e',
  '#f97316',
  '#a855f7',
]

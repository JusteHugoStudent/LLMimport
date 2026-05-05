export default function ConfusionMatrix({ detector, matrix }) {
  const { tp, fp, fn, tn } = matrix
  const total = tp + fp + fn + tn || 1

  const cells = [
    { label: 'VP', value: tp, row: 'Réel +', col: 'Prédit +' },
    { label: 'FP', value: fp, row: 'Réel -', col: 'Prédit +' },
    { label: 'FN', value: fn, row: 'Réel +', col: 'Prédit -' },
    { label: 'VN', value: tn, row: 'Réel -', col: 'Prédit -' },
  ]

  const getIntensity = (val) => {
    const ratio = val / total
    return Math.round(ratio * 255)
  }

  return (
    <div className="ui-card p-5">
      <h4 className="text-sm font-semibold text-gray-700 mb-4">Matrice de confusion — {detector}</h4>
      <div className="flex justify-center">
        <div>
          <div className="grid grid-cols-3 gap-1 text-center text-xs">
            <div />
            <div className="font-medium text-gray-500 py-2">Prédit +</div>
            <div className="font-medium text-gray-500 py-2">Prédit -</div>

            <div className="font-medium text-gray-500 px-2 flex items-center">Réel +</div>
            <div
              className="rounded-2xl p-4 text-white font-bold text-lg"
              style={{ backgroundColor: `rgba(34, 197, 94, ${tp / total + 0.1})` }}
            >
              {tp}
              <div className="text-xs font-normal opacity-80">VP</div>
            </div>
            <div
              className="rounded-2xl p-4 text-white font-bold text-lg"
              style={{ backgroundColor: `rgba(239, 68, 68, ${fn / total + 0.1})` }}
            >
              {fn}
              <div className="text-xs font-normal opacity-80">FN</div>
            </div>

            <div className="font-medium text-gray-500 px-2 flex items-center">Réel -</div>
            <div
              className="rounded-2xl p-4 text-white font-bold text-lg"
              style={{ backgroundColor: `rgba(239, 68, 68, ${fp / total + 0.1})` }}
            >
              {fp}
              <div className="text-xs font-normal opacity-80">FP</div>
            </div>
            <div
              className="rounded-2xl p-4 text-white font-bold text-lg"
              style={{ backgroundColor: `rgba(34, 197, 94, ${tn / total + 0.1})` }}
            >
              {tn}
              <div className="text-xs font-normal opacity-80">VN</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

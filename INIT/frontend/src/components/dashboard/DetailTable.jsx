import { useState } from 'react'

export default function DetailTable({ groundTruth, detectors }) {
  const [onlyDisagreements, setOnlyDisagreements] = useState(false)
  const detectorNames = Object.keys(detectors)

  const gtMap = {}
  groundTruth.forEach(g => { gtMap[g.sentence_id] = g })

  const detMaps = {}
  detectorNames.forEach(name => {
    detMaps[name] = {}
    ;(detectors[name] || []).forEach(d => { detMaps[name][d.sentence_id] = d })
  })

  const allIds = [...new Set(groundTruth.map(g => g.sentence_id))]

  let rows = allIds.map(sid => {
    const gt = gtMap[sid]
    const preds = {}
    detectorNames.forEach(name => {
      const det = detMaps[name][sid]
      preds[name] = det ? !det.is_correct : null
    })
    return { sid, hasError: gt?.has_error, preds }
  })

  if (onlyDisagreements) {
    rows = rows.filter(r => {
      const vals = Object.values(r.preds).filter(v => v !== null)
      return vals.length > 1 && !vals.every(v => v === vals[0])
    })
  }

  const displayRows = rows.slice(0, 200)

  return (
    <div className="ui-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-gray-700">Détails phrase par phrase</h4>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={onlyDisagreements}
            onChange={e => setOnlyDisagreements(e.target.checked)}
            className="rounded border-gray-300"
          />
          Désaccords uniquement
        </label>
      </div>
      <div className="overflow-x-auto max-h-96 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50">
            <tr className="text-left text-gray-500 border-b border-gray-200">
              <th className="px-3 py-2 font-medium">Phrase</th>
              <th className="px-3 py-2 font-medium text-center">Vérité</th>
              {detectorNames.map(n => (
                <th key={n} className="px-3 py-2 font-medium text-center">{n}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map(row => (
              <tr key={row.sid} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs text-gray-500 max-w-[200px] truncate">
                  {row.sid}
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                    row.hasError ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {row.hasError ? 'Erreur' : 'OK'}
                  </span>
                </td>
                {detectorNames.map(name => {
                  const pred = row.preds[name]
                  const isCorrectPred = pred === row.hasError
                  return (
                    <td key={name} className="px-3 py-2 text-center">
                      {pred === null ? (
                        <span className="text-gray-300">-</span>
                      ) : (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          isCorrectPred
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {pred ? 'Erreur' : 'OK'}
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-2">
        {rows.length} phrases affichées{rows.length > 200 ? ' (limité à 200)' : ''}
      </p>
    </div>
  )
}

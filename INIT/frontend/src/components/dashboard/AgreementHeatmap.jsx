export default function AgreementHeatmap({ agreement, detectors }) {
  const getAgreement = (d1, d2) => {
    if (d1 === d2) return 1.0
    const key1 = `${d1}_vs_${d2}`
    const key2 = `${d2}_vs_${d1}`
    return agreement[key1] ?? agreement[key2] ?? null
  }

  const getColor = (val) => {
    if (val === null) return '#f3f4f6'
    const green = Math.round(val * 200)
    return `rgb(${200 - green}, ${150 + green * 0.5}, ${200 - green})`
  }

  return (
    <div className="ui-card p-5">
      <h4 className="text-sm font-semibold text-gray-700 mb-4">Accord inter-méthodes</h4>
      <div className="flex justify-center overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr>
              <th className="p-2" />
              {detectors.map(d => (
                <th key={d} className="p-2 font-medium text-gray-600 text-center min-w-[80px]">{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {detectors.map(d1 => (
              <tr key={d1}>
                <td className="p-2 font-medium text-gray-600 text-right">{d1}</td>
                {detectors.map(d2 => {
                  const val = getAgreement(d1, d2)
                  return (
                    <td
                      key={d2}
                      className="p-2 text-center font-medium rounded"
                      style={{ backgroundColor: getColor(val) }}
                    >
                      {val !== null ? `${(val * 100).toFixed(0)}%` : '-'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

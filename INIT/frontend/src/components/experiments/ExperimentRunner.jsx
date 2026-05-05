import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/client'

export default function ExperimentRunner({ experimentId }) {
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('pending')
  const [currentStep, setCurrentStep] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    if (!experimentId) return

    const poll = setInterval(() => {
      api.get(`/experiments/${experimentId}/progress`)
        .then(res => {
          setProgress(res.data.progress)
          setStatus(res.data.status)
          setCurrentStep(res.data.current_step)
          if (res.data.status === 'completed' || res.data.status === 'failed') {
            clearInterval(poll)
          }
        })
        .catch(() => {})
    }, 2000)

    return () => clearInterval(poll)
  }, [experimentId])

  const pct = Math.round(progress * 100)

  return (
    <div className="ui-card p-6 max-w-xl mx-auto mt-8">
      <h4 className="font-semibold mb-4">Exécution de l'expérience</h4>

      <div className="mb-4">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-gray-600">{currentStep || 'Démarrage...'}</span>
          <span className="font-medium">{pct}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all duration-500 ${
              status === 'failed' ? 'bg-red-500' : status === 'completed' ? 'bg-blue-500' : 'bg-[#0071e3]'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className={`inline-flex w-2 h-2 rounded-full ${
          status === 'running' ? 'bg-blue-500 animate-pulse' :
          status === 'completed' ? 'bg-blue-500' :
          status === 'failed' ? 'bg-red-500' : 'bg-gray-400'
        }`} />
        <span className="text-gray-600 capitalize">{status}</span>
      </div>

      {status === 'completed' && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <button
            onClick={() => navigate('/dashboard')}
            className="ui-button ui-button-primary px-4 py-2 text-sm"
          >
            Voir les résultats
          </button>
        </div>
      )}

      {status === 'failed' && (
        <p className="mt-4 text-sm text-red-600">L'expérience a échoué. Vérifiez les logs du serveur.</p>
      )}
    </div>
  )
}

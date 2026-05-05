import { Navigate, Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout'
import HomePage from './pages/HomePage'
import CorpusPage from './pages/CorpusPage'
import ExperimentPage from './pages/ExperimentPage'
import DashboardPage from './pages/DashboardPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/corpus" element={<CorpusPage />} />
        <Route path="/corpus/:id" element={<CorpusPage />} />
        <Route path="/experiments" element={<ExperimentPage />} />
        <Route path="/experiments/new" element={<ExperimentPage />} />
        <Route path="/experiments/:id" element={<ExperimentPage />} />
        <Route path="/detectors" element={<Navigate to="/experiments/new" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </Layout>
  )
}

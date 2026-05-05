import { NavLink } from 'react-router-dom'
import {
  BarChart3,
  Database,
  FlaskConical,
  Home,
  Settings,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import api from '../../api/client'

const links = [
  { to: '/', label: 'Accueil', icon: Home, end: true, group: 'Atelier' },
  { to: '/corpus', label: 'Corpus', icon: Database },
  { to: '/experiments', label: 'Expériences', icon: FlaskConical },
  { to: '/dashboard', label: 'Résultats', icon: BarChart3 },
  { to: '/settings', label: 'Paramètres', icon: Settings, group: 'Système' },
]

export default function Sidebar({ open, setOpen }) {
  const [ollamaOk, setOllamaOk] = useState(false)

  useEffect(() => {
    api.get('/ollama/status').then(res => setOllamaOk(res.data.available)).catch(() => setOllamaOk(false))
  }, [])

  return (
    <aside className={`sidebar${open ? ' open' : ''}`}>
      <div className="side-logo" onClick={() => setOpen(!open)} title={open ? 'Replier' : 'Déplier'}>
        <div className="side-mark">H</div>
        {open && <div className="side-title">Homere</div>}
      </div>

      <div className="side-section">
        <div className="side-section-label">Atelier</div>
        {links.filter(l => l.group !== 'Système').map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `side-item${isActive ? ' active' : ''}`} title={!open ? label : ''}>
            <span className="side-icon"><Icon size={18} strokeWidth={1.6} /></span>
            {open && <span className="side-label-wrap">{label}</span>}
          </NavLink>
        ))}
      </div>

      <div className="side-section">
        <div className="side-section-label">Système</div>
        {links.filter(l => l.group === 'Système').map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `side-item${isActive ? ' active' : ''}`} title={!open ? label : ''}>
            <span className="side-icon"><Icon size={18} strokeWidth={1.6} /></span>
            {open && <span className="side-label-wrap">{label}</span>}
          </NavLink>
        ))}
      </div>

      <div className="side-foot">
        <div className="side-status">
          <span className={`dot ${ollamaOk ? 'dot-done' : 'dot-failed'}`} />
          {open && <span>Ollama · {ollamaOk ? 'actif' : 'arrêté'}</span>}
        </div>
        {open && <div style={{ fontSize: 10, color: 'var(--ink-4)', padding: '6px 8px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>v 1.0 · local</div>}
      </div>
    </aside>
  )
}

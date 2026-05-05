import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

const labels = {
  '/': 'Accueil',
  '/corpus': 'Corpus',
  '/experiments': 'Expériences',
  '/dashboard': 'Résultats',
  '/settings': 'Paramètres',
}

export default function Layout({ children }) {
  const location = useLocation()
  const [open, setOpen] = useState(true)
  const [theme, setTheme] = useState(() => localStorage.getItem('homere-theme') || 'light')
  const base = '/' + location.pathname.split('/')[1]
  const current = labels[base] || labels[location.pathname] || 'Homere'

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('homere-theme', theme)
  }, [theme])

  useEffect(() => {
    const syncTheme = event => {
      if (event.detail === 'light' || event.detail === 'dark') setTheme(event.detail)
    }

    window.addEventListener('homere-theme-change', syncTheme)
    return () => window.removeEventListener('homere-theme-change', syncTheme)
  }, [])

  return (
    <div className="app-shell">
      <Sidebar open={open} setOpen={setOpen} />
      <div className="main">
        <Header
          crumbs={['Homere', current]}
          theme={theme}
          onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        />
        <main className="scroll" data-screen-label={current}>
          {children}
        </main>
      </div>
    </div>
  )
}

import { Moon, Search, Sun } from 'lucide-react'

export default function Header({ crumbs, theme, onToggleTheme }) {
  return (
    <div className="topbar">
      <div className="crumbs">
        {crumbs.map((crumb, index) => (
          <span key={`${crumb}-${index}`} className={index === crumbs.length - 1 ? 'here' : ''}>
            {index > 0 && <span className="sep">·</span>} {crumb}
          </span>
        ))}
      </div>
      <div style={{ flex: 1 }} />
      <div className="row gap-md">
        <div className="topbar-search" style={{ position: 'relative', minWidth: 240 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--ink-3)' }} />
          <input className="input" placeholder="Rechercher..." style={{ paddingLeft: 30, height: 32, fontSize: 12.5 }} />
        </div>
        <button className="btn btn-ghost" onClick={onToggleTheme} title="Thème" style={{ padding: 7 }}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </div>
  )
}

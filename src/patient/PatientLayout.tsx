import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { line } from './copy'
import { currentTheme, setTheme, type Theme } from './theme'

export function PatientLayout({ children, hideHelp = false }: { children: ReactNode; hideHelp?: boolean }) {
  const [theme, setThemeState] = useState<Theme>(currentTheme())
  const toggle = () => {
    const t: Theme = theme === 'night' ? 'day' : 'night'
    setTheme(t)
    setThemeState(t)
  }

  return (
    <div className="p-shell">
      <header className="p-header">
        <span className="p-brand" aria-label="Aluna">
          <img src="/icon.svg" alt="" width={28} height={28} /> Aluna
        </span>
        <div className="p-header-actions">
          <button
            type="button"
            className="p-icon-btn"
            onClick={toggle}
            aria-label={theme === 'night' ? 'Switch to day mode' : 'Switch to night mode'}
            title={theme === 'night' ? 'Day mode' : 'Night mode'}
          >
            {theme === 'night' ? '☼' : '☾'}
          </button>
          {!hideHelp && (
            <Link to="/help" className="p-help-link" data-testid="help-link">
              Need help now?
            </Link>
          )}
        </div>
      </header>

      <main className="p-main">{children}</main>

      <footer className="p-footer">
        <p>{line('notEmergency')} In an emergency call 999.</p>
      </footer>
      <span className="synthetic-badge">SYNTHETIC DATA</span>
    </div>
  )
}

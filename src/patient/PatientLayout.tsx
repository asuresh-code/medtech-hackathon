import { useState, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { line } from './copy'
import { BookIcon, HomeIcon, LifebuoyIcon, MoonMark, NightIcon, SettingsIcon, SunIcon } from './Icons'
import { currentTheme, setTheme, type Theme } from './theme'

/** Standard screen: header + content + bottom tab bar. */
export function PatientLayout({ children, tabs = true }: { children: ReactNode; tabs?: boolean }) {
  const [theme, setThemeState] = useState<Theme>(currentTheme())
  const toggle = () => {
    const t: Theme = theme === 'night' ? 'day' : 'night'
    setTheme(t)
    setThemeState(t)
  }

  return (
    <div className={`p-shell ${tabs ? 'has-tabs' : ''}`}>
      <header className="p-header">
        <Link to="/" className="p-brand" aria-label="Aluna home">
          <MoonMark /> Aluna
        </Link>
        <div className="p-header-actions">
          <button
            type="button"
            className="p-icon-btn"
            onClick={toggle}
            aria-label={theme === 'night' ? 'Switch to day mode' : 'Switch to night mode'}
          >
            {theme === 'night' ? <SunIcon size={20} /> : <NightIcon size={20} />}
          </button>
          <Link to="/help" className="p-help-pill" data-testid="help-link">
            Need help now?
          </Link>
        </div>
      </header>

      <main className="p-main">{children}</main>
      <p className="p-footer-note">{line('notEmergency')} In an emergency call 999.</p>

      {tabs && <TabBar />}
      <span className="synthetic-badge">SYNTHETIC DATA</span>
    </div>
  )
}

function TabBar() {
  const tab = (to: string, label: string, icon: ReactNode, end = false) => (
    <NavLink to={to} end={end} className={({ isActive }) => `p-tab ${isActive ? 'active' : ''}`}>
      {icon}
      <span>{label}</span>
    </NavLink>
  )
  return (
    <nav className="p-tabs" aria-label="Main">
      <div className="p-tabs-inner">
        {tab('/', 'Today', <HomeIcon />, true)}
        {tab('/journal', 'Journal', <BookIcon />)}
        {tab('/help', 'Help', <LifebuoyIcon />)}
        {tab('/settings', 'Settings', <SettingsIcon />)}
      </div>
    </nav>
  )
}

/** Full-screen focus layout for the check-in (no tabs, minimal chrome). */
export function FocusLayout({ top, children, actions }: { top: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="p-focus">
      <div className="p-focus-top">{top}</div>
      <div className="p-focus-body">{children}</div>
      {actions && <div className="p-focus-actions">{actions}</div>}
      <span className="synthetic-badge">SYNTHETIC DATA</span>
    </div>
  )
}

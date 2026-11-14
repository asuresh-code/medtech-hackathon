// Day / night theme. Default follows the device; the toggle overrides it per device.
const KEY = 'aluna.theme'
export type Theme = 'day' | 'night'

export function systemTheme(): Theme {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'night' : 'day'
}

export function savedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'day' || v === 'night' ? v : null
  } catch {
    return null
  }
}

export function applyTheme(t: Theme | null): void {
  if (t) document.documentElement.dataset.theme = t
  else delete document.documentElement.dataset.theme
}

export function setTheme(t: Theme): void {
  try {
    localStorage.setItem(KEY, t)
  } catch {
    /* ignore */
  }
  applyTheme(t)
}

export function currentTheme(): Theme {
  return savedTheme() ?? systemTheme()
}

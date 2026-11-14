// Renders approved patient-facing lines from src/content/phrases.
// The app never generates patient text with an LLM — only these approved templates.

import phrases from '../content/phrases'

export type PhraseKey = keyof typeof phrases

export function fill(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`))
}

/** Deterministic pick so the same check-in always shows the same line (seeded by an id). */
export function pick(list: string[], seed: string): string {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return list[h % list.length]
}

export function line(key: PhraseKey, vars?: Record<string, string | number>, seed = ''): string {
  const v = phrases[key]
  if (Array.isArray(v)) return fill(pick(v as string[], seed), vars)
  if (typeof v === 'string') return fill(v, vars)
  throw new Error(`Phrase ${String(key)} is not text`)
}

/** "Thursday evening" style — no dates or numbers that could look like a score. */
export function friendlyWhen(iso: string, ref: Date): string {
  const d = new Date(iso)
  const day = d.toLocaleDateString('en-GB', { weekday: 'long' })
  const h = d.getHours()
  const part = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((startOf(d) - startOf(ref)) / 86_400_000)
  if (diffDays === 0) return `this ${part}`
  if (diffDays === 1) return `tomorrow ${part}`
  return `${day} ${part}`
}

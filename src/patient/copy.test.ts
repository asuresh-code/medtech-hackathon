import { describe, expect, it } from 'vitest'
import phrases from '../content/phrases.json'
import { fill, friendlyWhen, pick } from './copy'

// Guard the impersonal-voice + no-verdict rules on every approved patient-facing line.
const BANNED = [
  /\bI\b/, /\bI'm\b/i, /\bme\b/i, /\bmy\b/i, // Aluna is a tool, not a character
  /fine\b/i, /great/i, /well done/i, /nothing to worry/i, /good job/i, /proud/i,
  /score/i, /risk/i, /result/i, /depress/i, /anxiety/i, /\bflag/i, /threshold/i,
  /streak/i, /you missed/i, /miss you/i,
  /[\u{1F300}-\u{1FAFF}]/u, // emoji
]

function allLines(): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(phrases)) {
    if (k === 'rules' || k === 'status' || k === 'version') continue
    if (Array.isArray(v)) out.push(...v)
    else if (typeof v === 'string') out.push(v)
  }
  return out
}

describe('patient phrase library', () => {
  it.each(allLines())('obeys voice rules: %s', (text) => {
    for (const re of BANNED) expect(text, `matched ${re}`).not.toMatch(re)
  })

  it('fills templates and picks deterministically', () => {
    expect(fill('Hi {name}, {count} questions', { name: 'Sarah', count: 3 })).toBe('Hi Sarah, 3 questions')
    expect(pick(['a', 'b', 'c'], 'seed-1')).toBe(pick(['a', 'b', 'c'], 'seed-1'))
  })

  it('describes the next check-in without dates or numbers', () => {
    const ref = new Date('2026-11-16T09:00:00')
    expect(friendlyWhen('2026-11-16T20:00:00', ref)).toBe('this evening')
    expect(friendlyWhen('2026-11-17T08:00:00', ref)).toBe('tomorrow morning')
    expect(friendlyWhen('2026-11-19T20:00:00', ref)).toBe('Thursday evening')
  })
})

// Browser speech helpers. Speech-to-text and text-to-speech use the browser's Web Speech API —
// no LLM involved. Audio is never stored by Aluna; only the matched answer / transcript text.
// NB: some browsers send audio to the vendor's servers for recognition — demo uses synthetic speech only.

import type { EpdsOption } from '../shared/epds'

// ---------- text-to-speech ----------

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function speak(text: string): void {
  if (!canSpeak()) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-GB'
  u.rate = 0.95
  window.speechSynthesis.speak(u)
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel()
}

// ---------- speech-to-text ----------

interface RecognitionLike {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  continuous: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

type RecognitionCtor = new () => RecognitionLike

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function canListen(): boolean {
  return getRecognitionCtor() !== null
}

export interface ListenHandle {
  stop(): void
}

/**
 * Listen once. Calls onText with all alternatives (best first), or onError.
 * `continuous` keeps listening (used for the free-text note, up to ~1 minute).
 */
export function listen(opts: {
  onText: (alternatives: string[]) => void
  onError?: (error: string) => void
  onEnd?: () => void
  continuous?: boolean
}): ListenHandle | null {
  const Ctor = getRecognitionCtor()
  if (!Ctor) return null
  const r = new Ctor()
  r.lang = 'en-GB'
  r.interimResults = false
  r.maxAlternatives = 3
  r.continuous = Boolean(opts.continuous)
  const collected: string[] = []
  r.onresult = (e) => {
    const latest = e.results[e.results.length - 1]
    const alts = Array.from({ length: latest.length }, (_, i) => latest[i].transcript)
    if (opts.continuous) {
      collected.push(alts[0] ?? '')
      opts.onText([collected.join(' ').trim()])
    } else {
      opts.onText(alts)
    }
  }
  r.onerror = (e) => opts.onError?.(e.error)
  r.onend = () => opts.onEnd?.()
  r.start()
  return { stop: () => r.stop() }
}

// ---------- deterministic answer matching ----------

const ORDINALS: Record<string, number> = {
  one: 0, first: 0, '1': 0, a: 0,
  two: 1, second: 1, '2': 1, b: 1,
  three: 2, third: 2, '3': 2, c: 2,
  four: 3, fourth: 3, last: 3, '4': 3, d: 3,
}

function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

const STOP = new Set(['i', 'the', 'a', 'to', 'of', 'as', 'have', 'been', 'so', 'it', 'is', 'um', 'erm', 'uh', 'like'])

export type SpokenIntent =
  | { kind: 'option'; index: number; heard: string }
  | { kind: 'change'; heard: string }
  | { kind: 'yes'; heard: string }
  | { kind: 'no'; heard: string }
  | { kind: 'unknown'; heard: string }

/**
 * Map what was heard to one of the 4 printed options. Pure and deterministic:
 * exact phrase match → option number ("option two", "the third one") → best word overlap.
 * Returns 'unknown' unless one option clearly wins, so we never guess.
 */
export function matchSpokenAnswer(alternatives: string[], options: EpdsOption[]): SpokenIntent {
  const heard = (alternatives[0] ?? '').trim()
  for (const alt of alternatives) {
    const w = words(alt)
    const joined = w.join(' ')
    if (!joined) continue

    if (/^(change|go back|back|undo|redo)( it| that)?$/.test(joined)) return { kind: 'change', heard: alt }
    if (/^(yes|yeah|yep|correct|that's right|thats right|confirm)$/.test(joined)) return { kind: 'yes', heard: alt }
    if (/^(no|nope|wrong|not that)$/.test(joined)) return { kind: 'no', heard: alt }

    // 1. Exact option text (ignoring punctuation)
    const exact = options.findIndex((o) => words(o.label).join(' ') === joined)
    if (exact >= 0) return { kind: 'option', index: exact, heard: alt }

    // 2. "option two" / "number 3" / "the first one" / just "two"
    let ord = w.filter((x) => x in ORDINALS && !(x === 'a' && w.length > 1))
    if (ord.length > 1) ord = ord.filter((x) => x !== 'one') // "the third one"
    if (ord.length === 1 && (w.length <= 3 || /option|number|one$/.test(joined))) {
      return { kind: 'option', index: ORDINALS[ord[0]], heard: alt }
    }

    // 3. Word overlap — must clearly beat the runner-up
    const hw = new Set(w.filter((x) => !STOP.has(x)))
    const scores = options.map((o) => {
      const ow = words(o.label).filter((x) => !STOP.has(x))
      const hits = ow.filter((x) => hw.has(x)).length
      return ow.length ? hits / ow.length : 0
    })
    const ranked = scores.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s)
    if (ranked[0].s >= 0.6 && ranked[0].s - ranked[1].s >= 0.25) {
      return { kind: 'option', index: ranked[0].i, heard: alt }
    }
  }
  return { kind: 'unknown', heard }
}

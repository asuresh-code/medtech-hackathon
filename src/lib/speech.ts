// Speech for the patient app. No LLM involved.
//  • Output: pre-generated natural voice clips (public/voice/, built by scripts/generate-voice.ts from the
//    fixed approved lines) → falls back to the best built-in phone voice.
//  • Input: the browser's speech recognition; answers are matched to the printed options deterministically.
// Audio of her voice is never stored by Aluna. NB some browsers send mic audio to the vendor for recognition —
// the demo uses synthetic speech only.

import type { EpdsOption } from '../shared/epds'

// ======================= OUTPUT =======================

interface VoiceManifest {
  voice: string
  clips: Record<string, string> // normalised text -> file name
}

let manifest: VoiceManifest | null = null
let manifestLoad: Promise<void> | null = null
let audioEl: HTMLAudioElement | null = null
let muted = false

export function clipKey(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase()
}

function loadManifest(): Promise<void> {
  if (!manifestLoad) {
    manifestLoad = fetch('/voice/manifest.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((m: VoiceManifest | null) => {
        manifest = m
      })
      .catch(() => {
        manifest = null
      })
  }
  return manifestLoad
}

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && ('speechSynthesis' in window || typeof Audio !== 'undefined')
}

/** Call inside a tap handler (iOS needs a user gesture before later audio can play automatically). */
export function unlockAudio(): void {
  if (typeof window === 'undefined') return
  void loadManifest()
  if (!audioEl) audioEl = new Audio()
  audioEl.src = silentWav()
  audioEl.play().catch(() => {})
  if ('speechSynthesis' in window) window.speechSynthesis.getVoices()
}

/** 50 ms of silence as a valid WAV data URI (used to unlock audio on iOS). */
function silentWav(): string {
  const rate = 8000
  const n = rate / 20
  const buf = new Uint8Array(44 + n)
  const dv = new DataView(buf.buffer)
  const str = (o: number, t: string) => [...t].forEach((c, i) => (buf[o + i] = c.charCodeAt(0)))
  str(0, 'RIFF'); dv.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt ')
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true)
  dv.setUint32(24, rate, true); dv.setUint32(28, rate, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true)
  str(36, 'data'); dv.setUint32(40, n, true); buf.fill(128, 44)
  let bin = ''
  buf.forEach((b) => (bin += String.fromCharCode(b)))
  return `data:audio/wav;base64,${btoa(bin)}`
}

export function setMuted(m: boolean): void {
  muted = m
  if (m) stopSpeaking()
}

export function stopSpeaking(): void {
  if (typeof window === 'undefined') return
  if (audioEl) {
    audioEl.pause()
    audioEl.onended = null
  }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
}

/** Rank built-in voices: British English first, then neural/natural/enhanced voices. */
export function rankVoice(v: { name: string; lang: string; localService?: boolean }): number {
  let s = 0
  const lang = v.lang.toLowerCase()
  if (lang === 'en-gb') s += 50
  else if (lang.startsWith('en')) s += 20
  else return -100
  if (/natural|neural|premium|enhanced|online/i.test(v.name)) s += 40
  if (/google uk english female|sonia|libby|serena|kate|martha|stephanie/i.test(v.name)) s += 25
  if (/female/i.test(v.name)) s += 5
  if (/compact|espeak|novelty|whisper|bad news|bells|boing|bubbles|cellos|zarvox|trinoids|albert|fred|junior|ralph/i.test(v.name)) s -= 80
  return s
}

function bestVoice(): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) return null
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null
  return [...voices].sort((a, b) => rankVoice(b) - rankVoice(a))[0] ?? null
}

function speakBuiltIn(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve()
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    const v = bestVoice()
    if (v) u.voice = v
    u.lang = v?.lang ?? 'en-GB'
    u.rate = 0.92
    u.pitch = 1.0
    u.onend = () => resolve()
    u.onerror = () => resolve()
    window.speechSynthesis.speak(u)
  })
}

function playClip(file: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!audioEl) audioEl = new Audio()
    audioEl.onended = () => resolve(true)
    audioEl.onerror = () => resolve(false)
    audioEl.src = `/voice/${file}`
    audioEl.play().catch(() => resolve(false))
  })
}

/** Speak one line and resolve when finished. Uses the natural pre-generated clip when one exists. */
export async function speak(text: string): Promise<void> {
  if (muted || !text.trim() || typeof window === 'undefined') return
  stopSpeaking()
  await loadManifest()
  const file = manifest?.clips[clipKey(text)]
  if (file && (await playClip(file))) return
  await speakBuiltIn(text)
}

/** Speak several lines in order. */
export async function speakAll(lines: string[]): Promise<void> {
  for (const l of lines) {
    if (muted) return
    await speak(l)
  }
}

// ======================= INPUT =======================

interface RecognitionLike {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  continuous: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }> }) => void) | null
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
 * Listen. Calls onText with alternatives (best first). In `continuous` mode onText gets the
 * whole transcript so far as a single string.
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
  try {
    r.start()
  } catch {
    return null
  }
  return { stop: () => r.stop() }
}

/** Promise form: listen once, resolve with alternatives ([] on silence/error/timeout). */
export function listenOnce(timeoutMs = 8000): { promise: Promise<string[]>; cancel: () => void } {
  let handle: ListenHandle | null = null
  let done = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const promise = new Promise<string[]>((resolve) => {
    const finish = (alts: string[]) => {
      if (done) return
      done = true
      if (timer) clearTimeout(timer)
      handle?.stop()
      resolve(alts)
    }
    handle = listen({ onText: finish, onError: () => finish([]), onEnd: () => finish([]) })
    if (!handle) finish([])
    timer = setTimeout(() => finish([]), timeoutMs)
  })
  return {
    promise,
    cancel: () => {
      done = true
      if (timer) clearTimeout(timer)
      handle?.stop()
    },
  }
}

// ================= deterministic answer matching =================

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
  | { kind: 'repeat'; heard: string }
  | { kind: 'stop'; heard: string }
  | { kind: 'unknown'; heard: string }

/**
 * Map what was heard to one of the 4 printed options, or a command. Pure and deterministic:
 * command → exact option text → option number ("option two") → clear word overlap.
 * Returns 'unknown' unless one option clearly wins, so we never guess.
 */
export function matchSpokenAnswer(alternatives: string[], options: EpdsOption[]): SpokenIntent {
  const heard = (alternatives[0] ?? '').trim()
  for (const alt of alternatives) {
    const w = words(alt)
    const joined = w.join(' ')
    if (!joined) continue

    if (/^(change|go back|back|undo|redo)( it| that| my answer)?$/.test(joined)) return { kind: 'change', heard: alt }
    if (/^(yes|yeah|yep|yes please|correct|that's right|thats right|right|confirm|next|okay|ok)$/.test(joined))
      return { kind: 'yes', heard: alt }
    if (/^(no|nope|wrong|not that)$/.test(joined)) return { kind: 'no', heard: alt }
    if (/^(repeat|say (that|it) again|again|what|pardon|sorry)$/.test(joined)) return { kind: 'repeat', heard: alt }
    if (/^(stop|cancel|quit|exit|later|not now)$/.test(joined)) return { kind: 'stop', heard: alt }

    if (!options.length) continue

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

/** For the spoken note: detect a trailing "finish"/"done" command and strip it. */
export function splitNoteCommand(transcript: string): { text: string; command: 'finish' | 'skip' | null } {
  const t = transcript.trim()
  if (/^(skip|no thanks|nothing|no)\.?$/i.test(t)) return { text: '', command: 'skip' }
  const m = t.match(/^(.*?)[\s,.]*(finish|finished|done|that's all|thats all|that is all)\.?$/i)
  if (m) return { text: m[1].trim(), command: 'finish' }
  return { text: t, command: null }
}

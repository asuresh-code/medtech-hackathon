// Aluna deterministic rules engine — implements docs/research/deterministic-rules.md.
// PURE: no I/O, no network, no SDKs, no wall-clock reads. `now` is always passed in. Same input → same output.

import { findSafetyPhrase } from '../shared/safety.js'
import type { FlagLevel, ItemNo } from '../shared/types.js'
import { ENGINE_CONFIG, type EngineConfig, type RuleId } from './config.js'

// ---------------- input / output types ----------------

export interface EngineAnswer {
  id: string
  checkin_id: string
  item_no: ItemNo | number
  value: number
  answered_at: string
}
export interface EngineCheckin {
  id: string
  scheduled_for: string
  completed_at: string | null
  note_text: string | null
}
export interface EngineAttendance {
  session_date: string // YYYY-MM-DD
  attended: boolean
}
export interface EngineFlag {
  rule_id: string
  level: FlagLevel
  status: 'open' | 'closed'
  created_at: string
  closed_at?: string | null
  evidence_id?: string | null
  trigger_value?: number | null
}
export interface EngineInput {
  now: string
  answers: EngineAnswer[]
  checkins: EngineCheckin[]
  attendance: EngineAttendance[]
  flags: EngineFlag[]
}

export interface Fired {
  rule_id: RuleId
  level: FlagLevel
  owner: 'gp' | 'hv'
  due_at: string
  reason: string
  evidence_id: string | null
  trigger_value: number | null
}

export interface Evaluation {
  fired: Fired[]
  top: Fired | null
  /** Flags to create after de-duplication / re-flag rules (§3). Never closes anything. */
  toCreate: Fired[]
  baseline: { total: number; items: Record<number, number>; at: string } | null
  window: { complete: boolean; itemsPresent: number; total: number | null; partialSum: number }
  rule_version: string
}

const LEVEL_RANK: Record<FlagLevel, number> = { urgent: 3, review: 2, drift: 1 }
const H = 3_600_000
const D = 24 * H

// ---------------- time helpers ----------------

function ms(iso: string): number {
  return new Date(iso).getTime()
}

/** Weekday (0=Sun..6=Sat) in Europe/London for a timestamp. */
function londonWeekday(t: number): number {
  const wd = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'Europe/London' }).format(new Date(t))
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd)
}

export function addWorkingDays(fromMs: number, days: number): number {
  let t = fromMs
  let left = days
  while (left > 0) {
    t += D
    const wd = londonWeekday(t)
    if (wd !== 0 && wd !== 6) left--
  }
  return t
}

function dueFrom(nowMs: number, due: { hours?: number; workingDays?: number }): string {
  if (due.hours !== undefined) return new Date(nowMs + due.hours * H).toISOString()
  return new Date(addWorkingDays(nowMs, due.workingDays ?? 0)).toISOString()
}

// ---------------- window + baseline ----------------

/** Latest answer per item with  t − window < answered_at ≤ t  (future timestamps clamped to t). */
export function latestPerItem(answers: EngineAnswer[], tMs: number, windowMs: number): Map<number, EngineAnswer> {
  const out = new Map<number, EngineAnswer>()
  for (const a of answers) {
    const at = Math.min(ms(a.answered_at), tMs)
    if (!(at > tMs - windowMs && at <= tMs)) continue
    const prev = out.get(a.item_no)
    if (!prev || Math.min(ms(prev.answered_at), tMs) < at || (Math.min(ms(prev.answered_at), tMs) === at && prev.id < a.id)) {
      out.set(a.item_no, a)
    }
  }
  return out
}

export function computeBaseline(answers: EngineAnswer[], nowMs: number, windowMs: number) {
  const times = [...new Set(answers.map((a) => Math.min(ms(a.answered_at), nowMs)))].filter((t) => t <= nowMs).sort((a, b) => a - b)
  for (const t of times) {
    const w = latestPerItem(answers, t, windowMs)
    if (w.size === 10) {
      const items: Record<number, number> = {}
      let total = 0
      for (const [k, a] of w) {
        items[k] = a.value
        total += a.value
      }
      return { total, items, at: new Date(t).toISOString() }
    }
  }
  return null
}

// ---------------- evaluate ----------------

export function evaluate(input: EngineInput, cfg: EngineConfig = ENGINE_CONFIG): Evaluation {
  const nowMs = ms(input.now)
  const windowMs = cfg.windowHours.value * H
  const R = cfg.rules
  const fired: Fired[] = []
  const fire = (rule_id: RuleId, reason: string, evidence_id: string | null = null, trigger_value: number | null = null) => {
    const r = R[rule_id]
    fired.push({
      rule_id,
      level: r.level as FlagLevel,
      owner: r.owner as 'gp' | 'hv',
      due_at: dueFrom(nowMs, r.due as { hours?: number; workingDays?: number }),
      reason,
      evidence_id,
      trigger_value,
    })
  }

  const answers = input.answers.filter((a) => Math.min(ms(a.answered_at), nowMs) <= nowMs)
  const w = latestPerItem(answers, nowMs, windowMs)
  const complete = w.size === 10
  const partialSum = [...w.values()].reduce((s, a) => s + a.value, 0)
  const total = complete ? partialSum : null
  const baseline = computeBaseline(answers, nowMs, windowMs)
  const baselineIsThisWindow = baseline !== null && ms(baseline.at) > nowMs - windowMs

  const usedEvidence = (rule: string) => new Set(input.flags.filter((f) => f.rule_id === rule && f.evidence_id).map((f) => f.evidence_id))

  // U1 — any positive item-10 answer not already flagged. NOT window-bound (incl. abandoned check-ins).
  if (R.U1.enabled) {
    const used = usedEvidence('U1')
    for (const a of [...answers].sort((x, y) => ms(x.answered_at) - ms(y.answered_at) || x.id.localeCompare(y.id))) {
      if (a.item_no === 10 && a.value >= R.U1.item10Min && !used.has(a.id)) {
        fire('U1', `U1: answered "${a.value === 3 ? 'Yes, quite often' : a.value === 2 ? 'Sometimes' : 'Hardly ever'}" to item 10 (self-harm)`, a.id, a.value)
      }
    }
  }

  // U2 — safety phrase in a note, per check-in not already flagged.
  if (R.U2.enabled) {
    const used = usedEvidence('U2')
    for (const c of [...input.checkins].sort((x, y) => ms(x.scheduled_for) - ms(y.scheduled_for) || x.id.localeCompare(y.id))) {
      if (!c.note_text || used.has(c.id)) continue
      if (c.completed_at && ms(c.completed_at) > nowMs) continue
      const p = findSafetyPhrase(c.note_text)
      if (p) fire('U2', `U2: note contains a safety phrase ("${p}")`, c.id, null)
    }
  }

  // R1 / R2 — total ≥ 13 (complete) or partial lower bound ≥ 13.
  if (R.R1.enabled && complete && total! >= R.R1.totalMin) fire('R1', `R1: EPDS ${total} (≥${R.R1.totalMin}) over the last 7 days`, null, total)
  if (R.R2.enabled && !complete && w.size > 0 && partialSum >= R.R2.partialSumMin)
    fire('R2', `R2: ${partialSum} from ${w.size}/10 items already ≥${R.R2.partialSumMin}`, null, partialSum)

  // R3 — EPDS-3A anxiety subscale (off by default).
  if (R.R3.enabled) {
    const sub = R.R3.items.reduce((s, i) => s + (w.get(i)?.value ?? 0), 0)
    if (sub >= R.R3.subscaleMin) fire('R3', `R3: anxiety items 3–5 sum ${sub} (≥${R.R3.subscaleMin})`, null, sub)
  }

  // D1 — reliable rise from her own baseline.
  if (R.D1.enabled && baseline && complete && total! >= baseline.total + R.D1.riseMin)
    fire('D1', `D1: EPDS ${total}, up ${total! - baseline.total} from her baseline ${baseline.total}`, null, total)

  // D4 — entered the 10–12 "monitor" band.
  if (R.D4.enabled && complete && total! >= R.D4.bandMin && total! <= R.D4.bandMax && baseline && (baseline.total <= R.D4.baselineMax || baselineIsThisWindow))
    fire('D4', `D4: EPDS ${total} — in the 10–12 monitor band${baselineIsThisWindow ? ' at first full week' : ` (baseline ${baseline.total})`}`, null, total)

  // Missed check-ins (resolved = completed or ≥24 h overdue).
  const missedAfter = cfg.missedAfterHours.value * H
  const isMissed = (c: EngineCheckin) => !c.completed_at && nowMs >= ms(c.scheduled_for) + missedAfter
  const lookback = cfg.lookbackDays.value * D

  // D2 — (missed check-ins + missed classes in 14 days) ≥ 2 AND item-matched rise ≥ 1.
  if (R.D2.enabled && baseline) {
    const missedCheckins = input.checkins.filter((c) => isMissed(c) && ms(c.scheduled_for) >= nowMs - lookback).length
    const missedClasses = input.attendance.filter((a) => {
      if (a.attended) return false
      const t = ms(`${a.session_date}T12:00:00Z`)
      return t <= nowMs && t >= nowMs - lookback
    }).length
    let rise = 0
    for (const [item, a] of w) rise += a.value - (baseline.items[item] ?? 0)
    if (missedCheckins + missedClasses >= R.D2.missedMin && rise >= R.D2.itemRiseMin)
      fire('D2', `D2: ${missedCheckins} missed check-in(s) + ${missedClasses} missed class(es) in 14 days, answers up ${rise} vs baseline`, null, rise)
  }

  // D3 — the 3 most recent resolved check-ins all missed (silence → reach out; not a risk signal).
  if (R.D3.enabled) {
    const resolved = input.checkins
      .filter((c) => (c.completed_at && ms(c.completed_at) <= nowMs) || isMissed(c))
      .sort((a, b) => ms(b.scheduled_for) - ms(a.scheduled_for))
      .slice(0, R.D3.consecutiveMissed)
    if (resolved.length === R.D3.consecutiveMissed && resolved.every(isMissed))
      fire('D3', `D3: last ${R.D3.consecutiveMissed} check-ins not answered — reach out`, null, R.D3.consecutiveMissed)
  }

  // ---------- precedence ----------
  const order = cfg.priority as readonly string[]
  const byPriority = (a: Fired, b: Fired) =>
    LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || order.indexOf(a.rule_id) - order.indexOf(b.rule_id)
  fired.sort(byPriority)
  const top = fired[0] ?? null

  // ---------- de-duplication / re-flag (§3) ----------
  const toCreate: Fired[] = fired.filter((f) => f.level === 'urgent') // evidence-keyed, already de-duplicated
  const topNonUrgent = fired.find((f) => f.level !== 'urgent')
  if (topNonUrgent) {
    const openAtOrAbove = input.flags.some((f) => f.status === 'open' && LEVEL_RANK[f.level] >= LEVEL_RANK[topNonUrgent.level])
    const history = input.flags
      .filter((f) => f.rule_id === topNonUrgent.rule_id)
      .sort((a, b) => ms(b.created_at) - ms(a.created_at))
    const last = history[0]
    const reflagMs = cfg.reflagAfterClosedDays.value * D
    const armed =
      !last ||
      (last.status === 'closed' &&
        ((topNonUrgent.trigger_value ?? 0) > (last.trigger_value ?? 0) ||
          (last.closed_at != null && nowMs - ms(last.closed_at) >= reflagMs)))
    if (!openAtOrAbove && armed) toCreate.push(topNonUrgent)
  }

  return {
    fired,
    top,
    toCreate,
    baseline,
    window: { complete, itemsPresent: w.size, total, partialSum },
    rule_version: cfg.version,
  }
}

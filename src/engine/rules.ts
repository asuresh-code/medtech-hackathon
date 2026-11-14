// Deterministic flag rules. Pure: same (input, config, now) → same output. No LLM, no clock reads.
// Highest wins: U1 > U2 > R1 > D1 > D2 > D3.
import { findSafetyPhrase } from '../shared/safety.js'
import type { FlagLevel } from '../shared/types.js'
import type { EngineConfig } from './config.js'
import { DAY_MS, HOUR_MS, dueAfter } from './time.js'

export interface AnswerIn {
  item_no: number
  value: number
  answered_at: string
}
export interface CheckinIn {
  scheduled_for: string
  completed_at: string | null
  note_text: string | null
}
export interface AttendanceIn {
  session_date: string // YYYY-MM-DD
  attended: boolean
}
export interface EngineInput {
  woman: { gp_id: string; hv_id: string; baseline_total: number | null }
  answers: AnswerIn[]
  checkins: CheckinIn[]
  attendance: AttendanceIn[]
}
export interface EngineResult {
  level: FlagLevel
  rule_id: 'U1' | 'U2' | 'R1' | 'D1' | 'D2' | 'D3'
  reason: string
  owner_id: string
  due_at: string
  rule_version: string
  /** Time of the newest evidence behind this flag — lets callers avoid re-raising after a clinician closed it. */
  evidence_at: string
}

export interface WindowView {
  latest: Map<number, AnswerIn>
  total: number
  answered: number
  complete: boolean
}

/** Latest answer per EPDS item answered within [now - days, now]. */
export function rollingWindow(answers: readonly AnswerIn[], now: number, days: number): WindowView {
  const start = now - days * DAY_MS
  const latest = new Map<number, AnswerIn>()
  for (const a of answers) {
    const t = Date.parse(a.answered_at)
    if (!(t >= start && t <= now) || a.item_no < 1 || a.item_no > 10) continue
    const cur = latest.get(a.item_no)
    if (!cur || t > Date.parse(cur.answered_at) || (t === Date.parse(cur.answered_at) && a.value > cur.value)) latest.set(a.item_no, a)
  }
  let total = 0
  for (const a of latest.values()) total += a.value
  return { latest, total, answered: latest.size, complete: latest.size === 10 }
}

/** Baseline = total of her first complete 7-day window (evaluated at each answer time). */
export function computeBaseline(answers: readonly AnswerIn[], days: number): number | null {
  const times = [...new Set(answers.map((a) => Date.parse(a.answered_at)))].sort((x, y) => x - y)
  for (const t of times) {
    const w = rollingWindow(answers, t, days)
    if (w.complete) return w.total
  }
  return null
}

/** Missed = completed_at null and scheduled_for + grace <= now. Not-yet-due check-ins are excluded. */
export function missedStatus<T extends CheckinIn>(checkins: readonly T[], now: number, graceHours: number) {
  const due = checkins
    .filter((c) => Date.parse(c.scheduled_for) + graceHours * HOUR_MS <= now)
    .sort((a, b) => Date.parse(a.scheduled_for) - Date.parse(b.scheduled_for))
  let inARow = 0
  for (let i = due.length - 1; i >= 0 && due[i].completed_at === null; i--) inARow++
  return { due, inARow }
}

const latestIso = (xs: string[]) => xs.reduce((m, x) => (Date.parse(x) > Date.parse(m) ? x : m))

export function evaluate(input: EngineInput, config: EngineConfig, nowIso: string): EngineResult | null {
  const now = Date.parse(nowIso)
  const days = config.window_days.value
  const w = rollingWindow(input.answers, now, days)
  const baseline = input.woman.baseline_total ?? computeBaseline(input.answers, days)

  const make = (level: FlagLevel, rule_id: EngineResult['rule_id'], reason: string, evidence_at: string): EngineResult => ({
    level,
    rule_id,
    reason,
    owner_id: level === 'drift' ? input.woman.hv_id : input.woman.gp_id,
    due_at: dueAfter(now, config.due_working_days[level].value, config.same_day_end, config.working_day_end, config.bank_holidays),
    rule_version: config.version,
    evidence_at,
  })

  // U1 — item 10 positive in the window.
  const i10 = w.latest.get(10)
  if (i10 && i10.value >= config.item10_urgent_min.value) {
    return make('urgent', 'U1', `U1: EPDS item 10 (self-harm thoughts) answered above "Never" (score ${i10.value})`, i10.answered_at)
  }

  // U2 — safety phrase in a note on a check-in completed within the window.
  for (const c of [...input.checkins].sort((a, b) => Date.parse(b.completed_at ?? '0') - Date.parse(a.completed_at ?? '0'))) {
    if (!c.completed_at) continue
    const t = Date.parse(c.completed_at)
    if (t < now - days * DAY_MS || t > now) continue
    const phrase = findSafetyPhrase(c.note_text)
    if (phrase) return make('urgent', 'U2', `U2: her note contains a safety phrase ("${phrase}")`, c.completed_at)
  }

  const windowEvidence = w.answered ? latestIso([...w.latest.values()].map((a) => a.answered_at)) : nowIso

  // R1 — rolling total (partial counts).
  if (w.total >= config.review_total_min.value) {
    return make('review', 'R1', `R1: 7-day EPDS total ${w.total} (${w.answered}/10 items answered; threshold ${config.review_total_min.value})`, windowEvidence)
  }

  // D1 — complete window rise vs baseline.
  if (w.complete && baseline !== null && w.total >= baseline + config.drift_rise_min.value) {
    return make('drift', 'D1', `D1: 7-day EPDS total ${w.total} vs her baseline ${baseline} (+${w.total - baseline})`, windowEvidence)
  }

  // D2 — consecutive missed check-ins.
  const { due, inARow } = missedStatus(input.checkins, now, config.missed_grace_hours.value)
  if (inARow >= config.missed_in_a_row_min.value) {
    const last = due[due.length - 1].scheduled_for
    return make('drift', 'D2', `D2: ${inARow} check-ins missed in a row`, last)
  }

  // D3 — missed check-ins or classes in look-back AND any rise vs baseline.
  const since = now - config.lookback_days.value * DAY_MS
  const missedRecent = due.filter((c) => c.completed_at === null && Date.parse(c.scheduled_for) >= since)
  const missedClasses = input.attendance.filter((a) => {
    const t = Date.parse(`${a.session_date}T12:00:00Z`)
    return !a.attended && t >= since && t <= now
  })
  const rise = baseline !== null && w.answered > 0 && w.total > baseline
  if (rise && (missedRecent.length >= config.missed_any_min.value || missedClasses.length >= config.missed_classes_min.value)) {
    const evidence = latestIso([windowEvidence, ...missedRecent.map((c) => c.scheduled_for), ...missedClasses.map((a) => `${a.session_date}T12:00:00Z`)])
    return make(
      'drift',
      'D3',
      `D3: ${missedRecent.length} missed check-ins, ${missedClasses.length} missed classes; 7-day total ${w.total} vs baseline ${baseline}`,
      evidence,
    )
  }
  return null
}

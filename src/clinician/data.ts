// Clinician data helpers. Display-only: flags, levels, owners and due times come from the
// deterministic engine (server). Nothing here decides anything; the AI summary never sorts or filters.
import { supabase } from '../lib/supabase'
import type { CheckIn, DecisionKind, FlagLevel, ItemAnswer, Profile } from '../shared/types'

export const LEVEL_ORDER: Record<FlagLevel, number> = { urgent: 0, review: 1, drift: 2 }
export const WINDOW_HOURS = 168
export const MISSED_GRACE_HOURS = 24 // agreed with Dev A: missed = still incomplete 24 h after scheduled_for
const HOUR = 3_600_000

export const DECISIONS: { kind: DecisionKind; label: string; needsReason: boolean }[] = [
  { kind: 'contacted', label: 'Contacted', needsReason: false },
  { kind: 'gp_review', label: 'Book GP review', needsReason: false },
  { kind: 'hv_followup', label: 'Health visitor follow-up', needsReason: false },
  { kind: 'talking_therapies', label: 'Talking Therapies support', needsReason: false },
  { kind: 'secondary_referral', label: 'Refer to secondary care', needsReason: true },
  { kind: 'no_action', label: 'No action', needsReason: true },
]

export interface WomanLite {
  id: string
  first_name: string
  pseudonym: string
  baby_weeks: number
  gp_id: string
  hv_id: string
  baseline_total: number | null
  group_label: string | null
}

/** Latest answer per EPDS item answered within the last 168 h. No imputation. */
export function latestInWindow(answers: readonly ItemAnswer[], nowMs: number): Map<number, ItemAnswer> {
  const start = nowMs - WINDOW_HOURS * HOUR
  const latest = new Map<number, ItemAnswer>()
  for (const a of answers) {
    const t = Date.parse(a.answered_at)
    if (t < start || t > nowMs) continue
    const cur = latest.get(a.item_no)
    if (!cur || t > Date.parse(cur.answered_at)) latest.set(a.item_no, a)
  }
  return latest
}

export type CheckinStatus = 'completed' | 'missed' | 'pending'
export function checkinStatus(c: Pick<CheckIn, 'scheduled_for' | 'completed_at'>, nowMs: number): CheckinStatus {
  if (c.completed_at) return 'completed'
  return Date.parse(c.scheduled_for) + MISSED_GRACE_HOURS * HOUR <= nowMs ? 'missed' : 'pending'
}

export function ownerLabel(profiles: Record<string, Profile>, id: string | null, me: string): string {
  if (!id) return 'No owner'
  const p = profiles[id]
  const name = p ? `${p.first_name}${p.job_title ? ` (${p.job_title})` : ''}` : 'Unknown clinician'
  return id === me ? `${name} (you)` : name
}

const dtFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })
const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' })
export const fmtDateTime = (iso: string) => dtFmt.format(new Date(iso))
export const fmtDay = (iso: string) => dayFmt.format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso))

export async function loadProfiles(): Promise<Record<string, Profile>> {
  const { data } = await supabase.from('profiles').select('id, role, first_name, job_title')
  return Object.fromEntries((data ?? []).map((p) => [p.id as string, p as Profile]))
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  return { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` }
}

/** POST /api/sweep — re-runs silence rules for my patients. Not built yet: fail quietly. */
export async function runSweep(nowIso: string): Promise<void> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 6000)
  try {
    await fetch('/api/sweep', { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ now: nowIso }), signal: ctl.signal })
  } catch {
    /* missing or slow endpoint — the queue still loads */
  } finally {
    clearTimeout(timer)
  }
}

export const SUMMARY_UNAVAILABLE = 'Summary unavailable — see data'
/** POST /api/summary → { status: 'ok' | 'unavailable', text }. Anything else → unavailable. */
export async function fetchSummary(womanId: string): Promise<string> {
  try {
    const r = await fetch('/api/summary', { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ woman_id: womanId }) })
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('application/json')) return SUMMARY_UNAVAILABLE
    const j = (await r.json()) as { status?: string; text?: unknown }
    return j.status === 'ok' && typeof j.text === 'string' && j.text.trim() ? j.text : SUMMARY_UNAVAILABLE
  } catch {
    return SUMMARY_UNAVAILABLE
  }
}

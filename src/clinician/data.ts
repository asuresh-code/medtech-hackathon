// Clinician data access (RLS: a clinician only sees women they are named on).
import { supabase } from '../lib/supabase'
import { computeBaseline, latestPerItem, type EngineAnswer } from '../engine/rules'
import type { DecisionKind, FlagLevel } from '../shared/types'

export interface QueueRow {
  id: string
  woman_id: string
  level: FlagLevel
  rule_id: string
  reason: string
  rule_version: string
  owner_id: string | null
  due_at: string
  created_at: string
  woman: { first_name: string; pseudonym: string; baby_weeks: number }
}

export const LEVEL_RANK: Record<FlagLevel, number> = { urgent: 3, review: 2, drift: 1 }

export async function loadQueue() {
  const [{ data: flags }, { data: women }, { data: profiles }] = await Promise.all([
    supabase
      .from('flags')
      .select('id, woman_id, level, rule_id, reason, rule_version, owner_id, due_at, created_at, women!inner(first_name, pseudonym, baby_weeks)')
      .eq('status', 'open'),
    supabase.from('women').select('id, first_name, pseudonym, baby_weeks').order('first_name'),
    supabase.from('profiles').select('id, first_name, job_title'),
  ])
  const rows = ((flags ?? []) as unknown as (Omit<QueueRow, 'woman'> & { women: QueueRow['woman'] })[]).map((f) => ({
    ...f,
    woman: f.women,
  }))
  // Deterministic order: level, then due time. Never influenced by any AI output.
  rows.sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || a.due_at.localeCompare(b.due_at))
  const names = new Map((profiles ?? []).map((p) => [p.id, p.first_name as string]))
  return { rows: rows as QueueRow[], women: women ?? [], names }
}

export async function loadBrief(womanId: string) {
  const [w, ans, cis, att, flags, profiles] = await Promise.all([
    supabase.from('women').select('*').eq('id', womanId).single(),
    supabase.from('item_answers').select('id, checkin_id, item_no, value, answered_at').eq('woman_id', womanId).order('answered_at'),
    supabase.from('checkins').select('id, scheduled_for, completed_at, note_text, items').eq('woman_id', womanId).order('scheduled_for', { ascending: false }),
    supabase.from('attendance').select('session_date, attended').eq('woman_id', womanId).order('session_date', { ascending: false }),
    supabase.from('flags').select('*').eq('woman_id', womanId).order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, first_name, job_title'),
  ])
  return {
    woman: w.data,
    answers: (ans.data ?? []) as EngineAnswer[],
    checkins: cis.data ?? [],
    attendance: att.data ?? [],
    flags: flags.data ?? [],
    names: new Map((profiles.data ?? []).map((p) => [p.id, `${p.first_name}${p.job_title ? ` (${p.job_title})` : ''}`])),
  }
}

/** Weekly-window totals at each completed check-in (only when the window is complete). Same maths as the engine. */
export function trend(answers: EngineAnswer[], checkins: { completed_at: string | null }[]) {
  const W = 168 * 3_600_000
  const points: { at: string; total: number }[] = []
  for (const c of [...checkins].filter((c) => c.completed_at).sort((a, b) => a.completed_at!.localeCompare(b.completed_at!))) {
    const t = new Date(c.completed_at!).getTime() + 10 * 60_000
    const w = latestPerItem(answers, t, W)
    if (w.size === 10) points.push({ at: c.completed_at!, total: [...w.values()].reduce((s, a) => s + a.value, 0) })
  }
  const baseline = computeBaseline(answers, Date.now(), W)
  return { points, baseline: baseline?.total ?? null }
}

export async function recordDecision(opts: {
  womanId: string
  flagIds: string[]
  decision: DecisionKind
  reason: string | null
}) {
  const { data: u } = await supabase.auth.getUser()
  const clinician = u.user!.id
  for (const flagId of opts.flagIds) {
    const { error } = await supabase
      .from('decisions')
      .insert({ flag_id: flagId, woman_id: opts.womanId, clinician_id: clinician, decision: opts.decision, reason: opts.reason })
    if (error) throw error
    const upd = await supabase.from('flags').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', flagId)
    if (upd.error) await supabase.from('flags').update({ status: 'closed' }).eq('id', flagId) // closed_at column not migrated yet
  }
  await supabase.from('audit_log').insert({
    actor_id: clinician,
    woman_id: opts.womanId,
    event: 'decision.made',
    entity: 'flags',
    entity_id: opts.flagIds[0] ?? null,
    detail: { decision: opts.decision, reason: opts.reason, flags: opts.flagIds },
  })
}

export async function auditView(womanId: string) {
  const { data: u } = await supabase.auth.getUser()
  if (!u.user) return
  await supabase.from('audit_log').insert({ actor_id: u.user.id, woman_id: womanId, event: 'brief.viewed', entity: 'women', entity_id: womanId })
}

export async function createInvite(womanId: string): Promise<string | null> {
  const { data: u } = await supabase.auth.getUser()
  const code = String(Math.floor(100000 + Math.random() * 900000))
  const { error } = await supabase.from('invite_codes').insert({ code, woman_id: womanId, created_by: u.user?.id })
  return error ? null : code
}

export function relDue(iso: string, now = new Date()): { text: string; overdue: boolean } {
  const diff = new Date(iso).getTime() - now.getTime()
  const abs = Math.abs(diff)
  const h = Math.round(abs / 3_600_000)
  const d = Math.round(abs / 86_400_000)
  const span = h < 24 ? `${Math.max(h, 1)}h` : `${d}d`
  return diff < 0 ? { text: `overdue ${span}`, overdue: true } : { text: `due in ${span}`, overdue: false }
}

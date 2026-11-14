// Runs the deterministic engine for one woman and persists its output (flags + audit).
// The ONLY writer of flags. No LLM anywhere on this path.
import type { SupabaseClient } from '@supabase/supabase-js'
import { evaluate, type EngineFlag } from '../../src/engine/rules.js'

const GROUPS = [
  [1, 2, 3],
  [4, 5, 6, 10],
  [7, 8, 9],
]

export async function runEngineForWoman(admin: SupabaseClient, womanId: string, nowIso: string): Promise<number> {
  const [w, ans, cis, att] = await Promise.all([
    admin.from('women').select('id, gp_id, hv_id, baseline_total').eq('id', womanId).single(),
    admin.from('item_answers').select('id, checkin_id, item_no, value, answered_at').eq('woman_id', womanId),
    admin.from('checkins').select('id, scheduled_for, completed_at, note_text').eq('woman_id', womanId),
    admin.from('attendance').select('session_date, attended').eq('woman_id', womanId),
  ])
  if (!w.data) return 0
  // evidence_id / trigger_value / closed_at need migration 20261114160000; fall back if not applied yet.
  let flags = await admin
    .from('flags')
    .select('rule_id, level, status, created_at, closed_at, evidence_id, trigger_value')
    .eq('woman_id', womanId)
  const hasEvidenceCols = !flags.error
  if (flags.error) flags = (await admin.from('flags').select('rule_id, level, status, created_at').eq('woman_id', womanId)) as typeof flags

  const result = evaluate({
    now: nowIso,
    answers: ans.data ?? [],
    checkins: cis.data ?? [],
    attendance: att.data ?? [],
    flags: (flags.data ?? []) as EngineFlag[],
  })

  if (result.baseline && w.data.baseline_total == null) {
    await admin.from('women').update({ baseline_total: result.baseline.total }).eq('id', womanId)
  }

  let created = 0
  for (const f of result.toCreate) {
    const row: Record<string, unknown> = {
      woman_id: womanId,
      level: f.level,
      rule_id: f.rule_id,
      reason: f.reason,
      rule_version: result.rule_version,
      owner_id: f.owner === 'gp' ? w.data.gp_id : w.data.hv_id,
      due_at: f.due_at,
    }
    if (hasEvidenceCols) {
      row.evidence_id = f.evidence_id
      row.trigger_value = f.trigger_value
    }
    const { data: flag, error } = await admin.from('flags').insert(row).select('id').single()
    if (error) continue
    created++
    await admin.from('audit_log').insert({
      actor_id: null,
      woman_id: womanId,
      event: 'flag.created',
      entity: 'flags',
      entity_id: flag.id,
      detail: { rule_id: f.rule_id, fired: result.fired.map((x) => x.rule_id), evidence_id: f.evidence_id, rule_version: result.rule_version },
    })
  }
  return created
}

/** Ensure she has a pending check-in: next one 2 days on, at her chosen hour, rotating items so all 10 land each week. */
export async function scheduleNextIfNone(admin: SupabaseClient, womanId: string, nowIso: string) {
  const now = new Date(nowIso)
  const missedCut = new Date(now.getTime() - 24 * 3_600_000).toISOString()
  const { data: pending } = await admin
    .from('checkins')
    .select('id, scheduled_for')
    .eq('woman_id', womanId)
    .is('completed_at', null)
    .gt('scheduled_for', missedCut)
    .order('scheduled_for')
    .limit(1)
    .maybeSingle()
  if (pending) return pending

  const [{ data: last }, { data: woman }] = await Promise.all([
    admin.from('checkins').select('items').eq('woman_id', womanId).order('scheduled_for', { ascending: false }).limit(1).maybeSingle(),
    admin.from('women').select('reminder_hour, usual_hour').eq('id', womanId).single(),
  ])
  const idx = last ? GROUPS.findIndex((g) => g.join() === (last.items as number[]).join()) : -1
  const items = GROUPS[(idx + 1) % GROUPS.length]
  const when = new Date(now)
  when.setUTCDate(when.getUTCDate() + 2)
  when.setUTCHours(woman?.reminder_hour ?? woman?.usual_hour ?? 20, 0, 0, 0) // UK = UTC in winter (prototype)
  const { data: created } = await admin
    .from('checkins')
    .insert({ woman_id: womanId, scheduled_for: when.toISOString(), items })
    .select('id, scheduled_for')
    .single()
  return created
}

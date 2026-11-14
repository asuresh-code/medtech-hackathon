// Server-side glue: load one woman's data (service-role client), run the pure engine,
// insert a flag if it is new. Used by /api/score, /api/sweep and scripts/seed.ts.
// The flag never leaves the server in a patient response.
import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_CONFIG, type EngineConfig } from './config.js'
import { computeBaseline, evaluate, type EngineInput, type EngineResult } from './rules.js'

export async function loadEngineInput(admin: SupabaseClient, womanId: string): Promise<EngineInput | null> {
  const [w, a, c, at] = await Promise.all([
    admin.from('women').select('gp_id, hv_id, baseline_total').eq('id', womanId).maybeSingle(),
    admin.from('item_answers').select('item_no, value, answered_at').eq('woman_id', womanId),
    admin.from('checkins').select('scheduled_for, completed_at, note_text').eq('woman_id', womanId),
    admin.from('attendance').select('session_date, attended').eq('woman_id', womanId),
  ])
  if (!w.data) return null
  return {
    woman: w.data as EngineInput['woman'],
    answers: (a.data ?? []) as EngineInput['answers'],
    checkins: (c.data ?? []) as EngineInput['checkins'],
    attendance: (at.data ?? []) as EngineInput['attendance'],
  }
}

/** Evaluate and insert a flag unless the same rule is already open, or was raised after this evidence. */
export async function runEngineFor(
  admin: SupabaseClient,
  womanId: string,
  nowIso: string,
  actorId: string | null,
  config: EngineConfig = DEFAULT_CONFIG,
): Promise<{ created: boolean; result: EngineResult | null }> {
  const input = await loadEngineInput(admin, womanId)
  if (!input) return { created: false, result: null }

  if (input.woman.baseline_total === null) {
    const b = computeBaseline(input.answers, config.window_days.value)
    if (b !== null) {
      await admin.from('women').update({ baseline_total: b }).eq('id', womanId)
      input.woman.baseline_total = b
    }
  }

  const result = evaluate(input, config, nowIso)
  if (!result) return { created: false, result: null }

  const { data: existing } = await admin
    .from('flags')
    .select('id, status, created_at')
    .eq('woman_id', womanId)
    .eq('rule_id', result.rule_id)
  const dup = (existing ?? []).some(
    (f) => f.status === 'open' || Date.parse(f.created_at as string) >= Date.parse(result.evidence_at),
  )
  if (dup) return { created: false, result }

  const { data: flag, error } = await admin
    .from('flags')
    .insert({
      woman_id: womanId,
      level: result.level,
      rule_id: result.rule_id,
      reason: result.reason,
      rule_version: result.rule_version,
      owner_id: result.owner_id,
      due_at: result.due_at,
      created_at: nowIso,
    })
    .select('id')
    .single()
  if (error) throw error

  await admin.from('audit_log').insert({
    actor_id: actorId,
    woman_id: womanId,
    event: 'flag.created',
    entity: 'flags',
    entity_id: flag.id,
    detail: { rule_id: result.rule_id, level: result.level, rule_version: result.rule_version, owner_id: result.owner_id },
  })
  return { created: true, result }
}

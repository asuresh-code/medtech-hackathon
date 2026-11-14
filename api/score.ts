// POST /api/score { checkin_id, now? } → { ok, next_checkin }
// Runs the deterministic engine (src/engine) after each check-in and writes flags + audit_log.
// The response must NEVER include a flag, score or level (patient-safe).
import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { ScoreResponse } from '../src/shared/types.js'
import { runEngineFor } from '../src/engine/run.js'
import { adminClient, callerId } from './_lib/supabaseAdmin.js'

// Stub schedule: 3 rotating groups every 2 days → all 10 items (incl. item 10) within ~6 days.
const GROUPS = [
  [1, 2, 3],
  [4, 5, 6, 10],
  [7, 8, 9],
]

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const admin = adminClient()
  const uid = await callerId(admin, req.headers.authorization)
  if (!uid) return res.status(401).json({ error: 'Not signed in' })

  const checkinId = String(req.body?.checkin_id ?? '')
  const nowIso = typeof req.body?.now === 'string' ? req.body.now : new Date().toISOString()

  const { data: checkin } = await admin
    .from('checkins')
    .select('id, woman_id, items, women!inner(user_id, usual_hour)')
    .eq('id', checkinId)
    .maybeSingle()
  const owner = (checkin as unknown as { women?: { user_id: string; usual_hour: number; reminder_hour?: number | null } } | null)?.women
  if (!checkin || owner?.user_id !== uid) return res.status(404).json({ error: 'Not found' })

  await admin.from('audit_log').insert({
    actor_id: uid,
    event: 'checkin.completed',
    entity: 'checkins',
    entity_id: checkin.id,
    detail: null,
  })

  // Deterministic engine → flags + audit_log (server-side only; never returned).
  try {
    await runEngineFor(admin, checkin.woman_id as string, nowIso, null)
  } catch (e) {
    console.error('engine failed', e)
  }

  // Schedule next check-in if none pending.
  const { data: pending } = await admin
    .from('checkins')
    .select('id, scheduled_for')
    .eq('woman_id', checkin.woman_id)
    .is('completed_at', null)
    .order('scheduled_for')
    .limit(1)
    .maybeSingle()

  let next = pending
  if (!next) {
    const idx = GROUPS.findIndex((g) => g.join() === (checkin.items as number[]).join())
    const items = GROUPS[(idx + 1) % GROUPS.length]
    const when = new Date(nowIso)
    when.setDate(when.getDate() + 2)
    when.setHours(owner?.reminder_hour ?? owner?.usual_hour ?? 20, 0, 0, 0)
    const { data: created } = await admin
      .from('checkins')
      .insert({ woman_id: checkin.woman_id, scheduled_for: when.toISOString(), items })
      .select('id, scheduled_for')
      .single()
    next = created
  }

  const body: ScoreResponse = { ok: true, next_checkin: next ?? null }
  return res.status(200).json(body)
}

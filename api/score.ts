// POST /api/score { checkin_id, now? } → { ok, next_checkin }
// Runs the deterministic engine after each check-in and schedules the next one.
// The response NEVER includes a flag, score or level (patient-safe). No LLM involved.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { ScoreResponse } from '../src/shared/types.js'
import { runEngineForWoman, scheduleNextIfNone } from './_lib/engineRunner.js'
import { adminClient, callerId } from './_lib/supabaseAdmin.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const admin = adminClient()
  const uid = await callerId(admin, req.headers.authorization)
  if (!uid) return res.status(401).json({ error: 'Not signed in' })

  const checkinId = String(req.body?.checkin_id ?? '')
  const nowIso = typeof req.body?.now === 'string' ? req.body.now : new Date().toISOString()

  const { data: checkin } = await admin
    .from('checkins')
    .select('id, woman_id, women!inner(user_id)')
    .eq('id', checkinId)
    .maybeSingle()
  const owner = (checkin as unknown as { women?: { user_id: string } } | null)?.women
  if (!checkin || owner?.user_id !== uid) return res.status(404).json({ error: 'Not found' })

  await admin.from('audit_log').insert({
    actor_id: uid,
    woman_id: checkin.woman_id,
    event: 'checkin.completed',
    entity: 'checkins',
    entity_id: checkin.id,
    detail: null,
  })

  await runEngineForWoman(admin, checkin.woman_id, nowIso)
  const next = await scheduleNextIfNone(admin, checkin.woman_id, nowIso)

  const body: ScoreResponse = { ok: true, next_checkin: next ?? null }
  return res.status(200).json(body)
}

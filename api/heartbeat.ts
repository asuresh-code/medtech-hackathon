// GET/POST /api/heartbeat — the deterministic "heartbeat" (Dev A). Also the silence sweep (engine re-run). Called every 15 min by Supabase pg_cron.
// For each open check-in: one prompt when it becomes due, and at most ONE reminder 3 h later.
// No streaks, no guilt, no AI. Quiet hours 23:00–07:00 UK. Idempotent via the notifications log.
// Auth: Authorization: Bearer <CRON_SECRET>.  Optional ?now=ISO for the demo clock.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import phrases from '../src/content/phrases.js'
import { adminClient } from './_lib/supabaseAdmin.js'
import { sendToWoman, ukHour } from './_lib/push.js'
import { runEngineForWoman, scheduleNextIfNone } from './_lib/engineRunner.js'

const REMINDER_AFTER_H = 3
const STALE_AFTER_H = 24

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorised' })

  const now = typeof req.query.now === 'string' ? new Date(req.query.now) : new Date()
  const admin = adminClient()

  // Silence sweep: re-run the deterministic engine for everyone (so missed check-ins raise D2/D3 even when
  // she never opens the app) and make sure each woman has a next check-in. Idempotent; no LLM.
  const { data: women } = await admin.from('women').select('id')
  let flagged = 0
  for (const w of women ?? []) {
    flagged += await runEngineForWoman(admin, w.id, now.toISOString())
    await scheduleNextIfNone(admin, w.id, now.toISOString())
  }

  const h = ukHour(now)
  if (h >= 23 || h < 7) return res.status(200).json({ ok: true, flagged, skipped: 'quiet hours' })
  const since = new Date(now.getTime() - STALE_AFTER_H * 3600_000).toISOString()
  const { data: due } = await admin
    .from('checkins')
    .select('id, woman_id, scheduled_for')
    .is('completed_at', null)
    .lte('scheduled_for', now.toISOString())
    .gte('scheduled_for', since)

  let prompts = 0
  let reminders = 0
  for (const c of due ?? []) {
    const ageH = (now.getTime() - new Date(c.scheduled_for).getTime()) / 3600_000
    const kind = ageH >= REMINDER_AFTER_H ? 'reminder' : 'prompt'
    if (kind === 'reminder') {
      const { count } = await admin
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('checkin_id', c.id)
        .eq('kind', 'prompt')
      if (!count) continue // only remind after a prompt went out
    }
    // Claim the slot first (unique checkin_id+kind) so concurrent runs never double-send.
    const { error } = await admin.from('notifications').insert({ woman_id: c.woman_id, checkin_id: c.id, kind })
    if (error) continue
    await sendToWoman(admin, c.woman_id, {
      title: phrases.pushTitle,
      body: kind === 'prompt' ? phrases.pushPrompt : phrases.pushReminder,
      url: `/checkin/${c.id}`,
      tag: `checkin-${c.id}`,
    })
    if (kind === 'prompt') prompts++
    else reminders++
  }
  return res.status(200).json({ ok: true, flagged, prompts, reminders })
}

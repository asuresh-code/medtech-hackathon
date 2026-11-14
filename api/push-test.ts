// POST /api/push-test — sends one test notification to the signed-in patient's own devices (Dev A).
// For setup confirmation and the live pitch demo. Patient bearer token required.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import phrases from '../src/content/phrases.js'
import { adminClient, callerId } from './_lib/supabaseAdmin.js'
import { sendToWoman } from './_lib/push.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const admin = adminClient()
  const uid = await callerId(admin, req.headers.authorization)
  if (!uid) return res.status(401).json({ error: 'Not signed in' })
  const { data: woman } = await admin.from('women').select('id').eq('user_id', uid).maybeSingle()
  if (!woman) return res.status(404).json({ error: 'Not a patient' })

  const { data: open } = await admin
    .from('checkins')
    .select('id')
    .eq('woman_id', woman.id)
    .is('completed_at', null)
    .order('scheduled_for')
    .limit(1)
    .maybeSingle()
  await admin.from('notifications').insert({ woman_id: woman.id, checkin_id: null, kind: 'test' })
  const delivered = await sendToWoman(admin, woman.id, {
    title: phrases.pushTitle,
    body: phrases.pushPrompt,
    url: open ? `/checkin/${open.id}` : '/',
    tag: 'aluna-test',
  })
  return res.status(200).json({ ok: true, delivered })
}

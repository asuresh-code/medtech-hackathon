// POST /api/join { code } → { token_hash }   (Dev A)
// Redeems a one-time 6-digit invite code (created by a clinician at the first in-person session)
// and returns a magic-link token hash; the client calls supabase.auth.verifyOtp() to sign in.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { JoinResponse } from '../src/shared/types'
import { adminClient, patientSignInToken } from './_lib/supabaseAdmin.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const code = String(req.body?.code ?? '')
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Invalid code' })

  const admin = adminClient()

  // Pitch-only shared code: reusable, never expires, signs everyone in as the same synthetic
  // patient. Enabled only when DEMO_INVITE_CODE is set; unset it after the event to switch it off.
  const demoCode = process.env.DEMO_INVITE_CODE
  const isDemo = Boolean(demoCode && /^\d{6}$/.test(demoCode) && code === demoCode)

  let womanId: string
  if (isDemo) {
    const pseudonym = process.env.DEMO_INVITE_PSEUDONYM || 'W-DEV1'
    const { data: w } = await admin.from('women').select('id').eq('pseudonym', pseudonym).maybeSingle()
    if (!w) return res.status(404).json({ error: 'Demo patient not found' })
    womanId = w.id
  } else {
    const { data: invite } = await admin
      .from('invite_codes')
      .select('code, woman_id, expires_at, used_at')
      .eq('code', code)
      .maybeSingle()
    if (!invite || invite.used_at || new Date(invite.expires_at) < new Date()) {
      return res.status(404).json({ error: 'Code expired or already used' })
    }
    womanId = invite.woman_id
  }

  const { data: woman } = await admin
    .from('women')
    .select('id, pseudonym, first_name, user_id')
    .eq('id', womanId)
    .single()
  if (!woman) return res.status(404).json({ error: 'Not found' })

  // Synthetic, non-deliverable address (see patientEmail) — no real email is ever used or sent.
  let userId: string
  let tokenHash: string
  try {
    ;({ userId, tokenHash } = await patientSignInToken(admin, woman.pseudonym))
  } catch {
    return res.status(500).json({ error: 'Could not create sign-in link' })
  }

  if (woman.user_id !== userId) {
    await admin.from('women').update({ user_id: userId }).eq('id', woman.id)
  }
  await admin
    .from('profiles')
    .upsert({ id: userId, role: 'patient', first_name: woman.first_name }, { onConflict: 'id' })
  if (!isDemo) await admin.from('invite_codes').update({ used_at: new Date().toISOString() }).eq('code', code)
  await admin.from('audit_log').insert({
    actor_id: userId,
    woman_id: woman.id,
    event: 'patient.joined',
    entity: 'women',
    entity_id: woman.id,
    detail: isDemo ? { demo_code: true } : null,
  })

  const body: JoinResponse = { token_hash: tokenHash }
  return res.status(200).json(body)
}

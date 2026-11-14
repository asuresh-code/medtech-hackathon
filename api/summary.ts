// POST /api/summary { woman_id, now? } → { status: 'ok' | 'unavailable', text }
// Clinician-only factual summary of the raw data, shown BESIDE the data, labelled
// "AI summary of data — not a clinical opinion". The LLM never sees or influences flags, levels,
// owners, due times or queue order. Output is rejected unless every number appears in the input
// and no diagnostic / risk / advice / reassurance word is used.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import Anthropic from '@anthropic-ai/sdk'
import { createHash } from 'node:crypto'
import { adminClient, callerId } from './_lib/supabaseAdmin.js'
import { EPDS_ITEMS } from '../src/shared/epds.js'
import { DEFAULT_CONFIG } from '../src/engine/config.js'
import { loadEngineInput } from '../src/engine/run.js'
import { missedStatus, rollingWindow } from '../src/engine/rules.js'
import { checkSummary } from '../src/engine/numberCheck.js'

const UNAVAILABLE = 'Summary unavailable — see data'

const SYSTEM = `You write a short factual summary of patient-reported check-in data for a primary-care clinician.
Write 3-4 plain sentences describing what the data shows and what changed, quoting her notes verbatim in quotation marks.
Strict rules: do not diagnose or name any condition; do not assess or mention risk; do not recommend, advise or suggest actions; do not reassure or judge (no "fine", "ok", "good", "concerning").
Use only numbers that appear in the data, written as digits; do not calculate new numbers such as differences or percentages.
Output only the summary text.`

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const admin = adminClient()
  const uid = await callerId(admin, req.headers.authorization)
  if (!uid) return res.status(401).json({ error: 'Not signed in' })

  const womanId = String(req.body?.woman_id ?? '')
  const nowIso = typeof req.body?.now === 'string' ? req.body.now : new Date().toISOString()
  const { data: woman } = await admin.from('women').select('id, first_name, gp_id, hv_id, baseline_total').eq('id', womanId).maybeSingle()
  if (!woman || (woman.gp_id !== uid && woman.hv_id !== uid)) return res.status(404).json({ error: 'Not found' })

  const input = await loadEngineInput(admin, womanId)
  if (!input) return res.status(404).json({ error: 'Not found' })
  const now = Date.parse(nowIso)
  const win = rollingWindow(input.answers, now, DEFAULT_CONFIG.window_days.value)
  const { due } = missedStatus(input.checkins, now, DEFAULT_CONFIG.missed_grace_hours.value)

  const lines: string[] = [`Name: ${woman.first_name}`]
  lines.push(`Latest 7-day EPDS answers (${win.answered} of 10 items answered):`)
  for (const it of EPDS_ITEMS) {
    const a = win.latest.get(it.no)
    const label = a ? (it.options.find((o) => o.value === a.value)?.label ?? '') : 'not answered'
    lines.push(`- ${it.text}: ${label}`)
  }
  lines.push(`7-day EPDS total: ${win.total}`)
  lines.push(`Baseline total (first complete week): ${woman.baseline_total ?? 'not yet established'}`)
  lines.push(`Check-ins completed: ${due.filter((c) => c.completed_at).length} of ${due.length}`)
  lines.push(`Group sessions attended: ${input.attendance.filter((a) => a.attended).length} of ${input.attendance.length}`)
  const notes = input.checkins.filter((c) => c.note_text && c.completed_at).sort((a, b) => Date.parse(b.completed_at!) - Date.parse(a.completed_at!))
  lines.push('Her notes (newest first):')
  for (const c of notes.slice(0, 5)) lines.push(`- "${c.note_text}"`)
  const facts = lines.join('\n')

  const sourceHash = createHash('sha256').update(facts).digest('hex')
  const { data: cached } = await admin.from('summaries').select('text').eq('woman_id', womanId).eq('source_hash', sourceHash).maybeSingle()
  if (cached) return res.status(200).json({ status: 'ok', text: cached.text })

  let text = UNAVAILABLE
  try {
    const client = new Anthropic()
    const response = await client.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 1024,
      output_config: { effort: 'low' },
      system: SYSTEM,
      messages: [{ role: 'user', content: facts }],
    })
    if (response.stop_reason !== 'refusal') {
      const out = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim()
      const check = checkSummary(out, facts)
      if (check.ok) text = out
      else console.warn('summary rejected:', check.why)
    }
  } catch (e) {
    console.error('summary failed', e)
  }

  if (text !== UNAVAILABLE) await admin.from('summaries').upsert({ woman_id: womanId, source_hash: sourceHash, text }, { onConflict: 'woman_id,source_hash' })
  return res.status(200).json({ status: text === UNAVAILABLE ? 'unavailable' : 'ok', text })
}

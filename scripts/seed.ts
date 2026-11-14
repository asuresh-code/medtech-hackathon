// Demo cast (synthetic): Priya (urgent), Maya (review), Sarah (quiet drift), Ellie (stable), each with ~3 weeks
// of check-ins, answers, class attendance and notes. Flags are produced by the REAL deterministic engine.
// Re-runnable: wipes and rebuilds these four women. Needs `npm run seed:dev` first (creates the clinicians).
// Run: npm run seed
import { adminClient } from '../api/_lib/supabaseAdmin.js'
import { runEngineForWoman, scheduleNextIfNone } from '../api/_lib/engineRunner.js'

const admin = adminClient()
const DAY = 86_400_000
const now = new Date()
const ago = (days: number, hour = 20) => {
  const d = new Date(now.getTime() - days * DAY)
  d.setUTCHours(hour, 0, 0, 0)
  return d
}
const GROUPS = [
  [1, 2, 3],
  [4, 5, 6, 10],
  [7, 8, 9],
]
const CHECKIN_DAYS = [20, 18, 16, 14, 12, 10, 8, 6, 4, 2]

interface Persona {
  pseudonym: string
  first_name: string
  baby_weeks: number
  group_label: string
  early: number[] // item values before the last week (baseline)
  recent: number[] // item values in the last 7 days
  missed: number[] // check-in days (from CHECKIN_DAYS) she didn't answer
  classesMissed: number[] // days ago of missed weekly classes (classes on 17, 10, 3)
  notes: Record<number, string>
  reminder_hour: number
  routine_label: string
}

const CAST: Persona[] = [
  {
    pseudonym: 'W-PRIYA',
    first_name: 'Priya',
    baby_weeks: 14,
    group_label: 'Wednesday 11:00 postnatal yoga at Ashby Children’s Centre',
    early: [1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    recent: [2, 2, 2, 2, 2, 2, 1, 2, 1, 1], // item 10 = "Hardly ever" → U1
    missed: [],
    classesMissed: [3],
    notes: { 6: 'I just feel like I’m failing her. Some nights are really dark.', 2: 'Didn’t sleep again.' },
    reminder_hour: 21,
    routine_label: 'Before bed',
  },
  {
    pseudonym: 'W-MAYA',
    first_name: 'Maya',
    baby_weeks: 10,
    group_label: 'Tuesday 10:00 baby & me group at Ashby Children’s Centre',
    early: [1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
    recent: [2, 2, 2, 2, 1, 2, 1, 1, 1, 0], // 14 → R1
    missed: [],
    classesMissed: [],
    notes: { 4: 'Not sleeping even when the baby does. Everything takes so much effort.' },
    reminder_hour: 19,
    routine_label: 'After the evening feed',
  },
  {
    pseudonym: 'W-SARAH',
    first_name: 'Sarah',
    baby_weeks: 12,
    group_label: 'Tuesday 10:00 baby & me group at Ashby Children’s Centre',
    early: [1, 1, 1, 1, 0, 1, 0, 1, 0, 0], // baseline 6
    recent: [1, 2, 2, 1, 1, 1, 1, 1, 1, 0], // 11: +5 → D1 (also D4, D2) — below the 13 cut-off
    missed: [10, 8],
    classesMissed: [10, 3],
    notes: { 2: 'Tired. Haven’t felt like going to the group lately.' },
    reminder_hour: 8,
    routine_label: 'After the morning feed',
  },
  {
    pseudonym: 'W-ELLIE',
    first_name: 'Ellie',
    baby_weeks: 20,
    group_label: 'Thursday 13:30 buggy walk from Ashby Park',
    early: [0, 0, 1, 1, 0, 1, 0, 0, 0, 0],
    recent: [0, 0, 1, 1, 0, 0, 0, 0, 0, 0],
    missed: [],
    classesMissed: [],
    notes: { 4: 'Good week — went to the walk with my sister.' },
    reminder_hour: 14,
    routine_label: 'During baby’s nap',
  },
]

async function profileId(email: string): Promise<string> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 })
  const u = data.users.find((x) => x.email === email)
  if (!u) throw new Error(`Missing ${email} — run "npm run seed:dev" first`)
  return u.id
}

async function main() {
  const gp = await profileId('gp.demo@aluna.example.com')
  const hv = await profileId('hv.demo@aluna.example.com')

  for (const p of CAST) {
    const { data: existing } = await admin.from('women').select('id').eq('pseudonym', p.pseudonym).maybeSingle()
    if (existing) await admin.from('women').delete().eq('id', existing.id) // cascades check-ins, answers, flags…
    const { data: w, error } = await admin
      .from('women')
      .insert({
        pseudonym: p.pseudonym,
        first_name: p.first_name,
        baby_weeks: p.baby_weeks,
        gp_id: gp,
        hv_id: hv,
        usual_hour: p.reminder_hour,
        reminder_hour: p.reminder_hour,
        routine_label: p.routine_label,
        group_label: p.group_label,
      })
      .select('id')
      .single()
    if (error) throw error

    for (const [i, day] of CHECKIN_DAYS.entries()) {
      const items = GROUPS[i % 3]
      const scheduled = ago(day, p.reminder_hour)
      const done = !p.missed.includes(day)
      const { data: c, error: cErr } = await admin
        .from('checkins')
        .insert({
          woman_id: w.id,
          scheduled_for: scheduled.toISOString(),
          items,
          completed_at: done ? new Date(scheduled.getTime() + 25 * 60_000).toISOString() : null,
          note_text: done ? (p.notes[day] ?? null) : null,
        })
        .select('id')
        .single()
      if (cErr) throw cErr
      if (!done) continue
      const values = day <= 7 ? p.recent : p.early
      const rows = items.map((item, k) => ({
        woman_id: w.id,
        checkin_id: c.id,
        item_no: item,
        value: values[item - 1],
        answered_at: new Date(scheduled.getTime() + (k + 1) * 60_000).toISOString(),
        via: k % 2 ? 'voice' : 'tap',
      }))
      const { error: aErr } = await admin.from('item_answers').insert(rows)
      if (aErr) throw aErr
    }

    await admin.from('attendance').insert(
      [17, 10, 3].map((d) => ({ woman_id: w.id, session_date: ago(d).toISOString().slice(0, 10), attended: !p.classesMissed.includes(d) })),
    )

    const flags = await runEngineForWoman(admin, w.id, now.toISOString())
    await scheduleNextIfNone(admin, w.id, now.toISOString())
    const { data: f } = await admin.from('flags').select('level, rule_id, reason').eq('woman_id', w.id).eq('status', 'open')
    console.log(`${p.first_name.padEnd(6)} → ${flags} flag(s): ${(f ?? []).map((x) => `${x.level}/${x.rule_id} "${x.reason}"`).join('; ') || 'none'}`)
  }
}

/** Reset Alex (W-DEV1, the judges' demo patient): clear test flags/check-ins, one check-in due now. */
async function resetAlex() {
  const { data: w } = await admin.from('women').select('id').eq('pseudonym', 'W-DEV1').maybeSingle()
  if (!w) return console.log('Alex   → not found (run npm run seed:dev)')
  await admin.from('women').update({ first_name: 'Alex', baseline_total: null }).eq('id', w.id)
  await admin.from('flags').delete().eq('woman_id', w.id)
  await admin.from('checkins').delete().eq('woman_id', w.id)
  await admin.from('notifications').delete().eq('woman_id', w.id)
  await admin.from('checkins').insert({ woman_id: w.id, scheduled_for: new Date(now.getTime() - 60_000).toISOString(), items: [1, 2, 3] })
  console.log('Alex   → reset: no flags, a 3-question check-in due now')
}

main().then(resetAlex).catch((e) => {
  console.error(e)
  process.exit(1)
})

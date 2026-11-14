// Dev B demo cast (synthetic only): Priya (urgent), Maya (review), Sarah (drift), Ellie (stable),
// each with ~3 weeks of check-ins, item answers, attendance and notes. Flags come from the
// deterministic engine (runEngineFor), never hand-written.
// Idempotent: each run wipes and rebuilds W-PRIYA / W-MAYA / W-SARAH / W-ELLIE.
// Run: npx tsx --env-file=.env.local scripts/seed.ts   (after `npm run seed:dev` created the clinicians)
import { adminClient } from '../api/_lib/supabaseAdmin.js'
import { ITEM_GROUPS } from '../src/engine/schedule.js'
import { runEngineFor } from '../src/engine/run.js'

const admin = adminClient()
const DAY = 86_400_000
const NOW = new Date()
const NOW_ISO = NOW.toISOString()

/** Per-item EPDS values (items 1..10). */
type Profile = [number, number, number, number, number, number, number, number, number, number]

interface Persona {
  pseudonym: string
  first_name: string
  baby_weeks: number
  group_label: string | null
  early: Profile // answers older than 7 days (sets her baseline)
  late: Profile // answers within the last 7 days
  missedDays: number[] // check-in days-ago left uncompleted
  classes: { daysAgo: number; attended: boolean }[]
  notes: Record<number, string> // days-ago → note
}

const CHECKIN_DAYS = [20, 18, 16, 14, 12, 10, 8, 6, 4, 2] // every 2 days → 3 groups cover all 10 items

const PERSONAS: Persona[] = [
  {
    pseudonym: 'W-PRIYA',
    first_name: 'Priya',
    baby_weeks: 9,
    group_label: null,
    early: [1, 1, 1, 1, 1, 1, 1, 0, 0, 0], // 7
    late: [1, 1, 1, 1, 1, 1, 1, 1, 0, 1], // item 10 positive
    missedDays: [],
    classes: [],
    notes: { 14: 'Feeding every two hours at night.', 6: 'Partner back at work this week.', 2: 'Hard few days. Very little sleep.' },
  },
  {
    pseudonym: 'W-MAYA',
    first_name: 'Maya',
    baby_weeks: 16,
    group_label: 'Thursday 13:30 baby massage at Ashby Children’s Centre',
    early: [1, 1, 1, 1, 1, 1, 1, 1, 0, 0], // 8
    late: [2, 2, 1, 2, 1, 2, 2, 1, 1, 0], // 14
    missedDays: [],
    classes: [
      { daysAgo: 19, attended: true },
      { daysAgo: 12, attended: true },
      { daysAgo: 5, attended: true },
    ],
    notes: { 16: 'Went to baby massage, nice to get out.', 4: 'Crying a lot this week, not sure why.', 2: 'Not sleeping even when the baby sleeps.' },
  },
  {
    pseudonym: 'W-SARAH',
    first_name: 'Sarah',
    baby_weeks: 12,
    group_label: 'Tuesday 10:00 baby & me group at Ashby Children’s Centre',
    early: [1, 1, 0, 1, 1, 1, 1, 0, 0, 0], // 6
    late: [1, 1, 1, 2, 1, 2, 2, 1, 0, 0], // 11
    missedDays: [12, 8],
    classes: [
      { daysAgo: 20, attended: true },
      { daysAgo: 13, attended: false },
      { daysAgo: 6, attended: false },
    ],
    notes: { 18: 'Group was nice, met another mum.', 6: 'Didn’t make it to group again.', 2: 'Not really going out much. Tired.' },
  },
  {
    pseudonym: 'W-ELLIE',
    first_name: 'Ellie',
    baby_weeks: 20,
    group_label: 'Tuesday 10:00 baby & me group at Ashby Children’s Centre',
    early: [0, 1, 0, 1, 1, 0, 1, 0, 0, 0], // 4
    late: [0, 1, 0, 1, 1, 0, 1, 0, 0, 0], // 4
    missedDays: [],
    classes: [
      { daysAgo: 20, attended: true },
      { daysAgo: 13, attended: true },
      { daysAgo: 6, attended: true },
    ],
    notes: { 10: 'Long walk in the park with the pram.', 2: 'Baby had jabs, a bit unsettled.' },
  },
]

async function clinicianId(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 })
  if (error) throw error
  const u = data.users.find((x) => x.email === email)
  if (!u) throw new Error(`${email} not found — run \`npm run seed:dev\` first`)
  return u.id
}

function at(daysAgo: number, hour = 20, minute = 0): string {
  const d = new Date(NOW.getTime() - daysAgo * DAY)
  d.setUTCHours(hour, minute, 0, 0)
  return d.toISOString()
}

async function must<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p
  if (error) throw error
  return data
}

async function seedPersona(p: Persona, gp: string, hv: string) {
  const existing = await must(admin.from('women').select('id').eq('pseudonym', p.pseudonym).maybeSingle())
  let womanId = (existing as { id: string } | null)?.id
  const row = { pseudonym: p.pseudonym, first_name: p.first_name, baby_weeks: p.baby_weeks, gp_id: gp, hv_id: hv, baseline_total: null, usual_hour: 20, group_label: p.group_label }
  if (womanId) {
    await must(admin.from('women').update(row).eq('id', womanId))
    for (const t of ['flags', 'checkins', 'attendance', 'summaries'] as const) {
      await must(admin.from(t).delete().eq('woman_id', womanId)) // cascades item_answers / decisions
    }
  } else {
    womanId = (await must(admin.from('women').insert(row).select('id').single()))!.id as string
  }

  for (const [i, daysAgo] of CHECKIN_DAYS.entries()) {
    const items = ITEM_GROUPS[i % ITEM_GROUPS.length]
    const missed = p.missedDays.includes(daysAgo)
    const completed = missed ? null : at(daysAgo, 20, 12)
    const checkin = await must(
      admin
        .from('checkins')
        .insert({ woman_id: womanId, scheduled_for: at(daysAgo), items, completed_at: completed, note_text: missed ? null : (p.notes[daysAgo] ?? null) })
        .select('id')
        .single(),
    )
    if (missed) continue
    const profile = daysAgo <= 6 ? p.late : p.early
    await must(
      admin.from('item_answers').insert(
        items.map((n) => ({ woman_id: womanId, checkin_id: checkin!.id, item_no: n, value: profile[n - 1], answered_at: completed, via: 'tap' })),
      ),
    )
  }
  // Next check-in pending (not yet due, so not "missed").
  await must(admin.from('checkins').insert({ woman_id: womanId, scheduled_for: at(-1), items: ITEM_GROUPS[CHECKIN_DAYS.length % 3] }))

  if (p.classes.length) {
    await must(
      admin.from('attendance').insert(p.classes.map((c) => ({ woman_id: womanId, session_date: at(c.daysAgo).slice(0, 10), attended: c.attended }))),
    )
  }

  const { result } = await runEngineFor(admin, womanId, NOW_ISO, null)
  console.log(`  ${p.pseudonym.padEnd(8)} ${p.first_name.padEnd(6)} → ${result ? `${result.level} (${result.reason})` : 'no flag'}`)
}

async function main() {
  const gp = await clinicianId('gp.demo@aluna.example.com')
  const hv = await clinicianId('hv.demo@aluna.example.com')
  console.log('Seeding demo cast (synthetic):')
  for (const p of PERSONAS) await seedPersona(p, gp, hv)
  console.log('Clinician logins: gp.demo@aluna.example.com / hv.demo@aluna.example.com  password: aluna-demo-2026')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

// Dev A's minimal seed so the patient app can be tested before Dev B's full seed (scripts/seed.ts) lands.
// Creates: a demo GP + health visitor + an unlinked GP (for RLS tests), one synthetic patient "Sarah"
// with a check-in due now, one seeded drift flag (to prove patients can't read flags), and a fresh invite code.
// Safe to re-run. Run: npm run seed:dev
import { adminClient } from '../api/_lib/supabaseAdmin.js'

const admin = adminClient()
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'aluna-demo-2026'

async function ensureClinician(email: string, firstName: string, jobTitle: string): Promise<string> {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 })
  let user = list.users.find((u) => u.email === email)
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: DEMO_PASSWORD, email_confirm: true })
    if (error) throw error
    user = data.user
  }
  const { error } = await admin
    .from('profiles')
    .upsert({ id: user.id, role: 'clinician', first_name: firstName, job_title: jobTitle }, { onConflict: 'id' })
  if (error) throw error
  return user.id
}

async function main() {
  const gp = await ensureClinician('gp.demo@aluna.example.com', 'Dr Okafor', 'GP')
  const hv = await ensureClinician('hv.demo@aluna.example.com', 'Jo Bennett', 'Health visitor')
  await ensureClinician('gp.other@aluna.example.com', 'Dr Other', 'GP') // no patients — RLS test

  const { data: existing } = await admin.from('women').select('id').eq('pseudonym', 'W-DEV1').maybeSingle()
  let womanId = existing?.id as string | undefined
  if (!womanId) {
    const { data, error } = await admin
      .from('women')
      .insert({
        pseudonym: 'W-DEV1',
        first_name: 'Sarah',
        baby_weeks: 12,
        gp_id: gp,
        hv_id: hv,
        baseline_total: 6,
        usual_hour: 20,
        group_label: 'Tuesday 10:00 baby & me group at Ashby Children’s Centre',
      })
      .select('id')
      .single()
    if (error) throw error
    womanId = data.id
  }

  // A check-in due now (if none open).
  const { data: open } = await admin
    .from('checkins')
    .select('id')
    .eq('woman_id', womanId)
    .is('completed_at', null)
    .limit(1)
    .maybeSingle()
  if (!open) {
    const { error } = await admin
      .from('checkins')
      .insert({ woman_id: womanId, scheduled_for: new Date(Date.now() - 60_000).toISOString(), items: [1, 2, 3] })
    if (error) throw error
  }

  // One seeded flag, so the RLS check proves the patient cannot see it.
  const { count } = await admin.from('flags').select('id', { count: 'exact', head: true }).eq('woman_id', womanId)
  if (!count) {
    await admin.from('flags').insert({
      woman_id: womanId,
      level: 'drift',
      rule_id: 'D-SEED',
      reason: 'Seeded example flag (dev-seed)',
      rule_version: 'seed',
      owner_id: hv,
      due_at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    })
  }

  // Fresh one-time invite code.
  const code = String(Math.floor(100000 + Math.random() * 900000))
  const { error: invErr } = await admin.from('invite_codes').insert({ code, woman_id: womanId, created_by: gp })
  if (invErr) throw invErr

  console.log('\nSeeded (synthetic).')
  console.log(`  Patient invite code : ${code}   → open /join?code=${code}`)
  console.log(`  Clinician logins    : gp.demo@aluna.example.com / hv.demo@aluna.example.com  password: ${DEMO_PASSWORD}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

// Proves the "nothing decided is shown to her" rule at the database layer.
// Signs in as the seeded patient and as clinicians, and asserts what each role can and cannot read.
// Run after `npm run seed:dev`:  npm run rls-check
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { adminClient, patientSignInToken } from '../api/_lib/supabaseAdmin.js'

const url = process.env.VITE_SUPABASE_URL!
const anon = process.env.VITE_SUPABASE_ANON_KEY!
const password = process.env.DEMO_PASSWORD ?? 'aluna-demo-2026'
const admin = adminClient()

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
  if (!ok) failures++
}

function fresh(): SupabaseClient {
  return createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function asPatient(pseudonym: string): Promise<SupabaseClient> {
  const { userId, tokenHash } = await patientSignInToken(admin, pseudonym)
  // Make sure the women row is linked (as /api/join would do).
  await admin.from('women').update({ user_id: userId }).eq('pseudonym', pseudonym)
  await admin.from('profiles').upsert({ id: userId, role: 'patient', first_name: 'Sarah' }, { onConflict: 'id' })
  const c = fresh()
  const { error: e2 } = await c.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })
  if (e2) throw e2
  return c
}

async function asClinician(email: string): Promise<SupabaseClient> {
  const c = fresh()
  const { error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw error
  return c
}

async function rows(c: SupabaseClient, table: string) {
  const { data, error } = await c.from(table).select('*')
  return { n: data?.length ?? 0, error: error?.message ?? null, data }
}

async function main() {
  const { count: flagCount } = await admin.from('flags').select('id', { count: 'exact', head: true })
  check('precondition: at least one flag exists', (flagCount ?? 0) > 0, `${flagCount} flags`)

  // ---- patient ----
  const p = await asPatient('W-DEV1')
  for (const t of ['flags', 'decisions', 'summaries', 'audit_log', 'attendance', 'women', 'item_answers', 'invite_codes', 'profiles']) {
    const r = await rows(p, t)
    const allowed = t === 'profiles' ? r.n <= 1 : r.n === 0
    check(`patient cannot read ${t}`, allowed, r.error ?? `${r.n} rows`)
  }
  const me = await p.from('patient_me').select('*').single()
  check('patient reads own patient_me', !me.error && me.data?.first_name === 'Sarah')
  check('patient_me exposes no baseline/score', me.data ? !('baseline_total' in me.data) : false)
  const ci = await rows(p, 'checkins')
  check('patient reads own check-ins', ci.n > 0, `${ci.n} rows`)

  const otherWoman = await admin.from('women').select('id').neq('pseudonym', 'W-DEV1').limit(1).maybeSingle()
  if (otherWoman.data) {
    const anyCheckin = await admin.from('checkins').select('id').eq('woman_id', otherWoman.data.id).limit(1).maybeSingle()
    const ins = await p.from('item_answers').insert({
      woman_id: otherWoman.data.id,
      checkin_id: anyCheckin.data?.id ?? '00000000-0000-0000-0000-000000000000',
      item_no: 1,
      value: 0,
    })
    check("patient cannot write another woman's answers", Boolean(ins.error))
  }
  const forge = await p.from('flags').insert({
    woman_id: me.data?.id,
    level: 'drift',
    rule_id: 'X',
    reason: 'forged',
    rule_version: 'x',
    due_at: new Date().toISOString(),
  })
  check('patient cannot create flags', Boolean(forge.error))

  // ---- clinicians ----
  const gp = await asClinician('gp.demo@aluna.example.com')
  const gpWomen = await rows(gp, 'women')
  check('named GP reads her record', gpWomen.n >= 1, `${gpWomen.n} rows`)
  const gpFlags = await rows(gp, 'flags')
  check('named GP reads flags', gpFlags.n >= 1, `${gpFlags.n} rows`)

  const other = await asClinician('gp.other@aluna.example.com')
  const otherWomen = await rows(other, 'women')
  check('unlinked GP cannot read her record', otherWomen.n === 0, `${otherWomen.n} rows`)
  const otherFlags = await rows(other, 'flags')
  check('unlinked GP cannot read her flags', otherFlags.n === 0, `${otherFlags.n} rows`)

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll RLS checks passed.')
  process.exit(failures ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

// Clinician app (/clinician/*): login → queue of open flags → one-page brief → decision.
// Every flag/level/order shown here comes from the deterministic engine; nothing is decided by an LLM.
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Route, Routes, useNavigate, useParams } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { now as demoNow } from '../lib/demoClock'
import { EPDS_ITEMS } from '../shared/epds'
import type { Attendance, CheckIn, DecisionKind, Flag, FlagLevel, ItemAnswer, Profile, Woman } from '../shared/types'
import { DEFAULT_CONFIG } from '../engine/config'
import { rollingWindow, missedStatus } from '../engine/rules'
import './clinician.css'

const LEVEL_ORDER: Record<FlagLevel, number> = { urgent: 0, review: 1, drift: 2 }

const DECISIONS: { kind: DecisionKind; label: string; needsReason?: boolean; group: 'primary' | 'other' }[] = [
  { kind: 'contacted', label: 'Contacted', group: 'primary' },
  { kind: 'gp_review', label: 'Book GP review', group: 'primary' },
  { kind: 'hv_followup', label: 'Health visitor follow-up', group: 'primary' },
  { kind: 'talking_therapies', label: 'Talking Therapies', group: 'primary' },
  { kind: 'secondary_referral', label: 'Refer to secondary care', needsReason: true, group: 'other' },
  { kind: 'no_action', label: 'No action', needsReason: true, group: 'other' },
]

type FlagRow = Flag & { women: { first_name: string } | null }

function fmtDue(iso: string, nowMs: number) {
  const t = Date.parse(iso)
  const label = new Date(t).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })
  return { label, overdue: t < nowMs }
}
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' })

function Synthetic() {
  return <span className="synthetic-badge">SYNTHETIC DATA</span>
}

function useProfiles() {
  const [profiles, setProfiles] = useState<Record<string, Profile>>({})
  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, role, first_name, job_title')
      .then(({ data }) => setProfiles(Object.fromEntries((data ?? []).map((p) => [p.id, p as Profile]))))
  }, [])
  return profiles
}
const ownerName = (profiles: Record<string, Profile>, id: string | null) => {
  const p = id ? profiles[id] : undefined
  return p ? `${p.first_name}${p.job_title ? ` (${p.job_title})` : ''}` : '—'
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setError(error.message)
    setBusy(false)
  }
  return (
    <div className="cl">
      <form className="cl-card cl-login" onSubmit={submit}>
        <h1>Aluna</h1>
        <p className="cl-muted">Clinician sign-in</p>
        <label htmlFor="cl-email">Email</label>
        <input id="cl-email" className="cl-input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label htmlFor="cl-pw">Password</label>
        <input id="cl-pw" className="cl-input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <div className="cl-error">{error}</div>}
        <div style={{ marginTop: 16 }}>
          <button className="cl-btn primary" disabled={busy} type="submit">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </form>
      <Synthetic />
    </div>
  )
}

function Header({ me, onSignOut }: { me: Profile | null; onSignOut: () => void }) {
  const nav = useNavigate()
  return (
    <div className="cl-top">
      <h1 style={{ cursor: 'pointer' }} onClick={() => nav('/clinician')}>
        Aluna <span className="cl-muted" style={{ fontSize: 18 }}>· clinician</span>
      </h1>
      <div className="cl-muted" style={{ fontSize: 14 }}>
        {me ? `${me.first_name}${me.job_title ? `, ${me.job_title}` : ''}` : ''} ·{' '}
        <button className="cl-link" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </div>
  )
}

function Queue() {
  const nav = useNavigate()
  const profiles = useProfiles()
  const [flags, setFlags] = useState<FlagRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const nowMs = demoNow().getTime()

  useEffect(() => {
    supabase
      .from('flags')
      .select('*, women(first_name)')
      .eq('status', 'open')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        setFlags((data ?? []) as FlagRow[])
      })
  }, [])

  const sorted = useMemo(
    () => [...(flags ?? [])].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || Date.parse(a.due_at) - Date.parse(b.due_at)),
    [flags],
  )

  return (
    <div className="cl-stack">
      <h2>Open flags</h2>
      <p className="cl-muted" style={{ marginTop: 0, fontSize: 14 }}>
        Your patients only. Ordered urgent → review → drift, then by due time. Ordering and levels are set by fixed rules.
      </p>
      {error && <div className="cl-error">{error}</div>}
      {flags === null ? (
        <p className="cl-muted">Loading…</p>
      ) : sorted.length === 0 ? (
        <div className="cl-card cl-muted">No open flags.</div>
      ) : (
        <ul className="cl-queue">
          {sorted.map((f) => {
            const due = fmtDue(f.due_at, nowMs)
            return (
              <li key={f.id} className="cl-row" onClick={() => nav(`/clinician/w/${f.woman_id}`)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && nav(`/clinician/w/${f.woman_id}`)}>
                <span className="cl-name">{f.women?.first_name ?? '—'}</span>
                <span>
                  <span className={`cl-tag ${f.level}`}>{f.level}</span>
                </span>
                <span className="cl-reason">{f.reason}</span>
                <span className="cl-meta">
                  {ownerName(profiles, f.owner_id)}
                  <br />
                  <span className={due.overdue ? 'cl-overdue' : ''}>{due.overdue ? `Overdue · ${due.label}` : `Due ${due.label}`}</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Brief({ uid }: { uid: string }) {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const profiles = useProfiles()
  const [woman, setWoman] = useState<Woman | null>(null)
  const [answers, setAnswers] = useState<ItemAnswer[]>([])
  const [checkins, setCheckins] = useState<CheckIn[]>([])
  const [attendance, setAttendance] = useState<Attendance[]>([])
  const [flags, setFlags] = useState<Flag[]>([])
  const [loaded, setLoaded] = useState(false)
  const [choice, setChoice] = useState<DecisionKind | null>(null)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const viewed = useRef(false)
  const nowIso = demoNow().toISOString()
  const nowMs = Date.parse(nowIso)

  useEffect(() => {
    Promise.all([
      supabase.from('women').select('*').eq('id', id).maybeSingle(),
      supabase.from('item_answers').select('*').eq('woman_id', id),
      supabase.from('checkins').select('*').eq('woman_id', id).order('scheduled_for'),
      supabase.from('attendance').select('*').eq('woman_id', id).order('session_date'),
      supabase.from('flags').select('*').eq('woman_id', id).eq('status', 'open'),
    ]).then(([w, a, c, at, f]) => {
      setWoman(w.data as Woman | null)
      setAnswers((a.data ?? []) as ItemAnswer[])
      setCheckins((c.data ?? []) as CheckIn[])
      setAttendance((at.data ?? []) as Attendance[])
      setFlags(((f.data ?? []) as Flag[]).sort((x, y) => LEVEL_ORDER[x.level] - LEVEL_ORDER[y.level]))
      setLoaded(true)
    })
    if (!viewed.current) {
      viewed.current = true
      void supabase.from('audit_log').insert({ actor_id: uid, event: 'brief.viewed', entity: 'women', entity_id: id, detail: { woman_id: id } })
    }
  }, [id, uid])

  const win = useMemo(() => rollingWindow(answers, nowMs, DEFAULT_CONFIG.window_days.value), [answers, nowMs])
  const missed = useMemo(() => missedStatus(checkins, nowMs, DEFAULT_CONFIG.missed_grace_hours.value), [checkins, nowMs])
  const completedCount = missed.due.filter((c) => c.completed_at).length
  const notes = checkins.filter((c) => c.note_text && c.completed_at).sort((a, b) => Date.parse(b.completed_at!) - Date.parse(a.completed_at!))
  const picked = DECISIONS.find((d) => d.kind === choice)

  async function decide() {
    if (!picked || flags.length === 0) return
    if (picked.needsReason && !reason.trim()) return setMsg('A reason is required for this decision.')
    setSaving(true)
    setMsg(null)
    for (const f of flags) {
      const { data: dec, error } = await supabase
        .from('decisions')
        .insert({ flag_id: f.id, woman_id: id, clinician_id: uid, decision: picked.kind, reason: reason.trim() || null })
        .select('id')
        .single()
      if (error) {
        setSaving(false)
        return setMsg(error.message)
      }
      await supabase.from('audit_log').insert({
        actor_id: uid,
        event: 'decision.made',
        entity: 'decisions',
        entity_id: dec.id,
        detail: { woman_id: id, flag_id: f.id, rule_id: f.rule_id, decision: picked.kind, reason: reason.trim() || null },
      })
      await supabase.from('flags').update({ status: 'closed' }).eq('id', f.id)
    }
    setSaving(false)
    nav('/clinician')
  }

  if (!loaded) return <p className="cl-muted">Loading…</p>
  if (!woman) return <div className="cl-card">Not found, or not one of your patients.</div>

  return (
    <div className="cl-stack">
      <div className="cl-top" style={{ marginBottom: 0 }}>
        <div>
          <button className="cl-link" onClick={() => nav('/clinician')}>
            ← Queue
          </button>
          <h2 style={{ fontSize: 28, marginTop: 6 }}>{woman.first_name}</h2>
          <div className="cl-muted" style={{ fontSize: 14 }}>
            {woman.pseudonym} · baby {woman.baby_weeks} weeks · GP {ownerName(profiles, woman.gp_id)} · HV {ownerName(profiles, woman.hv_id)}
          </div>
        </div>
      </div>

      {flags.map((f) => {
        const due = fmtDue(f.due_at, nowMs)
        return (
          <div key={f.id} className="cl-card">
            <span className={`cl-tag ${f.level}`}>{f.level}</span> <strong style={{ marginLeft: 6 }}>{f.reason}</strong>
            <div className="cl-muted" style={{ fontSize: 13, marginTop: 6 }}>
              Rule {f.rule_id} · {f.rule_version} · owner {ownerName(profiles, f.owner_id)} ·{' '}
              <span className={due.overdue ? 'cl-overdue' : ''}>{due.overdue ? 'overdue' : 'due'} {due.label}</span>
            </div>
          </div>
        )
      })}

      <div className="cl-brief">
        <div className="cl-stack">
          <div className="cl-stats">
            <div className="cl-stat">
              <b>
                {win.total}
                {woman.baseline_total !== null && <span className="cl-muted" style={{ fontSize: 15 }}> vs {woman.baseline_total}</span>}
              </b>
              <span>7-day EPDS total vs baseline ({win.answered}/10 items)</span>
            </div>
            <div className="cl-stat">
              <b>
                {completedCount}/{missed.due.length}
              </b>
              <span>Check-ins completed{missed.inARow ? ` · ${missed.inARow} missed in a row` : ''}</span>
            </div>
            <div className="cl-stat">
              <b>
                {attendance.filter((a) => a.attended).length}/{attendance.length}
              </b>
              <span>Classes attended{woman.group_label ? '' : ' (no group)'}</span>
            </div>
          </div>

          <div className="cl-card">
            <h3>Last 7 days — latest answer per item</h3>
            <table className="cl-grid">
              <thead>
                <tr>
                  <th />
                  <th>Item</th>
                  <th>Her answer</th>
                  <th style={{ textAlign: 'right' }}>Score</th>
                </tr>
              </thead>
              <tbody>
                {EPDS_ITEMS.map((it) => {
                  const a = win.latest.get(it.no)
                  const opt = a ? it.options.find((o) => o.value === a.value) : undefined
                  return (
                    <tr key={it.no}>
                      <td className="n">{it.no}</td>
                      <td>{it.text}</td>
                      <td>{a ? <>{opt?.label ?? '—'} <span className="cl-muted" style={{ fontSize: 12 }}>· {fmtDay(a.answered_at)}</span></> : <span className="cl-muted">not answered in window</span>}</td>
                      <td className="v">{a ? a.value : ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="cl-card">
            <h3>Check-ins</h3>
            <div className="cl-dots">
              {missed.due.map((c) => (
                <span key={c.id} className={`cl-dot ${c.completed_at ? '' : 'miss'}`}>
                  {fmtDay(c.scheduled_for)} · {c.completed_at ? 'done' : 'missed'}
                </span>
              ))}
            </div>
            {woman.group_label && (
              <>
                <h3 style={{ marginTop: 14 }}>Class: {woman.group_label}</h3>
                <div className="cl-dots">
                  {attendance.map((a) => (
                    <span key={a.id} className={`cl-dot ${a.attended ? '' : 'miss'}`}>
                      {fmtDay(a.session_date)} · {a.attended ? 'attended' : 'missed'}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="cl-card">
            <h3>Her notes</h3>
            {notes.length === 0 ? (
              <p className="cl-muted">No notes.</p>
            ) : (
              <div className="cl-stack">
                {notes.map((c) => (
                  <blockquote key={c.id} className="cl-quote">
                    “{c.note_text}”<small>{fmtDay(c.completed_at!)}</small>
                  </blockquote>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="cl-stack">
          <div className="cl-card">
            <h3>Decision</h3>
            {flags.length === 0 ? (
              <p className="cl-muted">No open flag.</p>
            ) : (
              <div className="cl-decisions">
                <div className="sep">Primary care</div>
                {DECISIONS.filter((d) => d.group === 'primary').map((d) => (
                  <button key={d.kind} className={`cl-btn ${choice === d.kind ? 'primary' : ''}`} onClick={() => setChoice(d.kind)}>
                    {d.label}
                  </button>
                ))}
                <div className="sep">Other (reason required)</div>
                {DECISIONS.filter((d) => d.group === 'other').map((d) => (
                  <button key={d.kind} className={`cl-btn ${choice === d.kind ? 'primary' : ''}`} onClick={() => setChoice(d.kind)}>
                    {d.label}
                  </button>
                ))}
                {picked && (
                  <>
                    <textarea
                      className="cl-input"
                      rows={3}
                      placeholder={picked.needsReason ? 'Reason (required)' : 'Note (optional)'}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                    <button className="cl-btn primary" disabled={saving || (picked.needsReason && !reason.trim())} onClick={decide}>
                      {saving ? 'Saving…' : `Confirm: ${picked.label}`}
                    </button>
                  </>
                )}
                {msg && <div className="cl-error">{msg}</div>}
              </div>
            )}
          </div>
          <AiSummary womanId={id} />
        </div>
      </div>
    </div>
  )
}

function AiSummary({ womanId }: { womanId: string }) {
  const [text, setText] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')
  async function load() {
    setState('loading')
    try {
      const { data } = await supabase.auth.getSession()
      const r = await fetch('/api/summary', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: JSON.stringify({ woman_id: womanId, now: demoNow().toISOString() }),
      })
      const j = r.ok ? ((await r.json()) as { text?: string }) : null
      setText(j?.text ?? 'Summary unavailable — see data')
    } catch {
      setText('Summary unavailable — see data')
    }
    setState('done')
  }
  return (
    <div className="cl-card cl-ai">
      <h3>AI summary of data — not a clinical opinion</h3>
      {state === 'idle' && (
        <button className="cl-btn" onClick={load}>
          Generate summary
        </button>
      )}
      {state === 'loading' && <p className="cl-muted">Generating…</p>}
      {state === 'done' && <p style={{ margin: 0, fontSize: 15 }}>{text}</p>}
    </div>
  )
}

export default function ClinicianApp() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [me, setMe] = useState<Profile | null>(null)
  const [notClinician, setNotClinician] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    supabase
      .from('profiles')
      .select('id, role, first_name, job_title')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        setMe(data as Profile | null)
        setNotClinician(data?.role !== 'clinician')
      })
  }, [session])

  async function signOut() {
    await supabase.auth.signOut()
    setMe(null)
    setNotClinician(false)
  }

  if (session === undefined) return null
  if (!session) return <Login />
  if (notClinician)
    return (
      <div className="cl">
        <div className="cl-card cl-login">
          <p>This account is not a clinician account.</p>
          <button className="cl-btn" onClick={signOut}>
            Sign out
          </button>
        </div>
        <Synthetic />
      </div>
    )

  return (
    <div className="cl">
      <Header me={me} onSignOut={signOut} />
      <Routes>
        <Route path="w/:id" element={<Brief uid={session.user.id} />} />
        <Route path="*" element={<Queue />} />
      </Routes>
      <Synthetic />
    </div>
  )
}

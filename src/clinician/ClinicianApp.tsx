// Aluna clinician app — queue, one-page brief, decisions, invites. Route: /clinician/*
// Every flag comes from the deterministic engine. No AI output sorts, filters or changes anything here.
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { ENGINE_CONFIG, type RuleId } from '../engine/config'
import { latestPerItem } from '../engine/rules'
import { EPDS_ITEMS, getItem } from '../shared/epds'
import type { DecisionKind, FlagLevel, ItemNo } from '../shared/types'
import { MoonMark } from '../patient/Icons'
import { auditView, createInvite, loadBrief, loadQueue, recordDecision, relDue, trend, type QueueRow } from './data'
import './clinician.css'

const DEMO_PASSWORD = 'aluna-demo-2026'

function useClinicianSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [name, setName] = useState<string>('')
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!session) return
    supabase
      .from('profiles')
      .select('first_name, job_title, role')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setName(data?.role === 'clinician' ? `${data.first_name}${data.job_title ? ` · ${data.job_title}` : ''}` : ''))
  }, [session])
  return { session, name }
}

export default function ClinicianApp() {
  const { session, name } = useClinicianSession()
  if (session === undefined) return null
  if (!session || !name) return <Login signedInAsPatient={Boolean(session && !name)} />
  return (
    <Shell name={name}>
      <Routes>
        <Route index element={<Queue />} />
        <Route path="w/:id" element={<Brief />} />
        <Route path="*" element={<Navigate to="/clinician" replace />} />
      </Routes>
    </Shell>
  )
}

// ---------------- shell ----------------

function Shell({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="c-shell">
      <header className="c-header">
        <Link to="/clinician" className="c-brand">
          <MoonMark size={24} /> Aluna <span>Clinician</span>
        </Link>
        <div className="c-header-right">
          <span className="c-who">{name}</span>
          <button type="button" className="c-btn c-btn-quiet" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </header>
      <main className="c-main">{children}</main>
      <span className="synthetic-badge">SYNTHETIC DATA</span>
    </div>
  )
}

// ---------------- login ----------------

function Login({ signedInAsPatient }: { signedInAsPatient: boolean }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function signIn(e?: FormEvent, preset?: string) {
    e?.preventDefault()
    setBusy(true)
    setError(null)
    if (signedInAsPatient) await supabase.auth.signOut()
    const { error } = await supabase.auth.signInWithPassword({ email: preset ?? email, password: preset ? DEMO_PASSWORD : password })
    if (error) setError('Email or password not recognised.')
    setBusy(false)
  }

  return (
    <div className="c-login">
      <div className="c-card c-login-card">
        <div className="c-brand" style={{ marginBottom: 8 }}>
          <MoonMark size={28} /> Aluna <span>Clinician</span>
        </div>
        <h1>Sign in</h1>
        <p className="c-muted">Primary care view: flags from the deterministic rules engine, one-page briefs, decisions.</p>
        <form onSubmit={signIn} className="c-stack">
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </label>
          {error && <p className="c-error">{error}</p>}
          <button className="c-btn c-btn-primary" disabled={busy}>
            Sign in
          </button>
        </form>
        <div className="c-demo-logins">
          <p className="c-eyebrow">Demo logins (synthetic)</p>
          <button type="button" className="c-btn" onClick={() => signIn(undefined, 'gp.demo@aluna.example.com')} data-testid="demo-gp">
            Dr Okafor · GP
          </button>
          <button type="button" className="c-btn" onClick={() => signIn(undefined, 'hv.demo@aluna.example.com')} data-testid="demo-hv">
            Jo Bennett · Health visitor
          </button>
        </div>
      </div>
      <span className="synthetic-badge">SYNTHETIC DATA</span>
    </div>
  )
}

// ---------------- queue ----------------

function LevelTag({ level }: { level: FlagLevel }) {
  return <span className={`c-tag c-tag-${level}`}>{level === 'urgent' ? 'Urgent' : level === 'review' ? 'Review' : 'Drift'}</span>
}

function Queue() {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadQueue>> | null>(null)
  const navigate = useNavigate()
  useEffect(() => {
    void loadQueue().then(setData)
  }, [])
  if (!data) return <p className="c-muted">Loading queue…</p>

  // One row per woman: her highest open flag (others shown as a count).
  const byWoman = new Map<string, QueueRow[]>()
  for (const r of data.rows) byWoman.set(r.woman_id, [...(byWoman.get(r.woman_id) ?? []), r])
  const rows = [...byWoman.values()].map((rs) => ({ top: rs[0], more: rs.length - 1 }))
  const flagged = new Set(byWoman.keys())
  const quiet = data.women.filter((w) => !flagged.has(w.id))
  const count = (l: FlagLevel) => rows.filter((r) => r.top.level === l).length

  return (
    <>
      <div className="c-page-head">
        <div>
          <p className="c-eyebrow">Today</p>
          <h1>Who first, and why</h1>
        </div>
        <div className="c-counts">
          <span>
            <LevelTag level="urgent" /> {count('urgent')}
          </span>
          <span>
            <LevelTag level="review" /> {count('review')}
          </span>
          <span>
            <LevelTag level="drift" /> {count('drift')}
          </span>
        </div>
      </div>

      <div className="c-card c-table" role="table" aria-label="Flag queue">
        <div className="c-tr c-th" role="row">
          <span>Level</span>
          <span>Patient</span>
          <span>Reason (rule that fired)</span>
          <span>Owner</span>
          <span>Due</span>
        </div>
        {rows.length === 0 && <p className="c-muted" style={{ padding: 16 }}>No open flags.</p>}
        {rows.map(({ top, more }) => {
          const due = relDue(top.due_at)
          return (
            <button key={top.id} type="button" className="c-tr" role="row" onClick={() => navigate(`/clinician/w/${top.woman_id}`)} data-testid="queue-row">
              <span>
                <LevelTag level={top.level} />
              </span>
              <span>
                <strong>{top.woman.first_name}</strong>
                <small>
                  {top.woman.pseudonym} · baby {top.woman.baby_weeks} wks
                </small>
              </span>
              <span>
                {top.reason}
                {more > 0 && <small>+{more} more open flag{more > 1 ? 's' : ''}</small>}
              </span>
              <span>{(top.owner_id && data.names.get(top.owner_id)) || '—'}</span>
              <span className={due.overdue ? 'c-overdue' : ''}>{due.text}</span>
            </button>
          )
        })}
      </div>

      {quiet.length > 0 && (
        <>
          <p className="c-eyebrow" style={{ marginTop: 24 }}>
            No open flags
          </p>
          <div className="c-chips">
            {quiet.map((w) => (
              <Link key={w.id} to={`/clinician/w/${w.id}`} className="c-chip">
                {w.first_name} <small>{w.pseudonym}</small>
              </Link>
            ))}
          </div>
        </>
      )}
      <p className="c-footnote">
        Sorted by level, then due time. Flags come only from the deterministic rules ({ENGINE_CONFIG.version}). Nothing here is decided by AI.
      </p>
    </>
  )
}

// ---------------- brief ----------------

const DECISIONS: { kind: DecisionKind; label: string; needsReason?: boolean }[] = [
  { kind: 'contacted', label: 'Contacted her' },
  { kind: 'gp_review', label: 'Book GP review' },
  { kind: 'hv_followup', label: 'Health visitor follow-up' },
  { kind: 'talking_therapies', label: 'Talking Therapies support' },
  { kind: 'secondary_referral', label: 'Refer to secondary care', needsReason: true },
  { kind: 'no_action', label: 'No action', needsReason: true },
]

function Brief() {
  const { id } = useParams<{ id: string }>()
  const [b, setB] = useState<Awaited<ReturnType<typeof loadBrief>> | null>(null)
  const [decision, setDecision] = useState<DecisionKind | null>(null)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const [invite, setInvite] = useState<{ code: string; qr: string } | null>(null)

  const refresh = () => loadBrief(id!).then(setB)
  useEffect(() => {
    void refresh()
    void auditView(id!)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const window7 = useMemo(() => (b ? latestPerItem(b.answers, Date.now(), 168 * 3_600_000) : null), [b])
  const tr = useMemo(() => (b ? trend(b.answers, b.checkins) : null), [b])
  if (!b || !b.woman || !window7 || !tr) return <p className="c-muted">Loading brief…</p>

  const open = b.flags.filter((f) => f.status === 'open')
  const total = [...window7.values()].reduce((s, a) => s + a.value, 0)
  const complete = window7.size === 10
  const needsReason = DECISIONS.find((d) => d.kind === decision)?.needsReason
  const recent = b.checkins.slice(0, 8)
  const notes = b.checkins.filter((c) => c.note_text).slice(0, 4)

  async function submit() {
    if (!decision || (needsReason && !reason.trim())) return
    setSaving(true)
    try {
      await recordDecision({ womanId: id!, flagIds: open.map((f) => f.id), decision, reason: reason.trim() || null })
      setSaved(DECISIONS.find((d) => d.kind === decision)!.label)
      setDecision(null)
      setReason('')
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Link to="/clinician" className="c-back">
        ← Queue
      </Link>
      <div className="c-page-head">
        <div>
          <p className="c-eyebrow">One-page brief · {b.woman.pseudonym}</p>
          <h1>{b.woman.first_name}</h1>
          <p className="c-muted">
            Baby {b.woman.baby_weeks} weeks · GP {b.names.get(b.woman.gp_id) ?? '—'} · HV {b.names.get(b.woman.hv_id) ?? '—'}
          </p>
        </div>
        <button
          type="button"
          className="c-btn"
          onClick={async () => {
            const code = await createInvite(id!)
            if (code) setInvite({ code, qr: await QRCode.toDataURL(`${location.origin}/join?code=${code}`, { margin: 1, width: 220 }) })
          }}
        >
          Invite to app (QR)
        </button>
      </div>

      {invite && (
        <div className="c-card c-invite">
          <img src={invite.qr} alt={`QR code to join with code ${invite.code}`} width={160} height={160} />
          <div>
            <p className="c-eyebrow">One-time setup code · 24 h</p>
            <p className="c-code">{invite.code}</p>
            <p className="c-muted">She scans this at the first session — no sign-up, no password.</p>
          </div>
        </div>
      )}

      <div className="c-grid">
        <section className="c-card">
          <p className="c-eyebrow">Why she is here</p>
          {open.length === 0 && <p className="c-muted">No open flags.{saved && ` Last decision: ${saved}.`}</p>}
          {open.map((f) => {
            const rule = ENGINE_CONFIG.rules[f.rule_id as RuleId]
            const due = relDue(f.due_at)
            return (
              <div key={f.id} className="c-flag">
                <div className="c-flag-top">
                  <LevelTag level={f.level} />
                  <strong>{f.reason}</strong>
                </div>
                <small>
                  Owner {b.names.get(f.owner_id) ?? '—'} · <span className={due.overdue ? 'c-overdue' : ''}>{due.text}</span> · {f.rule_version}
                </small>
                {rule && <small className="c-source">Source: {rule.source}</small>}
              </div>
            )
          })}
        </section>

        <section className="c-card">
          <p className="c-eyebrow">EPDS trend (complete 7-day windows)</p>
          <Sparkline points={tr.points.map((p) => p.total)} baseline={tr.baseline} />
          <p className="c-muted c-small">
            Now: {complete ? <strong>{total}</strong> : <strong>{total}+</strong>} {complete ? '' : `(${window7.size}/10 items this week)`} · Her
            baseline: <strong>{tr.baseline ?? '—'}</strong> · Review cut-off 13 (SIGN 169)
          </p>
        </section>
      </div>

      <section className="c-card">
        <p className="c-eyebrow">Last 7 days — her answers</p>
        <div className="c-items">
          {EPDS_ITEMS.map((item) => {
            const a = window7.get(item.no)
            const opt = a ? getItem(item.no as ItemNo).options.find((o) => o.value === a.value) : null
            return (
              <div key={item.no} className={`c-item ${a && item.no === 10 && a.value > 0 ? 'c-item-alert' : ''}`}>
                <span className="c-item-no">{item.no}</span>
                <span className="c-item-q">{item.text}</span>
                <span className="c-item-a">{opt ? opt.label : <em className="c-muted">not answered this week</em>}</span>
                <span className="c-item-v">{a ? a.value : '–'}</span>
              </div>
            )
          })}
        </div>
      </section>

      <div className="c-grid">
        <section className="c-card">
          <p className="c-eyebrow">Check-ins & classes</p>
          <div className="c-dots">
            {[...recent].reverse().map((c) => (
              <span
                key={c.id}
                className={`c-dot ${c.completed_at ? 'done' : new Date(c.scheduled_for).getTime() < Date.now() - 86_400_000 ? 'missed' : 'pending'}`}
                title={new Date(c.scheduled_for).toLocaleDateString('en-GB')}
              />
            ))}
          </div>
          <p className="c-muted c-small">● answered ○ missed ◌ upcoming (most recent on the right)</p>
          <p className="c-small">
            Classes:{' '}
            {b.attendance.slice(0, 4).map((a) => (
              <span key={a.session_date} className={`c-chip ${a.attended ? '' : 'c-chip-missed'}`}>
                {new Date(a.session_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} {a.attended ? 'attended' : 'missed'}
              </span>
            ))}
          </p>
        </section>
        <section className="c-card">
          <p className="c-eyebrow">In her own words</p>
          {notes.length === 0 && <p className="c-muted">No notes.</p>}
          {notes.map((c) => (
            <blockquote key={c.id} className="c-quote">
              “{c.note_text}”<small>{new Date(c.completed_at ?? c.scheduled_for).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</small>
            </blockquote>
          ))}
        </section>
      </div>

      <section className="c-card c-decide">
        <p className="c-eyebrow">Your decision {open.length > 0 && `· closes ${open.length} open flag${open.length > 1 ? 's' : ''}`}</p>
        {saved && <p className="c-saved">Recorded: {saved}. Written to the audit log.</p>}
        <div className="c-decisions">
          {DECISIONS.map((d) => (
            <button
              key={d.kind}
              type="button"
              className={`c-btn ${decision === d.kind ? 'c-btn-primary' : ''} ${d.kind === 'secondary_referral' ? 'c-btn-secondary-care' : ''}`}
              onClick={() => setDecision(d.kind)}
              disabled={open.length === 0}
              data-testid={`decision-${d.kind}`}
            >
              {d.label}
            </button>
          ))}
        </div>
        {decision && (
          <div className="c-stack" style={{ marginTop: 12 }}>
            <label>
              {needsReason ? 'Reason (required)' : 'Note (optional)'}
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
            </label>
            <button type="button" className="c-btn c-btn-primary" onClick={submit} disabled={saving || (needsReason && !reason.trim())} data-testid="decision-submit">
              {saving ? 'Saving…' : 'Confirm decision'}
            </button>
          </div>
        )}
        <p className="c-footnote">Primary-care options first. The clinician makes every decision; the engine never closes a flag.</p>
      </section>
    </>
  )
}

function Sparkline({ points, baseline }: { points: number[]; baseline: number | null }) {
  if (points.length === 0) return <p className="c-muted">Not enough complete weeks yet.</p>
  const W = 320
  const Hh = 90
  const max = 30
  const x = (i: number) => (points.length === 1 ? W / 2 : (i / (points.length - 1)) * (W - 20) + 10)
  const y = (v: number) => Hh - 8 - (v / max) * (Hh - 16)
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className="c-spark" role="img" aria-label={`EPDS weekly totals: ${points.join(', ')}`}>
      <line x1="0" x2={W} y1={y(13)} y2={y(13)} className="c-spark-cut" />
      <text x={W - 4} y={y(13) - 4} textAnchor="end" className="c-spark-label">13</text>
      {baseline !== null && (
        <>
          <line x1="0" x2={W} y1={y(baseline)} y2={y(baseline)} className="c-spark-base" />
          <text x="4" y={y(baseline) - 4} className="c-spark-label">baseline {baseline}</text>
        </>
      )}
      <polyline points={points.map((p, i) => `${x(i)},${y(p)}`).join(' ')} className="c-spark-line" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p)} r="3.5" className="c-spark-dot" />
      ))}
    </svg>
  )
}

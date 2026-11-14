// One-page brief: raw data first; AI summary beside it, labelled and never used for ordering.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { now as demoNow } from '../lib/demoClock'
import { EPDS_ITEMS } from '../shared/epds'
import type { Attendance, CheckIn, DecisionKind, Flag, ItemAnswer, Profile } from '../shared/types'
import {
  DECISIONS,
  LEVEL_ORDER,
  SUMMARY_UNAVAILABLE,
  checkinStatus,
  fetchSummary,
  fmtDateTime,
  fmtDay,
  latestInWindow,
  loadProfiles,
  ownerLabel,
  type WomanLite,
} from './data'

export function Brief({ me }: { me: string }) {
  const { womanId = '' } = useParams()
  const [woman, setWoman] = useState<WomanLite | null>(null)
  const [answers, setAnswers] = useState<ItemAnswer[]>([])
  const [checkins, setCheckins] = useState<CheckIn[]>([])
  const [attendance, setAttendance] = useState<Attendance[]>([])
  const [flags, setFlags] = useState<Flag[]>([])
  const [profiles, setProfiles] = useState<Record<string, Profile>>({})
  const [loaded, setLoaded] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const logged = useRef<string | null>(null)
  const nowMs = demoNow().getTime()

  useEffect(() => {
    let alive = true
    setLoaded(false)
    Promise.all([
      supabase.from('women').select('id, first_name, pseudonym, baby_weeks, gp_id, hv_id, baseline_total, group_label').eq('id', womanId).maybeSingle(),
      supabase.from('item_answers').select('*').eq('woman_id', womanId),
      supabase.from('checkins').select('*').eq('woman_id', womanId).order('scheduled_for'),
      supabase.from('attendance').select('*').eq('woman_id', womanId).order('session_date'),
      supabase.from('flags').select('*').eq('woman_id', womanId).eq('status', 'open'),
      loadProfiles(),
    ]).then(([w, a, c, at, f, p]) => {
      if (!alive) return
      setWoman(w.data as WomanLite | null)
      setAnswers((a.data ?? []) as ItemAnswer[])
      setCheckins((c.data ?? []) as CheckIn[])
      setAttendance((at.data ?? []) as Attendance[])
      setFlags(((f.data ?? []) as Flag[]).sort((x, y) => LEVEL_ORDER[x.level] - LEVEL_ORDER[y.level] || Date.parse(x.due_at) - Date.parse(y.due_at)))
      setProfiles(p)
      setLoaded(true)
      if (w.data && logged.current !== womanId) {
        logged.current = womanId
        void supabase.from('audit_log').insert({ actor_id: me, woman_id: womanId, event: 'brief.viewed', entity: 'women', entity_id: womanId })
      }
    })
    fetchSummary(womanId).then((t) => alive && setSummary(t))
    return () => {
      alive = false
    }
  }, [womanId, me])

  const latest = useMemo(() => latestInWindow(answers, nowMs), [answers, nowMs])
  const total = [...latest.values()].reduce((s, a) => s + a.value, 0)
  const statuses = checkins.map((c) => ({ c, s: checkinStatus(c, nowMs) }))
  const count = (s: string) => statuses.filter((x) => x.s === s).length
  const pastClasses = attendance.filter((a) => Date.parse(`${a.session_date}T12:00:00Z`) <= nowMs)
  const notes = checkins.filter((c) => c.note_text?.trim()).sort((a, b) => Date.parse(b.completed_at ?? b.scheduled_for) - Date.parse(a.completed_at ?? a.scheduled_for))

  if (!loaded) return <p className="cl-muted">Loading brief…</p>
  if (!woman) return <div className="cl-card">Not found, or not one of your patients. <Link to="/clinician">Back to queue</Link></div>

  return (
    <div className="cl-stack">
      <div>
        <Link to="/clinician" className="cl-back">← Queue</Link>
        <h2 className="cl-name">
          {woman.first_name} <span className="cl-muted cl-small">{woman.pseudonym}</span>
        </h2>
        <p className="cl-muted cl-small" style={{ margin: 0 }}>
          Baby {woman.baby_weeks} weeks · GP {ownerLabel(profiles, woman.gp_id, me)} · HV {ownerLabel(profiles, woman.hv_id, me)}
        </p>
      </div>

      {flags.length === 0 && <div className="cl-card cl-muted">No open flag.</div>}
      {flags.map((f) => (
        <FlagCard key={f.id} flag={f} me={me} profiles={profiles} nowMs={nowMs} onClosed={(id) => setFlags((fs) => fs.filter((x) => x.id !== id))} />
      ))}

      <div className="cl-brief">
        <div className="cl-stack">
          <div className="cl-stats">
            <div className="cl-stat">
              <b>{total}</b>
              <span>
                Rolling 7-day total · {latest.size}/10 answered
                <br />
                Baseline {woman.baseline_total ?? 'not set'}
              </span>
            </div>
            <div className="cl-stat">
              <b>{count('completed')}</b>
              <span>
                Check-ins completed
                <br />
                {count('missed')} missed · {count('pending')} pending
              </span>
            </div>
            <div className="cl-stat">
              <b>
                {pastClasses.filter((a) => a.attended).length}/{pastClasses.length}
              </b>
              <span>
                Classes attended
                <br />
                {woman.group_label ?? 'No group'}
              </span>
            </div>
          </div>

          <section className="cl-card">
            <h3>Last 7 days (168 h) · latest answer per item · {latest.size}/10 answered</h3>
            <div className="cl-table-wrap">
              <table className="cl-grid">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>EPDS item</th>
                    <th>Her answer</th>
                    <th className="v">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {EPDS_ITEMS.map((it) => {
                    const a = latest.get(it.no)
                    const opt = a && it.options.find((o) => o.value === a.value)
                    return (
                      <tr key={it.no} className={a ? '' : 'is-empty'}>
                        <td className="n">{it.no}</td>
                        <td>{it.text}</td>
                        <td>
                          {a ? (
                            <>
                              {opt?.label ?? '—'}
                              <span className="cl-muted cl-small"> · {fmtDay(a.answered_at)}</span>
                            </>
                          ) : (
                            <span className="cl-muted">Not answered in window</span>
                          )}
                        </td>
                        <td className="v">{a ? a.value : ''}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="cl-card">
            <h3>Check-ins</h3>
            {statuses.length === 0 ? (
              <p className="cl-muted">None scheduled.</p>
            ) : (
              <div className="cl-dots">
                {statuses.map(({ c, s }) => (
                  <span key={c.id} className={`cl-dot ${s}`}>
                    {fmtDay(c.scheduled_for)} · {s}
                  </span>
                ))}
              </div>
            )}
            <h3 style={{ marginTop: 16 }}>Classes</h3>
            {attendance.length === 0 ? (
              <p className="cl-muted">No sessions recorded.</p>
            ) : (
              <div className="cl-dots">
                {attendance.map((a) => (
                  <span key={a.id} className={`cl-dot ${a.attended ? 'completed' : 'missed'}`}>
                    {fmtDay(a.session_date)} · {a.attended ? 'attended' : 'not attended'}
                  </span>
                ))}
              </div>
            )}
          </section>

          <section className="cl-card">
            <h3>Her notes (verbatim)</h3>
            {notes.length === 0 ? (
              <p className="cl-muted">No notes.</p>
            ) : (
              <div className="cl-stack">
                {notes.map((c) => (
                  <blockquote key={c.id} className="cl-quote">
                    “{c.note_text}”<small>{fmtDateTime(c.completed_at ?? c.scheduled_for)}</small>
                  </blockquote>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="cl-card cl-ai" aria-label="AI summary of data — not a clinical opinion">
          <h3>AI summary of data — not a clinical opinion</h3>
          <p className={summary === SUMMARY_UNAVAILABLE ? 'cl-muted' : ''}>{summary ?? 'Loading…'}</p>
          <p className="cl-muted cl-small">Generated from the data on this page. It does not set, order or change any flag.</p>
        </aside>
      </div>
    </div>
  )
}

function FlagCard({
  flag,
  me,
  profiles,
  nowMs,
  onClosed,
}: {
  flag: Flag
  me: string
  profiles: Record<string, Profile>
  nowMs: number
  onClosed: (id: string) => void
}) {
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState<DecisionKind | null>(null)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const picked = DECISIONS.find((d) => d.kind === choice)
  const overdue = Date.parse(flag.due_at) < nowMs
  const reasonMissing = !!picked?.needsReason && !reason.trim()

  async function confirm() {
    if (!picked || reasonMissing) return
    setSaving(true)
    setError(null)
    const why = reason.trim() || null
    const dec = await supabase
      .from('decisions')
      .insert({ flag_id: flag.id, woman_id: flag.woman_id, clinician_id: me, decision: picked.kind, reason: why })
      .select('id')
      .single()
    if (dec.error) {
      setSaving(false)
      return setError(dec.error.message)
    }
    const upd = await supabase.from('flags').update({ status: 'closed' }).eq('id', flag.id)
    if (upd.error) {
      setSaving(false)
      return setError(`Decision saved, but the flag could not be closed: ${upd.error.message}`)
    }
    await supabase.from('audit_log').insert({
      actor_id: me,
      woman_id: flag.woman_id,
      event: 'decision.made',
      entity: 'decisions',
      entity_id: dec.data.id,
      detail: { flag_id: flag.id, rule_id: flag.rule_id, rule_version: flag.rule_version, decision: picked.kind, reason: why },
    })
    setSaving(false)
    onClosed(flag.id)
    nav('/clinician')
  }

  return (
    <section className={`cl-card cl-flag ${flag.level}`}>
      <div className="cl-flag-head">
        <span className={`cl-tag ${flag.level}`}>{flag.level}</span>
        <strong>{flag.reason}</strong>
      </div>
      <div className="cl-flag-meta">
        <p className="cl-muted cl-small" style={{ margin: 0 }}>
          Rule {flag.rule_id} · version {flag.rule_version} · owner {ownerLabel(profiles, flag.owner_id, me)} ·{' '}
          <span className={overdue ? 'cl-overdue' : ''}>{overdue ? `overdue (due ${fmtDateTime(flag.due_at)})` : `due ${fmtDateTime(flag.due_at)}`}</span>
        </p>
        {!open && (
          <button type="button" className="cl-btn" onClick={() => setOpen(true)}>
            Record decision
          </button>
        )}
      </div>
      {open && (
      <div className="cl-decide">
        <div className="cl-decide-group">
          <span className="cl-label">Primary care</span>
          {DECISIONS.filter((d) => !d.needsReason).map((d) => (
            <button key={d.kind} type="button" className={`cl-btn ${choice === d.kind ? 'is-picked' : ''}`} aria-pressed={choice === d.kind} onClick={() => setChoice(d.kind)}>
              {d.label}
            </button>
          ))}
        </div>
        <div className="cl-decide-group">
          <span className="cl-label">Reason required</span>
          {DECISIONS.filter((d) => d.needsReason).map((d) => (
            <button key={d.kind} type="button" className={`cl-btn ${choice === d.kind ? 'is-picked' : ''}`} aria-pressed={choice === d.kind} onClick={() => setChoice(d.kind)}>
              {d.label}
            </button>
          ))}
        </div>
      </div>
      )}
      {open && picked && (
        <div className="cl-confirm">
          <label className="cl-label" htmlFor={`why-${flag.id}`}>
            {picked.needsReason ? 'Reason (required)' : 'Note (optional)'}
          </label>
          <textarea id={`why-${flag.id}`} className="cl-input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          <button type="button" className="cl-btn primary" disabled={saving || reasonMissing} onClick={confirm}>
            {saving ? 'Saving…' : `Confirm: ${picked.label} and close flag`}
          </button>
        </div>
      )}
      {error && <div className="cl-error">{error}</div>}
    </section>
  )
}

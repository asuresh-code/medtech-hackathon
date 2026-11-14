// Queue: every open flag for my patients (RLS scopes to women where I'm GP or HV — not filtered by owner,
// so HV-owned drift flags stay visible to the GP). Order is fixed: urgent → review → drift, then due_at.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { now as demoNow } from '../lib/demoClock'
import type { Flag, Profile } from '../shared/types'
import { LEVEL_ORDER, fmtDateTime, loadProfiles, ownerLabel, runSweep, type WomanLite } from './data'

type FlagRow = Flag & { women: { first_name: string; pseudonym: string } | null }

export function Queue({ me }: { me: string }) {
  const [flags, setFlags] = useState<FlagRow[] | null>(null)
  const [women, setWomen] = useState<WomanLite[]>([])
  const [profiles, setProfiles] = useState<Record<string, Profile>>({})
  const [error, setError] = useState<string | null>(null)
  const nowMs = demoNow().getTime()

  useEffect(() => {
    let alive = true
    ;(async () => {
      await runSweep(demoNow().toISOString())
      const [f, w, p] = await Promise.all([
        supabase.from('flags').select('*, women(first_name, pseudonym)').eq('status', 'open'),
        supabase.from('women').select('id, first_name, pseudonym, baby_weeks, gp_id, hv_id, baseline_total, group_label').order('first_name'),
        loadProfiles(),
      ])
      if (!alive) return
      if (f.error || w.error) setError((f.error ?? w.error)!.message)
      setFlags((f.data ?? []) as FlagRow[])
      setWomen((w.data ?? []) as WomanLite[])
      setProfiles(p)
    })()
    return () => {
      alive = false
    }
  }, [])

  const sorted = useMemo(
    () => [...(flags ?? [])].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || Date.parse(a.due_at) - Date.parse(b.due_at)),
    [flags],
  )
  const flagged = new Set(sorted.map((f) => f.woman_id))
  const quiet = women.filter((w) => !flagged.has(w.id))

  if (flags === null) return <p className="cl-muted">Loading queue…</p>

  return (
    <div className="cl-stack">
      <section>
        <div className="cl-section-head">
          <h2>Open flags</h2>
          <span className="cl-muted cl-small">{sorted.length} open · urgent → review → drift, then due time</span>
        </div>
        {error && <div className="cl-error">{error}</div>}
        {sorted.length === 0 ? (
          <div className="cl-card cl-muted">No open flags for your patients.</div>
        ) : (
          <ul className="cl-queue">
            {sorted.map((f) => {
              const overdue = Date.parse(f.due_at) < nowMs
              return (
                <li key={f.id}>
                  <Link to={`/clinician/w/${f.woman_id}`} className={`cl-row ${overdue ? 'is-overdue' : ''}`}>
                    <span className="cl-who">
                      <strong>{f.women?.first_name ?? 'Unknown'}</strong>
                      <span className="cl-muted cl-small">{f.women?.pseudonym}</span>
                    </span>
                    <span className={`cl-tag ${f.level}`}>{f.level}</span>
                    <span className="cl-reason">{f.reason}</span>
                    <span className="cl-meta">
                      <span>{ownerLabel(profiles, f.owner_id, me)}</span>
                      <span className={overdue ? 'cl-overdue' : ''}>{overdue ? `Overdue · was due ${fmtDateTime(f.due_at)}` : `Due ${fmtDateTime(f.due_at)}`}</span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section>
        <div className="cl-section-head">
          <h2>No open flag</h2>
          <span className="cl-muted cl-small">{quiet.length} women</span>
        </div>
        {quiet.length === 0 ? (
          <div className="cl-card cl-muted">{women.length === 0 ? 'You have no patients.' : 'Every patient has an open flag.'}</div>
        ) : (
          <ul className="cl-queue">
            {quiet.map((w) => (
              <li key={w.id}>
                <Link to={`/clinician/w/${w.id}`} className="cl-row cl-row-quiet">
                  <span className="cl-who">
                    <strong>{w.first_name}</strong>
                    <span className="cl-muted cl-small">{w.pseudonym}</span>
                  </span>
                  <span className="cl-muted cl-small">Baby {w.baby_weeks} weeks</span>
                  <span className="cl-meta">
                    <span>GP {ownerLabel(profiles, w.gp_id, me)}</span>
                    <span>HV {ownerLabel(profiles, w.hv_id, me)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

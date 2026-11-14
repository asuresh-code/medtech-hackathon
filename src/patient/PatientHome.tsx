import { Link, Navigate } from 'react-router-dom'
import { advanceDays, demoOffsetDays, now, resetDemoClock } from '../lib/demoClock'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { friendlyWhen, line } from './copy'
import { PatientLayout } from './PatientLayout'
import { usePatientHome, useSession } from './usePatient'

const DEMO_CONTROLS = import.meta.env.VITE_DEMO_CONTROLS !== 'false'

export function PatientHome() {
  const { session, loading: sessionLoading } = useSession()
  const { me, due, next, loading, error, refresh } = usePatientHome(Boolean(session))

  if (!supabaseConfigured) {
    return (
      <PatientLayout>
        <h1>Setup needed</h1>
        <p>Copy .env.example to .env.local and add the Supabase keys, then restart the dev server.</p>
      </PatientLayout>
    )
  }
  if (sessionLoading) return <PatientLayout>{null}</PatientLayout>
  if (!session) return <Navigate to="/join" replace />
  // Signed in but not a patient (e.g. a clinician) → clinician app.
  if (!loading && !me && !error) return <Navigate to="/clinician" replace />

  return (
    <PatientLayout>
      {loading ? (
        <p className="p-muted">Loading…</p>
      ) : error ? (
        <p role="alert" className="p-error">
          Couldn't load. Check your connection and try again.
        </p>
      ) : (
        <>
          <h1>Hi {me?.first_name}</h1>
          {due ? (
            <>
              <p data-testid="home-status">{line('homeDue')}</p>
              <Link to={`/checkin/${due.id}`} className="p-btn p-btn-primary p-btn-big" data-testid="start-checkin">
                Start check-in
              </Link>
            </>
          ) : (
            <p data-testid="home-status">
              {next ? line('homeNext', { when: friendlyWhen(next.scheduled_for, now()) }) : line('homeNone')}
            </p>
          )}
          {me?.group_label && <p className="p-muted">{me.group_label}</p>}
        </>
      )}

      <div className="p-home-footer">
        <button type="button" className="p-link-btn" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>

      {DEMO_CONTROLS && (
        <div className="p-demo" aria-label="Demo controls">
          <span>Demo clock {demoOffsetDays() ? `+${demoOffsetDays()}d` : ''}</span>
          <button
            type="button"
            onClick={() => {
              advanceDays(2)
              void refresh()
            }}
            data-testid="demo-advance"
          >
            ⏩ +2 days
          </button>
          <button
            type="button"
            onClick={() => {
              resetDemoClock()
              void refresh()
            }}
          >
            Reset
          </button>
        </div>
      )}
    </PatientLayout>
  )
}

import { Link, Navigate } from 'react-router-dom'
import { now } from '../lib/demoClock'
import { unlockAudio } from '../lib/speech'
import { supabaseConfigured } from '../lib/supabase'
import { friendlyWhen, line } from './copy'
import { ClockIcon, MicIcon, MoonMark } from './Icons'
import { PatientLayout } from './PatientLayout'
import { routineFor } from './routine'
import { greeting, usePatientHome, useSession } from './usePatient'

export function PatientHome() {
  const { session, loading: sessionLoading } = useSession()
  const { me, due, next, loading, error } = usePatientHome(Boolean(session))

  if (!supabaseConfigured) {
    return (
      <PatientLayout tabs={false}>
        <h1 className="p-title">Setup needed</h1>
        <p>Copy .env.example to .env.local and add the Supabase keys, then restart the dev server.</p>
      </PatientLayout>
    )
  }
  if (sessionLoading) return <PatientLayout>{null}</PatientLayout>
  if (!session) return <Navigate to="/join" replace />
  if (!loading && !me && !error) return <Navigate to="/clinician" replace />

  const count = due?.items.length ?? 0
  const routine = routineFor(me?.reminder_hour)

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
          <p className="p-eyebrow">{greeting(now())}</p>
          <h1 className="p-title">{me?.first_name}</h1>

          {due ? (
            <section className="p-card p-hero" aria-labelledby="today-title">
              <MoonMark className="p-hero-moon" />
              <p className="p-eyebrow">Today's check-in</p>
              <h2 id="today-title" className="p-title" style={{ fontSize: 28 }} data-testid="home-status">
                {count} quick question{count === 1 ? '' : 's'}
              </h2>
              <div className="p-meta">
                <span className="p-chip">
                  <ClockIcon size={16} /> About a minute
                </span>
                <span className="p-chip">
                  <MicIcon size={16} /> Voice or tap
                </span>
              </div>
              <div className="p-stack">
                <Link to={`/checkin/${due.id}`} className="p-btn p-btn-primary p-btn-big" data-testid="start-checkin">
                  Start
                </Link>
                <Link to={`/checkin/${due.id}?voice=1`} className="p-btn p-btn-soft" data-testid="start-voice" onClick={() => unlockAudio()}>
                  <MicIcon size={20} /> Talk me through it
                </Link>
              </div>
            </section>
          ) : (
            <section className="p-card p-hero">
              <MoonMark className="p-hero-moon" />
              <p className="p-eyebrow">Check-ins</p>
              <h2 className="p-title" style={{ fontSize: 26 }} data-testid="home-status">
                {line('homeNone')}
              </h2>
              {next && <p className="p-lead">{line('homeNext', { when: friendlyWhen(next.scheduled_for, now()) })}</p>}
              {routine && <p className="p-muted p-small">Your moment: {routine.label.toLowerCase()}.</p>}
            </section>
          )}

          {(me?.hv_name || me?.gp_name) && (
            <section className="p-card" aria-label="Your care team">
              <p className="p-eyebrow">Who reads your check-ins</p>
              <div className="p-stack">
                {me?.hv_name && (
                  <div className="p-person">
                    <span className="p-avatar">{me.hv_name[0]}</span>
                    <div>
                      <strong>{me.hv_name}</strong>
                      <div className="p-muted p-small">Your health visitor</div>
                    </div>
                  </div>
                )}
                {me?.gp_name && (
                  <div className="p-person">
                    <span className="p-avatar">{me.gp_name.replace(/^Dr\s+/i, '')[0]}</span>
                    <div>
                      <strong>{me.gp_name}</strong>
                      <div className="p-muted p-small">Your GP</div>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {me?.group_label && (
            <section className="p-card">
              <p className="p-eyebrow">This week</p>
              <p style={{ margin: 0 }}>{me.group_label}</p>
            </section>
          )}

          {!routine && (
            <section className="p-card">
              <p className="p-eyebrow">Make it easy</p>
              <p>{line('routinePrompt')}</p>
              <Link to="/settings" className="p-btn p-btn-soft p-btn-block">
                Choose a moment
              </Link>
            </section>
          )}
        </>
      )}
    </PatientLayout>
  )
}

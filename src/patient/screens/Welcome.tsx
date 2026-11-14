import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { enablePush } from '../../lib/push'
import { line } from '../copy'
import { BellIcon, MoonMark } from '../Icons'
import { PatientLayout } from '../PatientLayout'
import { usePatientMe, useSession, type PatientMe } from '../usePatient'
import { RoutinePicker, saveRoutine } from './Settings'

// First run, after the in-person setup: who reads her answers (supportive accountability),
// an if-then plan anchored to her routine (implementation intention), and optional reminders.

export function CareTeam({ me }: { me: PatientMe | null }) {
  if (!me?.hv_name && !me?.gp_name) return null
  return (
    <>
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
    </>
  )
}

export function Welcome() {
  const { session } = useSession()
  const { me, refresh } = usePatientMe(Boolean(session))
  const [step, setStep] = useState(0)
  const navigate = useNavigate()
  const done = () => navigate('/', { replace: true })

  return (
    <PatientLayout tabs={false}>
      {step === 0 && (
        <section className="p-stack">
          <MoonMark size={44} style={{ color: 'var(--accent)' }} />
          <h1 className="p-title">Welcome{me ? `, ${me.first_name}` : ''}</h1>
          <p className="p-lead">{line('aboutAluna')}</p>
          <div className="p-card p-stack">
            <p className="p-eyebrow" style={{ margin: 0 }}>
              Who reads your check-ins
            </p>
            <CareTeam me={me} />
            <p className="p-small p-muted" style={{ margin: 0 }}>
              A few short questions every couple of days. About a minute each time.
            </p>
          </div>
          <button type="button" className="p-btn p-btn-primary p-btn-big" onClick={() => setStep(1)} data-testid="welcome-next">
            Continue
          </button>
        </section>
      )}

      {step === 1 && (
        <section className="p-stack">
          <p className="p-eyebrow">Step 2 of 3</p>
          <h1 className="p-title">{line('routinePrompt')}</h1>
          <p className="p-muted">Pick a moment that already happens most days. You can change it any time.</p>
          <RoutinePicker
            value={me?.reminder_hour}
            onPick={async (h, l) => {
              await saveRoutine(h, l)
              await refresh()
              setStep(2)
            }}
          />
          <button type="button" className="p-btn p-btn-quiet" onClick={() => setStep(2)} data-testid="welcome-skip">
            Skip for now
          </button>
        </section>
      )}

      {step === 2 && (
        <section className="p-stack">
          <p className="p-eyebrow">Step 3 of 3</p>
          <BellIcon size={40} style={{ color: 'var(--accent)' }} />
          <h1 className="p-title">A gentle reminder?</h1>
          <p className="p-lead">{line('notifyPrompt')}</p>
          <button
            type="button"
            className="p-btn p-btn-primary p-btn-big"
            onClick={async () => {
              try {
                if (me) await enablePush(me.id)
              } catch {
                /* not supported on this device — fine */
              }
              done()
            }}
          >
            Turn on reminders
          </button>
          <button type="button" className="p-btn p-btn-quiet" onClick={done} data-testid="welcome-done">
            Not now
          </button>
        </section>
      )}
    </PatientLayout>
  )
}

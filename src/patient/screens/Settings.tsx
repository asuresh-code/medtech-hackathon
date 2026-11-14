import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { advanceDays, demoOffsetDays, resetDemoClock } from '../../lib/demoClock'
import { disablePush, enablePush, pushState, sendTestPush, type PushState } from '../../lib/push'
import { speak, unlockAudio } from '../../lib/speech'
import { supabase } from '../../lib/supabase'
import { line } from '../copy'
import { PatientLayout } from '../PatientLayout'
import { ROUTINES } from '../routine'
import { currentTheme, setTheme } from '../theme'
import { getAutoRead, setAutoRead, usePatientMe, useSession } from '../usePatient'

const DEMO_CONTROLS = import.meta.env.VITE_DEMO_CONTROLS !== 'false'

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className="p-switch" onClick={() => onChange(!on)} />
  )
}

export function RoutinePicker(props: { value: number | null | undefined; onPick: (hour: number, label: string) => void }) {
  return (
    <div className="p-choice-grid">
      {ROUTINES.map((r) => (
        <button
          key={r.hour}
          type="button"
          className={`p-choice ${props.value === r.hour ? 'is-selected' : ''}`}
          aria-pressed={props.value === r.hour}
          onClick={() => props.onPick(r.hour, r.label)}
        >
          {r.label}
          <small>{r.hint}</small>
        </button>
      ))}
    </div>
  )
}

export async function saveRoutine(hour: number, label: string) {
  await supabase.rpc('set_my_reminder', { p_hour: hour, p_label: label })
}

export function Settings() {
  const { session, loading: sLoading } = useSession()
  const { me, refresh } = usePatientMe(Boolean(session))
  const [push, setPush] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [autoRead, setAutoReadState] = useState(getAutoRead())
  const [night, setNight] = useState(currentTheme() === 'night')
  const [, force] = useState(0)

  useEffect(() => {
    void pushState().then(setPush)
  }, [])

  if (!sLoading && !session) return <Navigate to="/join" replace />

  async function togglePush(on: boolean) {
    if (!me) return
    setBusy(true)
    setMsg(null)
    try {
      setPush(on ? await enablePush(me.id) : await disablePush())
    } catch {
      setMsg('Could not turn on reminders on this device.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <PatientLayout>
      <p className="p-eyebrow">Settings</p>
      <h1 className="p-title">Make it work for you</h1>

      <section className="p-card" aria-labelledby="moment">
        <h2 id="moment" style={{ fontSize: 20 }}>
          Your check-in moment
        </h2>
        <p className="p-muted p-small">{line('routinePrompt')}</p>
        <RoutinePicker
          value={me?.reminder_hour}
          onPick={async (h, l) => {
            await saveRoutine(h, l)
            await refresh()
          }}
        />
      </section>

      <section className="p-card" aria-labelledby="reminders">
        <div className="p-setting">
          <div>
            <h2 id="reminders" style={{ fontSize: 20, margin: 0 }}>
              Gentle reminders
            </h2>
            <p className="p-muted p-small" style={{ margin: '4px 0 0' }}>
              {line('notifyPrompt')}
            </p>
          </div>
          {(push === 'on' || push === 'off') && (
            <Switch on={push === 'on'} onChange={(v) => !busy && void togglePush(v)} label="Gentle reminders" />
          )}
        </div>
        {push === 'needs-install' && (
          <p className="p-small">
            On iPhone, reminders work once Aluna is on your Home Screen: tap <strong>Share</strong>, then{' '}
            <strong>Add to Home Screen</strong>, and open Aluna from there.
          </p>
        )}
        {push === 'denied' && <p className="p-small">Notifications are blocked for Aluna in your phone's settings.</p>}
        {push === 'unsupported' && <p className="p-small p-muted">This browser can't show reminders.</p>}
        {push === 'on' && (
          <button
            type="button"
            className="p-btn p-btn-soft p-btn-block"
            onClick={async () => setMsg((await sendTestPush()) ? 'Test reminder sent.' : 'Could not send a test reminder.')}
          >
            Send a test reminder
          </button>
        )}
        {msg && <p className="p-small p-muted">{msg}</p>}
      </section>

      <section className="p-card">
        <div className="p-setting">
          <div>
            <strong>Read questions aloud</strong>
            <div className="p-muted p-small">Each question is spoken when it appears.</div>
          </div>
          <Switch
            on={autoRead}
            label="Read questions aloud"
            onChange={(v) => {
              setAutoRead(v)
              setAutoReadState(v)
              if (v) {
                unlockAudio()
                void speak(line('noteThanks'))
              }
            }}
          />
        </div>
        <div className="p-setting">
          <div>
            <strong>Night mode</strong>
            <div className="p-muted p-small">Warm, dim colours for late feeds.</div>
          </div>
          <Switch
            on={night}
            label="Night mode"
            onChange={(v) => {
              setTheme(v ? 'night' : 'day')
              setNight(v)
            }}
          />
        </div>
      </section>

      <section className="p-card">
        <p className="p-eyebrow">About Aluna</p>
        <p>{line('aboutAluna')}</p>
        <button type="button" className="p-link-btn" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </section>

      {DEMO_CONTROLS && (
        <div className="p-demo" aria-label="Demo controls" style={{ marginTop: 14 }}>
          <span>Demo clock {demoOffsetDays() ? `+${demoOffsetDays()} days` : ''}</span>
          <button
            type="button"
            data-testid="demo-advance"
            onClick={() => {
              advanceDays(2)
              force((n) => n + 1)
            }}
          >
            ⏩ +2 days
          </button>
          <button
            type="button"
            onClick={() => {
              resetDemoClock()
              force((n) => n + 1)
            }}
          >
            Reset
          </button>
        </div>
      )}
    </PatientLayout>
  )
}

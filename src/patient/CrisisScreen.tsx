import { Link } from 'react-router-dom'
import { PatientLayout } from './PatientLayout'

// Bundled with the app and cached by the service worker, so it works with no network.
// Support information only — never a score, label or verdict.
// TODO(Esme): approve wording; confirm local crisis line for the demo area.

export function CrisisContacts({ afterDisclosure = false }: { afterDisclosure?: boolean }) {
  return (
    <section className="p-crisis" aria-labelledby="crisis-title" data-testid="crisis-screen">
      <h1 id="crisis-title">{afterDisclosure ? 'Thank you for telling us.' : 'Help is available now'}</h1>
      {afterDisclosure && <p>Your practice team can see today's answers.</p>}
      <p>If you might act on thoughts of harming yourself or someone else, or you are in danger now:</p>

      <a className="p-crisis-btn p-crisis-primary" href="tel:999">
        Call 999
        <small>Emergency — if you are in immediate danger</small>
      </a>
      <a className="p-crisis-btn" href="tel:116123">
        Samaritans · 116 123
        <small>Free, any time, day or night</small>
      </a>
      <a className="p-crisis-btn" href="tel:111">
        NHS 111 · choose the mental health option
        <small>Urgent mental health help in England</small>
      </a>
      <a className="p-crisis-btn" href="sms:85258?body=SHOUT">
        Text SHOUT to 85258
        <small>Free text support, any time</small>
      </a>
      <div className="p-crisis-btn p-crisis-static">
        Your GP practice
        <small>The number is on your practice card</small>
      </div>

      <p className="p-muted">Aluna is not an emergency service.</p>
    </section>
  )
}

export function CrisisScreen() {
  return (
    <PatientLayout hideHelp>
      <CrisisContacts />
      <Link to="/" className="p-btn p-btn-quiet">
        Back
      </Link>
    </PatientLayout>
  )
}

import { Link } from 'react-router-dom'
import { ChevronIcon } from './Icons'
import { PatientLayout } from './PatientLayout'

// Bundled with the app and cached by the service worker, so it works with no network.
// Support information only — never a score, label or verdict.
// TODO(Esme): approve wording; confirm the local crisis line for the demo area.

function Row({ href, title, sub, primary }: { href?: string; title: string; sub: string; primary?: boolean }) {
  const body = (
    <>
      <span>
        <strong>{title}</strong>
        <small>{sub}</small>
      </span>
      {href && <ChevronIcon size={20} />}
    </>
  )
  return href ? (
    <a className={`p-crisis-btn ${primary ? 'p-crisis-primary' : ''}`} href={href}>
      {body}
    </a>
  ) : (
    <div className="p-crisis-btn p-crisis-static">{body}</div>
  )
}

export function CrisisContacts({ afterDisclosure = false }: { afterDisclosure?: boolean }) {
  return (
    <section className="p-crisis" aria-labelledby="crisis-title" data-testid="crisis-screen">
      <p className="p-eyebrow">Support</p>
      <h1 id="crisis-title" className="p-title">
        {afterDisclosure ? 'Thank you for telling us.' : 'Help is available now'}
      </h1>
      {afterDisclosure && <p className="p-lead">Your practice team can see today's answers.</p>}
      <p>If you might act on thoughts of harming yourself or someone else, or you are in danger now:</p>
      <Row href="tel:999" title="Call 999" sub="Emergency — if you are in immediate danger" primary />
      <Row href="tel:116123" title="Samaritans · 116 123" sub="Free, any time, day or night" />
      <Row href="tel:111" title="NHS 111 · mental health option" sub="Urgent mental health help in England" />
      <Row href="sms:85258?body=SHOUT" title="Text SHOUT to 85258" sub="Free text support, any time" />
      <Row title="Your GP practice" sub="The number is on your practice card" />
      <p className="p-muted p-small">Aluna is not an emergency service.</p>
    </section>
  )
}

export function CrisisScreen() {
  return (
    <PatientLayout>
      <CrisisContacts />
      <Link to="/" className="p-btn p-btn-soft p-btn-block">
        Back
      </Link>
    </PatientLayout>
  )
}

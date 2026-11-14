// Clinician app (/clinician/*): sign-in → queue → one-page brief → decision; invite codes.
// Flags, levels, owners, due times and queue order come only from the deterministic engine.
import { useEffect, useState, type FormEvent } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { demoOffsetDays } from '../lib/demoClock'
import type { Profile } from '../shared/types'
import { Brief } from './Brief'
import { Invite } from './Invite'
import { Queue } from './Queue'
import './clinician.css'

const Badge = () => <span className="synthetic-badge">SYNTHETIC DATA</span>

export default function ClinicianApp() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return setProfile(undefined)
    setProfile(undefined)
    supabase
      .from('profiles')
      .select('id, role, first_name, job_title')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setProfile((data as Profile | null) ?? null))
  }, [session])

  const signOut = () => supabase.auth.signOut()

  let body
  if (session === undefined || (session && profile === undefined)) body = <p className="cl-muted">Loading…</p>
  else if (!session) body = <SignIn />
  else if (!profile || profile.role !== 'clinician')
    body = (
      <div className="cl-card cl-narrow cl-stack">
        <h2>Not a clinician account</h2>
        <p className="cl-muted">You are signed in as {session.user.email ?? 'a patient account'}. Sign out to use a clinician login.</p>
        <div>
          <button type="button" className="cl-btn" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
    )
  else
    body = (
      <>
        <header className="cl-header">
          <div className="cl-brand">
            Aluna <span className="cl-muted">clinician</span>
          </div>
          <nav className="cl-nav">
            <NavLink to="/clinician" end className="cl-navlink">
              Queue
            </NavLink>
            <NavLink to="/clinician/invite" className="cl-navlink">
              Invite
            </NavLink>
          </nav>
          <div className="cl-account">
            <span className="cl-small">
              {profile.first_name}
              {profile.job_title ? ` · ${profile.job_title}` : ''}
            </span>
            <button type="button" className="cl-btn cl-btn-quiet" onClick={signOut}>
              Sign out
            </button>
          </div>
        </header>
        {demoOffsetDays() !== 0 && <p className="cl-demo cl-small">Demo clock: +{demoOffsetDays()} days</p>}
        <Routes>
          <Route path="w/:womanId" element={<Brief me={session.user.id} />} />
          <Route path="invite" element={<Invite me={session.user.id} />} />
          <Route path="*" element={<Queue me={session.user.id} />} />
        </Routes>
      </>
    )

  return (
    <div className="cl">
      <Badge />
      {body}
    </div>
  )
}

function SignIn() {
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
    <form className="cl-card cl-narrow cl-stack" onSubmit={submit}>
      <div>
        <div className="cl-brand">Aluna</div>
        <p className="cl-muted" style={{ margin: 0 }}>
          Clinician sign-in
        </p>
      </div>
      <div>
        <label className="cl-label" htmlFor="cl-email">
          Email
        </label>
        <input id="cl-email" className="cl-input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div>
        <label className="cl-label" htmlFor="cl-password">
          Password
        </label>
        <input id="cl-password" className="cl-input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      {error && <div className="cl-error">{error}</div>}
      <button type="submit" className="cl-btn primary" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { JoinRequest, JoinResponse } from '../shared/types'
import { line } from './copy'
import { MoonMark } from './Icons'
import { PatientLayout } from './PatientLayout'

// Setup happens at an in-person first session: the clinician shows a QR code / 6-digit code.
// The QR opens /join?code=123456 and signs her in automatically. No sign-up screen, no password.

export function JoinScreen() {
  const [params] = useSearchParams()
  const [code, setCode] = useState(params.get('code') ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const autoTried = useRef(false)

  async function join(c: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: c } satisfies JoinRequest),
      })
      if (!res.ok) throw new Error(res.status === 404 ? 'That code has expired or was already used.' : 'Could not sign in.')
      const { token_hash } = (await res.json()) as JoinResponse
      const { error: otpErr } = await supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })
      if (otpErr) throw otpErr
      navigate('/welcome', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    const c = params.get('code')
    if (c && /^\d{6}$/.test(c) && !autoTried.current) {
      autoTried.current = true
      void join(c)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (/^\d{6}$/.test(code)) void join(code)
    else setError('Please enter the 6-digit code from your practice.')
  }

  return (
    <PatientLayout tabs={false}>
      <MoonMark size={44} style={{ color: 'var(--accent)' }} />
      <h1 className="p-title">Welcome to Aluna</h1>
      <p className="p-lead">{line('aboutAluna')}</p>
      <form onSubmit={onSubmit} className="p-card p-stack" style={{ margin: '20px 0' }}>
        <label htmlFor="code">Your 6-digit code</label>
        <input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className="p-code-input"
          data-testid="join-code"
        />
        {error && (
          <p role="alert" className="p-error">
            {error}
          </p>
        )}
        <button type="submit" className="p-btn p-btn-primary p-btn-big" disabled={busy}>
          {busy ? 'Signing in…' : 'Continue'}
        </button>
      </form>
      <p className="p-muted">Your practice team will have given you this code at your first session.</p>
    </PatientLayout>
  )
}

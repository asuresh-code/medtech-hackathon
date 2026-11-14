// Invite: one-time 6-digit code for one of my patients + QR to /join?code=…
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtDateTime, type WomanLite } from './data'
import { QrCode } from './QrCode'

function randomCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000
  return String(n).padStart(6, '0')
}

export function Invite({ me }: { me: string }) {
  const [women, setWomen] = useState<WomanLite[] | null>(null)
  const [womanId, setWomanId] = useState('')
  const [invite, setInvite] = useState<{ code: string; expires_at: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('women')
      .select('id, first_name, pseudonym, baby_weeks, gp_id, hv_id, baseline_total, group_label')
      .order('first_name')
      .then(({ data }) => {
        const list = (data ?? []) as WomanLite[]
        setWomen(list)
        if (list[0]) setWomanId(list[0].id)
      })
  }, [])

  async function create() {
    if (!womanId) return
    setBusy(true)
    setError(null)
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await supabase
        .from('invite_codes')
        .insert({ code: randomCode(), woman_id: womanId, created_by: me })
        .select('code, expires_at')
        .single()
      if (!error && data) {
        const w = women?.find((x) => x.id === womanId)
        setInvite({ code: data.code as string, expires_at: data.expires_at as string, name: w ? `${w.first_name} (${w.pseudonym})` : '' })
        setBusy(false)
        return
      }
      if (error?.code !== '23505') {
        setError(error?.message ?? 'Could not create invite')
        break
      }
    }
    setBusy(false)
  }

  const url = invite ? `${window.location.origin}/join?code=${invite.code}` : ''

  return (
    <div className="cl-stack">
      <h2>Invite a patient</h2>
      <div className="cl-card cl-stack">
        {women === null ? (
          <p className="cl-muted">Loading…</p>
        ) : women.length === 0 ? (
          <p className="cl-muted">You have no patients to invite.</p>
        ) : (
          <>
            <label className="cl-label" htmlFor="cl-invite-woman">
              Patient
            </label>
            <select id="cl-invite-woman" className="cl-input" value={womanId} onChange={(e) => setWomanId(e.target.value)}>
              {women.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.first_name} · {w.pseudonym}
                </option>
              ))}
            </select>
            <div>
              <button type="button" className="cl-btn primary" onClick={create} disabled={busy}>
                {busy ? 'Creating…' : 'Create invite code'}
              </button>
            </div>
          </>
        )}
        {error && <div className="cl-error">{error}</div>}
      </div>
      {invite && (
        <div className="cl-card cl-invite">
          <div>
            <p className="cl-muted cl-small" style={{ margin: 0 }}>
              One-time code for {invite.name}
            </p>
            <div className="cl-code" aria-label={`Code ${invite.code.split('').join(' ')}`}>
              {invite.code.slice(0, 3)} {invite.code.slice(3)}
            </div>
            <p className="cl-muted cl-small">Expires {fmtDateTime(invite.expires_at)}</p>
            <p className="cl-small cl-url">{url}</p>
          </div>
          <QrCode text={url} />
        </div>
      )}
    </div>
  )
}

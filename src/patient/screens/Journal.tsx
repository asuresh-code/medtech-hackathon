import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { getItem } from '../../shared/epds'
import type { ItemNo } from '../../shared/types'
import { line } from '../copy'
import { PatientLayout } from '../PatientLayout'
import { useSession } from '../usePatient'

// Her own record of what she shared: the words she chose and her notes.
// Deliberately NO totals, trends, charts or colours that could read as good/bad (basicbrief).

interface Entry {
  id: string
  completed_at: string
  note_text: string | null
  answers: { item_no: ItemNo; option_index: number }[]
}

export function Journal() {
  const { session, loading: sLoading } = useSession()
  const [entries, setEntries] = useState<Entry[] | null>(null)

  useEffect(() => {
    if (!session) return
    ;(async () => {
      const [{ data: cs }, { data: as }] = await Promise.all([
        supabase
          .from('checkins')
          .select('id, completed_at, note_text')
          .not('completed_at', 'is', null)
          .order('completed_at', { ascending: false })
          .limit(30),
        supabase.from('patient_answers').select('checkin_id, item_no, option_index'),
      ])
      setEntries(
        (cs ?? []).map((c) => ({
          ...(c as { id: string; completed_at: string; note_text: string | null }),
          answers: (as ?? [])
            .filter((a) => a.checkin_id === c.id)
            .sort((a, b) => a.item_no - b.item_no) as Entry['answers'],
        })),
      )
    })()
  }, [session])

  if (!sLoading && !session) return <Navigate to="/join" replace />

  return (
    <PatientLayout>
      <p className="p-eyebrow">Journal</p>
      <h1 className="p-title">What you've shared</h1>
      <p className="p-muted">{line('journalIntro')}</p>

      {entries === null ? (
        <p className="p-muted">Loading…</p>
      ) : entries.length === 0 ? (
        <div className="p-card" style={{ marginTop: 16 }}>
          <p style={{ margin: 0 }}>{line('journalEmpty')}</p>
        </div>
      ) : (
        entries.map((e) => (
          <section key={e.id} className="p-journal-day" data-testid="journal-entry">
            <h2 className="p-journal-date">
              {new Date(e.completed_at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h2>
            <div className="p-card">
              {e.answers.map((a) => {
                const item = getItem(a.item_no)
                return (
                  <div key={a.item_no} className="p-qa">
                    <p className="p-qa-q">{item.text}</p>
                    <p className="p-qa-a">{item.options[a.option_index]?.label}</p>
                  </div>
                )
              })}
              {e.note_text && <p className="p-quote">“{e.note_text}”</p>}
              <p className="p-muted p-small" style={{ margin: '10px 0 0' }}>
                Sent to your care team.
              </p>
            </div>
          </section>
        ))
      )}
    </PatientLayout>
  )
}

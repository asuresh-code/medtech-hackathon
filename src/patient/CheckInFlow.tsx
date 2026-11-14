import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { now } from '../lib/demoClock'
import { canListen, canSpeak, listen, matchSpokenAnswer, speak, stopSpeaking, type ListenHandle } from '../lib/speech'
import { supabase } from '../lib/supabase'
import { EPDS_STEM, getItem, isPositiveSelfHarm, SELF_HARM_ITEM, type EpdsItem } from '../shared/epds'
import { findSafetyPhrase } from '../shared/safety'
import type { CheckIn, ItemNo, ItemValue, ScoreRequest, ScoreResponse } from '../shared/types'
import { friendlyWhen, line } from './copy'
import { CrisisContacts } from './CrisisScreen'
import { PatientLayout } from './PatientLayout'

type Step =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'opener' }
  | { kind: 'item'; index: number }
  | { kind: 'confirm10'; index: number; value: ItemValue; label: string }
  | { kind: 'note' }
  | { kind: 'saving' }
  | { kind: 'close'; nextWhen: string | null }
  | { kind: 'crisis' }

interface Answer {
  value: ItemValue
  via: 'tap' | 'voice'
}

export function CheckInFlow() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [checkin, setCheckin] = useState<CheckIn | null>(null)
  const [firstName, setFirstName] = useState('')
  const [groupLabel, setGroupLabel] = useState<string | null>(null)
  const [step, setStep] = useState<Step>({ kind: 'loading' })
  const [answers, setAnswers] = useState<Partial<Record<ItemNo, Answer>>>({})
  const [note, setNote] = useState('')
  const saved = useRef<Set<ItemNo>>(new Set())

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [{ data: c, error }, { data: me }] = await Promise.all([
        supabase.from('checkins').select('*').eq('id', id!).maybeSingle(),
        supabase.from('patient_me').select('first_name, group_label').maybeSingle(),
      ])
      if (cancelled) return
      if (error || !c) return setStep({ kind: 'error', message: 'This check-in could not be found.' })
      if (c.completed_at) return navigate('/', { replace: true })
      setCheckin(c as CheckIn)
      setFirstName(me?.first_name ?? '')
      setGroupLabel(me?.group_label ?? null)
      setStep({ kind: 'opener' })
    })()
    return () => {
      cancelled = true
    }
  }, [id, navigate])

  const items: EpdsItem[] = useMemo(() => (checkin?.items ?? []).map((n) => getItem(n as ItemNo)), [checkin])

  async function saveAnswer(item: ItemNo, a: Answer) {
    if (!checkin || saved.current.has(item)) return
    const me = await supabase.from('patient_me').select('id').single()
    const { error } = await supabase.from('item_answers').insert({
      woman_id: me.data?.id,
      checkin_id: checkin.id,
      item_no: item,
      value: a.value,
      via: a.via,
      answered_at: now().toISOString(),
    })
    // 23505 = already saved (e.g. page reloaded) — fine.
    if (error && error.code !== '23505') throw error
    saved.current.add(item)
  }

  /** Mark complete and hand to the engine. The response never contains a flag or score. */
  async function finish(noteText: string | null): Promise<string | null> {
    if (!checkin) return null
    const { error } = await supabase
      .from('checkins')
      .update({ completed_at: now().toISOString(), note_text: noteText || null })
      .eq('id', checkin.id)
    if (error) throw error
    const { data } = await supabase.auth.getSession()
    try {
      const res = await fetch('/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: JSON.stringify({ checkin_id: checkin.id, now: now().toISOString() } satisfies ScoreRequest),
      })
      if (!res.ok) return null
      const body = (await res.json()) as ScoreResponse
      return body.next_checkin ? friendlyWhen(body.next_checkin.scheduled_for, now()) : null
    } catch {
      return null // scoring retries server-side later; never block her on it
    }
  }

  async function answerItem(index: number, value: ItemValue, via: 'tap' | 'voice') {
    const item = items[index]
    const a = { value, via }
    setAnswers((prev) => ({ ...prev, [item.no]: a }))
    try {
      await saveAnswer(item.no, a)
      if (isPositiveSelfHarm(item.no, value)) {
        // Urgent route: show crisis contacts straight away; save what we have.
        setStep({ kind: 'crisis' })
        await finish(null)
        return
      }
      setStep(index + 1 < items.length ? { kind: 'item', index: index + 1 } : { kind: 'note' })
    } catch {
      setStep({ kind: 'error', message: "Couldn't save. Check your connection and try again." })
    }
  }

  async function submitNote(text: string | null) {
    setStep({ kind: 'saving' })
    const disclosure = findSafetyPhrase(text)
    try {
      const nextWhen = await finish(text)
      setStep(disclosure ? { kind: 'crisis' } : { kind: 'close', nextWhen })
    } catch {
      setStep(disclosure ? { kind: 'crisis' } : { kind: 'error', message: "Couldn't save. Check your connection and try again." })
    }
  }

  const seed = checkin?.id ?? ''

  return (
    <PatientLayout>
      {step.kind === 'loading' && <p className="p-muted">Loading…</p>}

      {step.kind === 'error' && (
        <>
          <p role="alert" className="p-error">
            {step.message}
          </p>
          <Link to="/" className="p-btn p-btn-quiet">
            Back
          </Link>
        </>
      )}

      {step.kind === 'opener' && (
        <section className="p-card">
          <p className="p-lead" data-testid="opener">
            {line('opener', { name: firstName, count: items.length }, seed)}
          </p>
          <button type="button" className="p-btn p-btn-primary p-btn-big" onClick={() => setStep({ kind: 'item', index: 0 })}>
            Start
          </button>
          <Link to="/" className="p-btn p-btn-quiet">
            Not now
          </Link>
        </section>
      )}

      {step.kind === 'item' && items[step.index] && (
        <ItemScreen
          key={items[step.index].no}
          item={items[step.index]}
          position={step.index + 1}
          total={items.length}
          initial={answers[items[step.index].no]?.value}
          onAnswer={(value, via, label) => {
            const item = items[step.index]
            if (item.no === SELF_HARM_ITEM) setStep({ kind: 'confirm10', index: step.index, value, label })
            else void answerItem(step.index, value, via)
          }}
        />
      )}

      {step.kind === 'confirm10' && (
        <Confirm10
          label={step.label}
          onYes={(via) => void answerItem(step.index, step.value, via)}
          onChange={() => setStep({ kind: 'item', index: step.index })}
        />
      )}

      {step.kind === 'note' && <NoteScreen value={note} onChange={setNote} onDone={(t) => void submitNote(t)} />}

      {step.kind === 'saving' && <p className="p-muted">Saving…</p>}

      {step.kind === 'close' && (
        <section className="p-card" data-testid="close">
          <h1>{line('closeTitle', {}, seed)}</h1>
          {groupLabel && <p>{line('closeGroup', { group: groupLabel })}</p>}
          {step.nextWhen && <p>{line('closeNext', { when: step.nextWhen })}</p>}
          <p className="p-muted">{line('closeOutward', {}, seed)}</p>
          <Link to="/" className="p-btn p-btn-primary">
            Done
          </Link>
        </section>
      )}

      {step.kind === 'crisis' && (
        <>
          <CrisisContacts afterDisclosure />
          <Link to="/" className="p-btn p-btn-quiet">
            Close
          </Link>
        </>
      )}
    </PatientLayout>
  )
}

// ---------------- one EPDS item per screen ----------------

function ItemScreen(props: {
  item: EpdsItem
  position: number
  total: number
  initial?: ItemValue
  onAnswer: (value: ItemValue, via: 'tap' | 'voice', label: string) => void
}) {
  const { item, position, total, onAnswer } = props
  const isItem10 = item.no === SELF_HARM_ITEM
  // Item 10 never has a pre-selected answer.
  const [selected, setSelected] = useState<number | null>(
    isItem10 || props.initial === undefined ? null : item.options.findIndex((o) => o.value === props.initial),
  )
  const [via, setVia] = useState<'tap' | 'voice'>('tap')
  const [heard, setHeard] = useState<string | null>(null)
  const [listening, setListening] = useState(false)
  const handle = useRef<ListenHandle | null>(null)

  useEffect(() => () => {
    handle.current?.stop()
    stopSpeaking()
  }, [])

  function readAloud() {
    speak(`${EPDS_STEM} ${item.text}. ${item.options.map((o, i) => `Option ${i + 1}: ${o.label}.`).join(' ')}`)
  }

  function startListening() {
    stopSpeaking()
    setHeard(null)
    setListening(true)
    handle.current = listen({
      onText: (alts) => {
        const intent = matchSpokenAnswer(alts, item.options)
        setHeard(intent.heard)
        if (intent.kind === 'option') {
          setSelected(intent.index)
          setVia('voice')
        } else if (intent.kind === 'change') {
          setSelected(null)
        }
      },
      onError: () => setListening(false),
      onEnd: () => setListening(false),
    })
    if (!handle.current) setListening(false)
  }

  return (
    <section className="p-card" aria-labelledby={`q${item.no}`}>
      <p className="p-progress" aria-label={`Question ${position} of ${total}`}>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={i < position ? 'on' : ''} />
        ))}
      </p>
      <p className="p-stem">{EPDS_STEM}</p>
      <h1 id={`q${item.no}`} className="p-question" data-testid="question">
        {item.text}
      </h1>

      <div className="p-options" role="radiogroup" aria-labelledby={`q${item.no}`}>
        {item.options.map((o, i) => (
          <button
            key={o.label}
            type="button"
            role="radio"
            aria-checked={selected === i}
            className={`p-option ${selected === i ? 'is-selected' : ''}`}
            onClick={() => {
              setSelected(i)
              setVia('tap')
            }}
            data-testid={`option-${i}`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {(canSpeak() || canListen()) && (
        <div className="p-voice">
          {canSpeak() && (
            <button type="button" className="p-btn p-btn-quiet" onClick={readAloud}>
              🔊 Read aloud
            </button>
          )}
          {canListen() && (
            <button
              type="button"
              className={`p-btn p-btn-quiet ${listening ? 'is-listening' : ''}`}
              onClick={listening ? () => handle.current?.stop() : startListening}
              aria-pressed={listening}
            >
              {listening ? '● Listening…' : '🎙 Say answer'}
            </button>
          )}
        </div>
      )}
      {heard !== null && (
        <p className="p-heard" aria-live="polite">
          Heard: “{heard}”{selected === null ? ' — please tap an answer or try again.' : ''}
        </p>
      )}

      <button
        type="button"
        className="p-btn p-btn-primary p-btn-big"
        disabled={selected === null}
        onClick={() => selected !== null && onAnswer(item.options[selected].value, via, item.options[selected].label)}
        data-testid="next"
      >
        Next
      </button>
    </section>
  )
}

// ---------------- item 10 deliberate confirmation ----------------

function Confirm10({ label, onYes, onChange }: { label: string; onYes: (via: 'tap' | 'voice') => void; onChange: () => void }) {
  const [listening, setListening] = useState(false)
  const handle = useRef<ListenHandle | null>(null)
  useEffect(() => () => handle.current?.stop(), [])

  return (
    <section className="p-card" data-testid="confirm10">
      <p className="p-lead">{line('item10Confirm', { answer: label })}</p>
      <button type="button" className="p-btn p-btn-primary p-btn-big" onClick={() => onYes('tap')} data-testid="confirm-yes">
        Yes, that's right
      </button>
      <button type="button" className="p-btn p-btn-quiet" onClick={onChange} data-testid="confirm-change">
        Change my answer
      </button>
      {canListen() && (
        <button
          type="button"
          className="p-btn p-btn-quiet"
          onClick={() => {
            setListening(true)
            handle.current = listen({
              onText: (alts) => {
                const intent = matchSpokenAnswer(alts, [])
                if (intent.kind === 'yes') onYes('voice')
                else if (intent.kind === 'no' || intent.kind === 'change') onChange()
              },
              onEnd: () => setListening(false),
              onError: () => setListening(false),
            })
          }}
        >
          {listening ? '● Listening… say “yes” or “change”' : '🎙 Answer by voice'}
        </button>
      )}
    </section>
  )
}

// ---------------- optional note ----------------

function NoteScreen({ value, onChange, onDone }: { value: string; onChange: (v: string) => void; onDone: (t: string | null) => void }) {
  const [listening, setListening] = useState(false)
  const handle = useRef<ListenHandle | null>(null)
  const base = useRef('')
  useEffect(() => () => handle.current?.stop(), [])

  return (
    <section className="p-card">
      <label htmlFor="note" className="p-lead">
        {line('notePrompt')}
      </label>
      <textarea
        id="note"
        className="p-note"
        rows={4}
        maxLength={2000}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid="note"
      />
      {canListen() && (
        <button
          type="button"
          className={`p-btn p-btn-quiet ${listening ? 'is-listening' : ''}`}
          onClick={() => {
            if (listening) return handle.current?.stop()
            base.current = value ? `${value} ` : ''
            setListening(true)
            handle.current = listen({
              continuous: true,
              onText: ([t]) => onChange(base.current + t),
              onEnd: () => setListening(false),
              onError: () => setListening(false),
            })
          }}
        >
          {listening ? '● Listening… tap to stop' : '🎙 Speak instead'}
        </button>
      )}
      <button
        type="button"
        className="p-btn p-btn-primary p-btn-big"
        onClick={() => onDone(value.trim() || null)}
        data-testid="note-save"
      >
        {value.trim() ? 'Save and finish' : 'Finish'}
      </button>
      {value.trim() && <p className="p-muted">{line('noteThanks')}</p>}
    </section>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { now } from '../lib/demoClock'
import {
  canListen,
  canSpeak,
  listen,
  listenOnce,
  matchSpokenAnswer,
  speak,
  splitNoteCommand,
  stopSpeaking,
  unlockAudio,
  type ListenHandle,
} from '../lib/speech'
import { supabase } from '../lib/supabase'
import { EPDS_STEM, getItem, isPositiveSelfHarm, SELF_HARM_ITEM, type EpdsItem } from '../shared/epds'
import { findSafetyPhrase } from '../shared/safety'
import type { CheckIn, ItemNo, ItemValue, ScoreRequest, ScoreResponse } from '../shared/types'
import phrases from '../content/phrases'
import { friendlyWhen, line, pick } from './copy'
import { CrisisContacts } from './CrisisScreen'
import { CloseIcon, MicIcon, SpeakerIcon } from './Icons'
import { FocusLayout, PatientLayout } from './PatientLayout'
import { getAutoRead } from './usePatient'
import { confirm10Line, heardLine, optionsLine, questionLine } from './voiceLines'

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

type VoiceStatus = 'idle' | 'speaking' | 'listening'

export function CheckInFlow() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [checkin, setCheckin] = useState<CheckIn | null>(null)
  const [womanId, setWomanId] = useState<string | null>(null)
  const [firstName, setFirstName] = useState('')
  const [groupLabel, setGroupLabel] = useState<string | null>(null)
  const [step, setStep] = useState<Step>({ kind: 'loading' })
  const [selected, setSelected] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [voiceMode, setVoiceMode] = useState(params.get('voice') === '1' && canListen())
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('idle')
  const [heard, setHeard] = useState<string | null>(null)
  const saved = useRef<Set<ItemNo>>(new Set())
  const noteRef = useRef('')
  noteRef.current = note

  // ---------- load ----------
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [{ data: c, error }, { data: me }] = await Promise.all([
        supabase.from('checkins').select('*').eq('id', id!).maybeSingle(),
        supabase.from('patient_me').select('id, first_name, group_label').maybeSingle(),
      ])
      if (cancelled) return
      if (error || !c) return setStep({ kind: 'error', message: 'This check-in could not be found.' })
      if (c.completed_at) return navigate('/', { replace: true })
      setCheckin(c as CheckIn)
      setWomanId(me?.id ?? null)
      setFirstName(me?.first_name ?? '')
      setGroupLabel(me?.group_label ?? null)
      setStep({ kind: 'opener' })
    })()
    return () => {
      cancelled = true
    }
  }, [id, navigate])

  const items: EpdsItem[] = useMemo(() => (checkin?.items ?? []).map((n) => getItem(n as ItemNo)), [checkin])
  const seed = checkin?.id ?? ''

  // ---------- persistence ----------
  async function saveAnswer(item: ItemNo, value: ItemValue, via: 'tap' | 'voice') {
    if (!checkin || saved.current.has(item)) return
    const { error } = await supabase.from('item_answers').insert({
      woman_id: womanId,
      checkin_id: checkin.id,
      item_no: item,
      value,
      via,
      answered_at: now().toISOString(),
    })
    if (error && error.code !== '23505') throw error // 23505 = already saved (reload) — fine
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
      return null
    }
  }

  async function answerItem(index: number, value: ItemValue, via: 'tap' | 'voice') {
    const item = items[index]
    // Clear the choice immediately and lock the buttons while saving, so a fast tap on the
    // next screen can't be wiped out by this save finishing.
    setSelected(null)
    setHeard(null)
    setBusy(true)
    try {
      await saveAnswer(item.no, value, via)
      if (isPositiveSelfHarm(item.no, value)) {
        setStep({ kind: 'crisis' }) // urgent route: crisis contacts straight away
        await finish(null)
        return
      }
      setStep(index + 1 < items.length ? { kind: 'item', index: index + 1 } : { kind: 'note' })
    } catch {
      setStep({ kind: 'error', message: "Couldn't save. Check your connection and try again." })
    } finally {
      setBusy(false)
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

  // ---------- auto read-aloud (tap mode) ----------
  useEffect(() => {
    if (voiceMode || !getAutoRead() || step.kind !== 'item') return
    const item = items[step.index]
    if (item) void speak(questionLine(item))
    return () => stopSpeaking()
  }, [step, voiceMode, items])

  // ---------- hands-free driver: the whole check-in, spoken ----------
  useEffect(() => {
    if (!voiceMode) return
    const token = { cancelled: false }
    let cancelListen: (() => void) | null = null
    let noteHandle: ListenHandle | null = null
    const alive = () => !token.cancelled

    const say = async (t: string) => {
      if (!alive()) return
      setVoiceStatus('speaking')
      await speak(t)
      if (alive()) setVoiceStatus('idle')
    }
    const hear = async (): Promise<string[]> => {
      if (!alive()) return []
      setVoiceStatus('listening')
      const l = listenOnce(9000)
      cancelListen = l.cancel
      const r = await l.promise
      cancelListen = null
      if (alive()) setVoiceStatus('idle')
      return r
    }
    const toTap = async () => {
      await say(phrases.voiceTapFallback)
      if (alive()) setVoiceMode(false)
    }

    ;(async () => {
      if (step.kind === 'opener') {
        await say(phrases.voiceOpener)
        if (alive()) setStep({ kind: 'item', index: 0 })
        return
      }

      if (step.kind === 'item') {
        const item = items[step.index]
        if (!item) return
        await say(questionLine(item))
        await say(optionsLine(item))
        let misses = 0
        while (alive()) {
          const intent = matchSpokenAnswer(await hear(), item.options)
          if (!alive()) return
          setHeard(intent.heard || null)
          if (intent.kind === 'option') {
            const opt = item.options[intent.index]
            setSelected(intent.index)
            if (item.no === SELF_HARM_ITEM) {
              setStep({ kind: 'confirm10', index: step.index, value: opt.value, label: opt.label })
              return
            }
            await say(heardLine(opt.label))
            const conf = matchSpokenAnswer(await hear(), [])
            if (!alive()) return
            if (conf.kind === 'change' || conf.kind === 'no') {
              setSelected(null)
              await say(optionsLine(item))
              continue
            }
            await answerItem(step.index, opt.value, 'voice') // "next", "yes" or a pause → move on
            return
          }
          if (intent.kind === 'repeat') {
            await say(questionLine(item))
            await say(optionsLine(item))
            continue
          }
          if (intent.kind === 'stop') return setVoiceMode(false)
          if (++misses >= 3) return toTap()
          await say(phrases.voiceNotClear)
        }
        return
      }

      if (step.kind === 'confirm10') {
        await say(confirm10Line(step.label))
        for (let tries = 0; tries < 3 && alive(); tries++) {
          const intent = matchSpokenAnswer(await hear(), [])
          if (!alive()) return
          if (intent.kind === 'yes') return answerItem(step.index, step.value, 'voice')
          if (intent.kind === 'change' || intent.kind === 'no') {
            setSelected(null)
            return setStep({ kind: 'item', index: step.index })
          }
          await say(confirm10Line(step.label))
        }
        return toTap()
      }

      if (step.kind === 'note') {
        await say(phrases.voiceNoteIntro)
        if (!alive()) return
        setVoiceStatus('listening')
        const finalText = await new Promise<string | null>((resolve) => {
          let settled = false
          const settle = (v: string | null) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            noteHandle?.stop()
            resolve(v)
          }
          const timer = setTimeout(() => settle(noteRef.current.trim() || null), 60_000)
          noteHandle = listen({
            continuous: true,
            onText: ([t]) => {
              const { text, command } = splitNoteCommand(t ?? '')
              setNote(text)
              if (command === 'skip') settle(null)
              else if (command === 'finish') settle(text.trim() || null)
            },
            onEnd: () => settle(noteRef.current.trim() || null),
            onError: () => settle(noteRef.current.trim() || null),
          })
          if (!noteHandle) settle(null)
        })
        if (!alive()) return
        setVoiceStatus('idle')
        await submitNote(finalText)
        return
      }

      if (step.kind === 'close') {
        await say(pick(phrases.closeTitle, seed))
        await say(pick(phrases.closeOutward, seed))
        if (alive()) setVoiceMode(false)
        return
      }

      if (step.kind === 'crisis') {
        await say(phrases.crisisVoice)
        if (alive()) setVoiceMode(false)
      }
    })()

    return () => {
      token.cancelled = true
      cancelListen?.()
      noteHandle?.stop()
      stopSpeaking()
      setVoiceStatus('idle')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceMode, step, items])

  function toggleVoice() {
    if (voiceMode) {
      setVoiceMode(false)
      stopSpeaking()
    } else {
      unlockAudio()
      setVoiceMode(true)
    }
  }

  // ---------- render ----------
  if (step.kind === 'loading' || step.kind === 'error' || step.kind === 'crisis' || step.kind === 'saving') {
    return (
      <PatientLayout tabs={false}>
        {step.kind === 'loading' && <p className="p-muted">Loading…</p>}
        {step.kind === 'saving' && <p className="p-muted">Saving…</p>}
        {step.kind === 'error' && (
          <div className="p-stack">
            <p role="alert" className="p-error">
              {step.message}
            </p>
            <Link to="/" className="p-btn p-btn-soft">
              Back
            </Link>
          </div>
        )}
        {step.kind === 'crisis' && (
          <>
            <CrisisContacts afterDisclosure />
            <Link to="/" className="p-btn p-btn-soft p-btn-block">
              Close
            </Link>
          </>
        )}
      </PatientLayout>
    )
  }

  const position = step.kind === 'item' || step.kind === 'confirm10' ? step.index + 1 : step.kind === 'opener' ? 0 : items.length
  const top = (
    <>
      <Link to="/" className="p-icon-btn" aria-label="Close check-in" onClick={() => stopSpeaking()}>
        <CloseIcon size={20} />
      </Link>
      <div className="p-progress" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={position} aria-label="Check-in progress">
        {items.map((_, i) => (
          <span key={i} className={i < position ? 'on' : ''} />
        ))}
      </div>
      {canListen() && step.kind !== 'close' && (
        <button
          type="button"
          className="p-icon-btn"
          onClick={toggleVoice}
          aria-pressed={voiceMode}
          aria-label={voiceMode ? 'Stop voice mode' : 'Talk me through it'}
          style={voiceMode ? { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'var(--accent)' } : undefined}
          data-testid="voice-toggle"
        >
          <MicIcon size={20} />
        </button>
      )}
    </>
  )

  const voiceBar = voiceMode && (
    <div className="p-voice-status" aria-live="polite" data-testid="voice-status">
      <span className={`p-orb ${voiceStatus === 'listening' ? 'listening' : ''}`}>
        {voiceStatus === 'speaking' ? (
          <span className="p-wave" aria-hidden>
            <i />
            <i />
            <i />
            <i />
          </span>
        ) : (
          <MicIcon size={18} />
        )}
      </span>
      <span style={{ flex: 1 }}>
        {voiceStatus === 'listening' ? 'Listening…' : voiceStatus === 'speaking' ? 'Speaking…' : 'Voice mode on'}
        {heard && <span className="p-muted p-small" style={{ display: 'block' }}>Heard: “{heard}”</span>}
      </span>
      <button type="button" className="p-btn p-btn-quiet" style={{ minHeight: 40, padding: '0 10px' }} onClick={toggleVoice}>
        Stop
      </button>
    </div>
  )

  if (step.kind === 'opener') {
    return (
      <FocusLayout
        top={top}
        actions={
          <>
            <button type="button" className="p-btn p-btn-primary p-btn-big" onClick={() => setStep({ kind: 'item', index: 0 })} data-testid="begin">
              Begin
            </button>
            {canListen() && !voiceMode && (
              <button
                type="button"
                className="p-btn p-btn-soft"
                onClick={() => {
                  unlockAudio()
                  setVoiceMode(true)
                }}
                data-testid="begin-voice"
              >
                <MicIcon size={20} /> Talk me through it
              </button>
            )}
          </>
        }
      >
        {voiceBar}
        <p className="p-eyebrow">Check-in</p>
        <h1 className="p-question" data-testid="opener">
          {line('opener', { name: firstName, count: items.length }, seed)}
        </h1>
        <p className="p-muted">Answer by tapping, or by voice — whichever is easier right now.</p>
      </FocusLayout>
    )
  }

  if (step.kind === 'item' && items[step.index]) {
    const item = items[step.index]
    const isItem10 = item.no === SELF_HARM_ITEM
    return (
      <FocusLayout
        top={top}
        actions={
          <button
            type="button"
            className="p-btn p-btn-primary p-btn-big"
            disabled={selected === null || busy}
            onClick={() => {
              if (selected === null) return
              const opt = item.options[selected]
              if (isItem10) setStep({ kind: 'confirm10', index: step.index, value: opt.value, label: opt.label })
              else void answerItem(step.index, opt.value, 'tap')
            }}
            data-testid="next"
          >
            Next
          </button>
        }
      >
        {voiceBar}
        <div key={item.no} className="p-stack">
          <p className="p-stem">{EPDS_STEM}</p>
          <h1 id={`q${item.no}`} className="p-question" data-testid="question">
            {item.text}
          </h1>
          {!voiceMode && canSpeak() && (
            <button
              type="button"
              className="p-btn p-btn-quiet"
              style={{ alignSelf: 'flex-start', minHeight: 40, padding: '0 6px' }}
              onClick={() => {
                unlockAudio()
                void speak(`${questionLine(item)} ${optionsLine(item)}`)
              }}
            >
              <SpeakerIcon size={18} /> Read aloud
            </button>
          )}
          <div className="p-options" role="radiogroup" aria-labelledby={`q${item.no}`}>
            {item.options.map((o, i) => (
              <button
                key={o.label}
                type="button"
                role="radio"
                aria-checked={selected === i}
                className={`p-option ${selected === i ? 'is-selected' : ''}`}
                disabled={busy}
                onClick={() => setSelected(i)}
                data-testid={`option-${i}`}
              >
                <span className="p-radio" aria-hidden />
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </FocusLayout>
    )
  }

  if (step.kind === 'confirm10') {
    return (
      <FocusLayout
        top={top}
        actions={
          <>
            <button type="button" className="p-btn p-btn-primary p-btn-big" onClick={() => void answerItem(step.index, step.value, 'tap')} data-testid="confirm-yes">
              Yes, that's right
            </button>
            <button
              type="button"
              className="p-btn p-btn-soft"
              onClick={() => {
                setSelected(null)
                setStep({ kind: 'item', index: step.index })
              }}
              data-testid="confirm-change"
            >
              Change my answer
            </button>
          </>
        }
      >
        {voiceBar}
        <div data-testid="confirm10" className="p-stack">
          <p className="p-stem">{getItem(SELF_HARM_ITEM).text}</p>
          <h1 className="p-question">{line('item10Confirm', { answer: step.label })}</h1>
        </div>
      </FocusLayout>
    )
  }

  if (step.kind === 'note') {
    return (
      <FocusLayout
        top={top}
        actions={
          <button type="button" className="p-btn p-btn-primary p-btn-big" onClick={() => void submitNote(note.trim() || null)} data-testid="note-save">
            {note.trim() ? 'Save and finish' : 'Finish'}
          </button>
        }
      >
        {voiceBar}
        <label htmlFor="note" className="p-question" style={{ fontSize: 24 }}>
          {line('notePrompt')}
        </label>
        <textarea id="note" className="p-note" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} data-testid="note" />
        {!voiceMode && canListen() && <NoteMic value={note} onChange={setNote} />}
        {note.trim() && <p className="p-muted p-small">{line('noteThanks')}</p>}
      </FocusLayout>
    )
  }

  // close
  const nextWhen = step.kind === 'close' ? step.nextWhen : null
  return (
    <FocusLayout
      top={top}
      actions={
        <Link to="/" className="p-btn p-btn-primary p-btn-big">
          Done
        </Link>
      }
    >
      {voiceBar}
      <section className="p-stack" data-testid="close">
        <h1 className="p-question">{line('closeTitle', {}, seed)}</h1>
        {groupLabel && <p className="p-lead">{line('closeGroup', { group: groupLabel })}</p>}
        {nextWhen && <p className="p-lead">{line('closeNext', { when: nextWhen })}</p>}
        <p className="p-muted">{line('closeOutward', {}, seed)}</p>
      </section>
    </FocusLayout>
  )
}

function NoteMic({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [listening, setListening] = useState(false)
  const handle = useRef<ListenHandle | null>(null)
  const base = useRef('')
  useEffect(() => () => handle.current?.stop(), [])
  return (
    <button
      type="button"
      className={`p-btn p-btn-soft ${listening ? 'is-listening' : ''}`}
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
      <MicIcon size={20} /> {listening ? 'Listening… tap to stop' : 'Speak instead'}
    </button>
  )
}

import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG as C } from './config'
import { computeBaseline, evaluate, type AnswerIn, type CheckinIn, type EngineInput } from './rules'
import { nextCheckinAt, nextItems } from './schedule'

const NOW = '2026-11-18T12:00:00.000Z' // Wednesday
const DAY = 86_400_000
const ago = (days: number) => new Date(Date.parse(NOW) - days * DAY).toISOString()

/** All 10 items answered `daysAgo`, values given per item (default 0). */
function window(values: Partial<Record<number, number>>, daysAgo = 1): AnswerIn[] {
  return Array.from({ length: 10 }, (_, i) => ({ item_no: i + 1, value: values[i + 1] ?? 0, answered_at: ago(daysAgo) }))
}
/** Values summing to `total` across items 1-9 (item 10 = 0). */
function totalOf(total: number): Partial<Record<number, number>> {
  const v: Record<number, number> = {}
  for (let i = 1; i <= 9 && total > 0; i++) {
    v[i] = Math.min(3, total)
    total -= v[i]
  }
  return v
}
function input(over: Partial<EngineInput> = {}): EngineInput {
  return { woman: { gp_id: 'gp', hv_id: 'hv', baseline_total: 6 }, answers: [], checkins: [], attendance: [], ...over }
}
const done = (daysAgo: number, note: string | null = null): CheckinIn => ({ scheduled_for: ago(daysAgo), completed_at: ago(daysAgo), note_text: note })
const missed = (daysAgo: number): CheckinIn => ({ scheduled_for: ago(daysAgo), completed_at: null, note_text: null })

describe('U1 item 10', () => {
  it('item 10 = 0 → no flag', () => expect(evaluate(input({ answers: window({}) }), C, NOW)).toBeNull())
  it('item 10 = 1 alone → urgent, GP, same day', () => {
    const r = evaluate(input({ answers: [{ item_no: 10, value: 1, answered_at: ago(1) }] }), C, NOW)!
    expect(r).toMatchObject({ level: 'urgent', rule_id: 'U1', owner_id: 'gp', rule_version: C.version })
    expect(r.due_at).toBe('2026-11-18T23:59:00.000Z')
  })
  it('uses latest item-10 answer in window', () => {
    const answers = [
      { item_no: 10, value: 2, answered_at: ago(5) },
      { item_no: 10, value: 0, answered_at: ago(1) },
    ]
    expect(evaluate(input({ answers }), C, NOW)).toBeNull()
  })
})

describe('U2 safety phrase in note', () => {
  it('note with phrase → urgent', () => {
    const r = evaluate(input({ checkins: [done(1, "I don't want to be here anymore")] }), C, NOW)
    expect(r).toMatchObject({ level: 'urgent', rule_id: 'U2', owner_id: 'gp' })
  })
  it('neutral note → nothing', () => expect(evaluate(input({ checkins: [done(1, 'tired but ok, baby slept')] }), C, NOW)).toBeNull())
  it('U1 beats U2', () => {
    const r = evaluate(input({ answers: [{ item_no: 10, value: 3, answered_at: ago(1) }], checkins: [done(1, 'want to die')] }), C, NOW)
    expect(r?.rule_id).toBe('U1')
  })
})

describe('R1 rolling total', () => {
  it('12 → no review', () => expect(evaluate(input({ answers: window(totalOf(12)), woman: { gp_id: 'gp', hv_id: 'hv', baseline_total: 10 } }), C, NOW)).toBeNull())
  it('13 → review, GP, 2 working days', () => {
    const r = evaluate(input({ answers: window(totalOf(13)), woman: { gp_id: 'gp', hv_id: 'hv', baseline_total: 10 } }), C, NOW)!
    expect(r).toMatchObject({ level: 'review', rule_id: 'R1', owner_id: 'gp' })
    expect(r.due_at).toBe('2026-11-20T18:00:00.000Z') // Wed → Fri
  })
  it('partial window ≥ 13 counts', () => {
    const answers = [1, 2, 3, 4, 5].map((n) => ({ item_no: n, value: 3, answered_at: ago(2) }))
    expect(evaluate(input({ answers }), C, NOW)?.rule_id).toBe('R1')
  })
  it('answer 7 days old counts, 8 days old drops out', () => {
    const seven = window(totalOf(13), 7)
    const eight = window(totalOf(13), 8)
    const w = { gp_id: 'gp', hv_id: 'hv', baseline_total: 10 }
    expect(evaluate(input({ answers: seven, woman: w }), C, NOW)?.rule_id).toBe('R1')
    expect(evaluate(input({ answers: eight, woman: w }), C, NOW)).toBeNull()
  })
  it('working days skip the weekend', () => {
    const r = evaluate(input({ answers: window(totalOf(14)) }), C, '2026-11-20T12:00:00.000Z')! // Friday
    expect(r.due_at).toBe('2026-11-24T18:00:00.000Z') // Tuesday
  })
})

describe('D1 rise vs baseline', () => {
  it('+3 → nothing', () => expect(evaluate(input({ answers: window(totalOf(9)) }), C, NOW)).toBeNull())
  it('+4 → drift, HV, 5 working days', () => {
    const r = evaluate(input({ answers: window(totalOf(10)) }), C, NOW)!
    expect(r).toMatchObject({ level: 'drift', rule_id: 'D1', owner_id: 'hv' })
    expect(r.due_at).toBe('2026-11-25T18:00:00.000Z')
  })
  it('incomplete window never triggers D1', () => {
    const answers = window(totalOf(11)).filter((a) => a.item_no !== 9 && a.item_no !== 8)
    expect(evaluate(input({ answers }), C, NOW)?.rule_id).not.toBe('D1')
  })
  it('baseline derived from first complete window when not stored', () => {
    const answers = [...window(totalOf(6), 20), ...window(totalOf(10), 1)]
    expect(computeBaseline(answers, 7)).toBe(6)
    const r = evaluate(input({ answers, woman: { gp_id: 'gp', hv_id: 'hv', baseline_total: null } }), C, NOW)
    expect(r?.rule_id).toBe('D1')
  })
  it('R1 beats D1', () => expect(evaluate(input({ answers: window(totalOf(14)) }), C, NOW)?.rule_id).toBe('R1'))
})

describe('D2 missed in a row', () => {
  it('2 in a row → nothing (no rise)', () => expect(evaluate(input({ checkins: [done(7), missed(4), missed(2)] }), C, NOW)).toBeNull())
  it('3 in a row → drift', () => {
    const r = evaluate(input({ checkins: [done(9), missed(6), missed(4), missed(2)] }), C, NOW)
    expect(r).toMatchObject({ level: 'drift', rule_id: 'D2', owner_id: 'hv' })
  })
  it('missed only after 24h grace', () => {
    const recent: CheckinIn = { scheduled_for: new Date(Date.parse(NOW) - 23 * 3_600_000).toISOString(), completed_at: null, note_text: null }
    expect(evaluate(input({ checkins: [missed(6), missed(4), recent] }), C, NOW)).toBeNull()
  })
  it('late completion counts as completed', () => {
    const late: CheckinIn = { scheduled_for: ago(4), completed_at: ago(2), note_text: null }
    expect(evaluate(input({ checkins: [missed(8), missed(6), late, missed(2)] }), C, NOW)).toBeNull()
  })
})

describe('D3 missed + rise', () => {
  const rising = window(totalOf(8)) // baseline 6 → +2
  it('2 missed check-ins + rise → drift', () => {
    expect(evaluate(input({ answers: rising, checkins: [missed(6), done(4), missed(2)] }), C, NOW)?.rule_id).toBe('D3')
  })
  it('2 missed classes + rise → drift', () => {
    const attendance = [{ session_date: ago(8).slice(0, 10), attended: false }, { session_date: ago(1).slice(0, 10), attended: false }]
    expect(evaluate(input({ answers: rising, attendance }), C, NOW)?.rule_id).toBe('D3')
  })
  it('2 missed but no rise → nothing', () => {
    expect(evaluate(input({ answers: window(totalOf(6)), checkins: [missed(6), done(4), missed(2)] }), C, NOW)).toBeNull()
  })
  it('1 missed + rise → nothing', () => {
    expect(evaluate(input({ answers: rising, checkins: [missed(6), done(4), done(2)] }), C, NOW)).toBeNull()
  })
})

describe('determinism + schedule', () => {
  it('same input → same output', () => {
    const i = input({ answers: window(totalOf(10)) })
    expect(evaluate(i, C, NOW)).toEqual(evaluate(i, C, NOW))
  })
  it('rotating groups cover all 10 items incl. item 10 within 3 check-ins (6 days)', () => {
    let items: number[] | null = null
    const seen = new Set<number>()
    for (let i = 0; i < 3; i++) {
      items = nextItems(items)
      items.forEach((n) => seen.add(n))
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })
  it('next check-in 2 days later at her hour (London)', () => {
    expect(nextCheckinAt(NOW, 20)).toBe('2026-11-20T20:00:00.000Z')
    expect(nextCheckinAt('2026-07-01T09:00:00Z', 20)).toBe('2026-07-03T19:00:00.000Z') // BST
  })
})

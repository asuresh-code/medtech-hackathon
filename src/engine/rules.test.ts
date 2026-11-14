// Test cases from docs/research/deterministic-rules.md §5 (numbers in names refer to that table).
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ENGINE_CONFIG } from './config'
import { evaluate, type EngineAnswer, type EngineCheckin, type EngineFlag, type EngineInput } from './rules'

const NOW = '2026-11-14T20:00:00Z'
const nowMs = new Date(NOW).getTime()
const H = 3_600_000
const D = 24 * H
const ago = (ms: number) => new Date(nowMs - ms).toISOString()

const B6 = [1, 1, 1, 1, 0, 1, 0, 1, 0, 0]
const B10 = [1, 1, 2, 1, 1, 1, 1, 1, 1, 0]
const B8 = [1, 1, 1, 1, 1, 1, 1, 1, 0, 0]
const B3 = [1, 0, 1, 1, 0, 0, 0, 0, 0, 0]

let seq = 0
function answers(values: (number | null)[], at: number | ((item: number) => number), prefix = 'a'): EngineAnswer[] {
  return values.flatMap((v, i) =>
    v === null
      ? []
      : [{ id: `${prefix}${++seq}`, checkin_id: 'c', item_no: i + 1, value: v, answered_at: ago(typeof at === 'number' ? at : at(i + 1)) }],
  )
}
/** Baseline answered 10 days ago (its own complete window), current answers 2 days ago. */
function run(opts: {
  base?: number[] | null
  cur?: (number | null)[]
  extra?: EngineAnswer[]
  checkins?: EngineCheckin[]
  attendance?: { session_date: string; attended: boolean }[]
  flags?: EngineFlag[]
  cfg?: typeof ENGINE_CONFIG
}) {
  const input: EngineInput = {
    now: NOW,
    answers: [...(opts.base ? answers(opts.base, 10 * D, 'b') : []), ...(opts.cur ? answers(opts.cur, 2 * D) : []), ...(opts.extra ?? [])],
    checkins: opts.checkins ?? [],
    attendance: opts.attendance ?? [],
    flags: opts.flags ?? [],
  }
  return evaluate(input, opts.cfg)
}
const top = (r: ReturnType<typeof evaluate>) => r.top?.rule_id ?? null
const ids = (r: ReturnType<typeof evaluate>) => r.fired.map((f) => f.rule_id)
const dayStr = (daysAgo: number) => new Date(nowMs - daysAgo * D).toISOString().slice(0, 10)
const checkin = (id: string, scheduledAgoMs: number, completed: boolean, note: string | null = null): EngineCheckin => ({
  id,
  scheduled_for: ago(scheduledAgoMs),
  completed_at: completed ? ago(scheduledAgoMs - H) : null,
  note_text: note,
})

describe('urgent rules', () => {
  it('#1 stable → none', () => expect(top(run({ base: B6, cur: B6 }))).toBeNull())
  it('#2 item 10 = 1 → U1', () => expect(top(run({ base: B6, cur: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1] }))).toBe('U1'))
  it('#3 item 10 = 0 → none', () => expect(top(run({ base: B6, cur: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }))).toBeNull())
  it('#4 18 with item 10 → U1 plus R1, D1', () => {
    const r = run({ base: B6, cur: [2, 2, 2, 2, 2, 2, 2, 2, 0, 2] })
    expect(top(r)).toBe('U1')
    expect(ids(r)).toEqual(expect.arrayContaining(['R1', 'D1']))
  })
  it('#5 item 10 positive 9 days ago, never flagged → U1 (not window-bound)', () => {
    const extra = [{ id: 'old10', checkin_id: 'c', item_no: 10, value: 1, answered_at: ago(9 * D) }]
    expect(top(run({ base: B6, cur: B6, extra }))).toBe('U1')
  })
  it('#6 earlier positive still counts after a later "Never"', () => {
    const extra = [
      { id: 'p', checkin_id: 'c', item_no: 10, value: 2, answered_at: ago(3 * D) },
      { id: 'n', checkin_id: 'c', item_no: 10, value: 0, answered_at: ago(1 * D) },
    ]
    expect(top(run({ base: B6, cur: [1, 1, 1, 1, 0, 1, 0, 1, 0, null], extra }))).toBe('U1')
  })
  it('#7 same evidence already flagged → no new flag', () => {
    const extra = [{ id: 'p7', checkin_id: 'c', item_no: 10, value: 2, answered_at: ago(3 * D) }]
    const flags: EngineFlag[] = [{ rule_id: 'U1', level: 'urgent', status: 'closed', created_at: ago(2 * D), evidence_id: 'p7' }]
    const r = run({ base: B6, cur: [1, 1, 1, 1, 0, 1, 0, 1, 0, null], extra, flags })
    expect(r.toCreate).toEqual([])
  })
  it('#8 disclosure in note → U2', () =>
    expect(top(run({ base: B6, cur: B6, checkins: [checkin('n8', 2 * D, true, "they'd all be better off without me")] }))).toBe('U2'))
  it('#9 normalised match → U2', () =>
    expect(top(run({ base: B6, cur: B6, checkins: [checkin('n9', 2 * D, true, 'SELF-HARMED again last night')] }))).toBe('U2'))
  it('#10 neutral note → none', () =>
    expect(top(run({ base: B6, cur: B6, checkins: [checkin('n10', 2 * D, true, 'Lovely walk, baby slept')] }))).toBeNull())
  it('#40 open R1 + new item 10 → new U1 created', () => {
    const flags: EngineFlag[] = [{ rule_id: 'R1', level: 'review', status: 'open', created_at: ago(D), trigger_value: 14 }]
    const r = run({ base: B6, cur: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1], flags })
    expect(r.toCreate.map((f) => f.rule_id)).toEqual(['U1'])
  })
  it('#43 item 10 on an abandoned check-in → U1', () => {
    const extra = [{ id: 'ab', checkin_id: 'abandoned', item_no: 10, value: 2, answered_at: ago(30 * H) }]
    const r = run({ base: B6, extra, checkins: [checkin('abandoned', 31 * H, false)] })
    expect(top(r)).toBe('U1')
  })
})

describe('review rules (SIGN 169 ≥13)', () => {
  it('#11 12 → none', () => expect(top(run({ base: B10, cur: [1, 1, 2, 1, 1, 2, 1, 2, 1, 0] }))).toBeNull())
  it('#12 13 → R1', () => expect(top(run({ base: B10, cur: [1, 1, 2, 1, 1, 2, 1, 2, 2, 0] }))).toBe('R1'))
  it('#13 partial 13 → R2', () => expect(top(run({ base: B10, cur: [2, 2, 2, 2, 1, 2, null, 2, null, 0] }))).toBe('R2'))
  it('#14 partial 12 → none', () => expect(top(run({ base: B10, cur: [2, 2, 2, 2, 1, 2, null, 1, null, 0] }))).toBeNull())
  it('#15 item answered 167 h ago is in the window', () => {
    const cur = [1, 1, 2, 1, 1, 2, 1, 2, 2, 0]
    const r = run({ base: B10, extra: answers(cur, (i) => (i === 1 ? 167 * H : 2 * D)) })
    expect(top(r)).toBe('R1')
  })
  it('#16 item answered 168 h ago is out', () => {
    const cur = [1, 1, 2, 1, 1, 2, 1, 2, 2, 0]
    const r = run({ base: B10, extra: answers(cur, (i) => (i === 1 ? 168 * H : 2 * D)) })
    expect(top(r)).toBeNull()
  })
  it('#18 latest value per item is used (not max)', () => {
    const extra = [
      { id: 'i4a', checkin_id: 'c', item_no: 4, value: 3, answered_at: ago(6 * D) },
      { id: 'i4b', checkin_id: 'c', item_no: 4, value: 1, answered_at: ago(1 * D) },
    ]
    const r = run({ base: B10, cur: [1, 1, 2, null, 1, 2, 1, 2, 1, 0], extra })
    expect(r.window.total).toBe(12)
    expect(top(r)).toBeNull()
  })
  it('#37 14 fires R1 and D1 but creates one flag', () => {
    const r = run({ base: B6, cur: [2, 2, 2, 2, 1, 2, 1, 1, 1, 0] })
    expect(top(r)).toBe('R1')
    expect(ids(r)).toContain('D1')
    expect(r.toCreate.map((f) => f.rule_id)).toEqual(['R1'])
  })
  it('#38 open R1 already → no new flag', () => {
    const flags: EngineFlag[] = [{ rule_id: 'R1', level: 'review', status: 'open', created_at: ago(D), trigger_value: 14 }]
    expect(run({ base: B6, cur: [2, 2, 2, 2, 1, 2, 1, 1, 1, 0], flags }).toCreate).toEqual([])
  })
  it('#39 open D1 + 13 → new R1 (D1 stays open)', () => {
    const flags: EngineFlag[] = [{ rule_id: 'D1', level: 'drift', status: 'open', created_at: ago(D), trigger_value: 11 }]
    expect(run({ base: B6, cur: [2, 2, 2, 2, 1, 2, 1, 1, 0, 0], flags }).toCreate.map((f) => f.rule_id)).toEqual(['R1'])
  })
  it('#41 re-flag only on a worse value or after 14 days', () => {
    const closed = (daysAgo: number): EngineFlag[] => [
      { rule_id: 'R1', level: 'review', status: 'closed', created_at: ago((daysAgo + 1) * D), closed_at: ago(daysAgo * D), trigger_value: 14 },
    ]
    const cur14 = [2, 2, 2, 2, 1, 2, 1, 1, 1, 0]
    const cur15 = [2, 2, 2, 2, 2, 2, 1, 1, 1, 0]
    expect(run({ base: B6, cur: cur14, flags: closed(3) }).toCreate).toEqual([]) // and no D1 in its place
    expect(run({ base: B6, cur: cur15, flags: closed(3) }).toCreate.map((f) => f.rule_id)).toEqual(['R1'])
    expect(run({ base: B6, cur: cur14, flags: closed(15) }).toCreate.map((f) => f.rule_id)).toEqual(['R1'])
  })
  it('#42 R3 anxiety subscale only when enabled', () => {
    const on = { ...ENGINE_CONFIG, rules: { ...ENGINE_CONFIG.rules, R3: { ...ENGINE_CONFIG.rules.R3, enabled: true } } }
    expect(top(run({ base: B6, cur: [0, 0, 2, 2, 2, 0, 0, 0, 0, 0], cfg: on }))).toBe('R3')
    expect(top(run({ base: B6, cur: [0, 0, 2, 2, 1, 0, 0, 0, 0, 0], cfg: on }))).toBeNull()
    expect(top(run({ base: B6, cur: [0, 0, 2, 2, 2, 0, 0, 0, 0, 0] }))).toBeNull()
  })
})

describe('drift rules', () => {
  it('#19 +3 → none', () => expect(top(run({ base: B6, cur: [1, 1, 2, 1, 1, 1, 0, 1, 1, 0] }))).toBeNull())
  it('#20 +4 (10) → D1, also D4', () => {
    const r = run({ base: B6, cur: [1, 1, 2, 1, 1, 1, 1, 1, 1, 0] })
    expect(top(r)).toBe('D1')
    expect(ids(r)).toContain('D4')
  })
  it('#21 B3 → 7 (+4) → D1', () => expect(top(run({ base: B3, cur: [1, 1, 1, 1, 1, 1, 1, 0, 0, 0] }))).toBe('D1'))
  it('#22 B3 → 6 (+3) → none', () => expect(top(run({ base: B3, cur: [1, 1, 1, 1, 1, 1, 0, 0, 0, 0] }))).toBeNull())
  it('#23 B8 → 10 enters band → D4', () => expect(top(run({ base: B8, cur: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1].map((v, i) => (i === 9 ? 0 : v)).map((v, i) => (i === 0 ? 2 : v)) }))).toBe('D4'))
  it('#24 B8 → 9 → none', () => expect(top(run({ base: B8, cur: [1, 1, 1, 1, 1, 1, 1, 1, 1, 0] }))).toBeNull())
  it('#25 first complete window at 11 → D4, baseline set', () => {
    const r = run({ base: null, cur: [2, 1, 1, 1, 1, 1, 1, 1, 2, 0] })
    expect(top(r)).toBe('D4')
    expect(r.baseline?.total).toBe(11)
  })
  it('#26 no baseline, partial 9 → none', () => expect(top(run({ base: null, cur: [2, 2, 2, 1, 1, 1, null, null, null, null] }))).toBeNull())
  it('#27 no baseline, partial 13 → R2', () => expect(top(run({ base: null, cur: [3, 2, 2, 2, 2, 2, null, null, null, null] }))).toBe('R2'))
  it('#28 three missed in a row → D3', () => {
    const checkins = [checkin('m1', 8 * D, false), checkin('m2', 6 * D, false), checkin('m3', 3 * D, false)]
    expect(top(run({ base: B6, checkins }))).toBe('D3')
  })
  it('#29 latest still pending (23h59m) → none', () => {
    const checkins = [checkin('m1', 8 * D, false), checkin('m2', 6 * D, false), checkin('p', 24 * H - 60_000, false)]
    expect(top(run({ base: B6, checkins }))).toBeNull()
  })
  it('#30 latest exactly 24h → D3', () => {
    const checkins = [checkin('m1', 8 * D, false), checkin('m2', 6 * D, false), checkin('p', 24 * H, false)]
    expect(top(run({ base: B6, checkins }))).toBe('D3')
  })
  it('#31 run broken by a late completion → none', () => {
    const checkins = [checkin('m1', 8 * D, false), { ...checkin('late', 6 * D, true), completed_at: ago(6 * D - 30 * H) }, checkin('m3', 3 * D, false)]
    expect(top(run({ base: B6, cur: B6, checkins }))).toBeNull()
  })
  it('#32 two non-consecutive misses + rise → D2', () => {
    const checkins = [checkin('m1', 10 * D, false), checkin('ok', 7 * D, true), checkin('m2', 4 * D, false)]
    expect(top(run({ base: B6, cur: [1, 1, 1, 1, 0, 1, 0, 1, 1, 0], checkins }))).toBe('D2')
  })
  it('#33 same with no rise → none', () => {
    const checkins = [checkin('m1', 10 * D, false), checkin('ok', 7 * D, true), checkin('m2', 4 * D, false)]
    expect(top(run({ base: B6, cur: B6, checkins }))).toBeNull()
  })
  it('#34 two missed classes + total 7 → D2', () => {
    const attendance = [{ session_date: dayStr(13), attended: false }, { session_date: dayStr(6), attended: false }]
    expect(top(run({ base: B6, cur: [1, 1, 1, 1, 0, 1, 0, 1, 1, 0], attendance }))).toBe('D2')
  })
  it('#35 one class + one check-in missed (combined) → D2', () => {
    const attendance = [{ session_date: dayStr(6), attended: false }]
    const checkins = [checkin('ok', 7 * D, true), checkin('m', 4 * D, false)]
    expect(top(run({ base: B6, cur: [1, 1, 1, 1, 0, 1, 1, 1, 1, 0], attendance, checkins }))).toBe('D2')
  })
  it('#36 one class outside the 14-day lookback → none', () => {
    const attendance = [{ session_date: dayStr(15), attended: false }, { session_date: dayStr(6), attended: false }]
    expect(top(run({ base: B6, cur: [1, 1, 1, 1, 0, 1, 1, 1, 1, 0], attendance }))).toBeNull()
  })
})

describe('determinism and purity', () => {
  it('#44 same input → identical output', () => {
    const input: EngineInput = {
      now: NOW,
      answers: answers(B6, 10 * D, 'x').concat(answers([2, 2, 2, 2, 1, 2, 1, 1, 1, 1], 2 * D, 'y')),
      checkins: [checkin('a', 8 * D, false)],
      attendance: [{ session_date: dayStr(6), attended: false }],
      flags: [],
    }
    expect(JSON.stringify(evaluate(input))).toBe(JSON.stringify(evaluate(structuredClone(input))))
  })
  it('engine source has no AI SDK, network or wall-clock calls', () => {
    const dir = join(process.cwd(), 'src', 'engine')
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts'))) {
      const src = readFileSync(join(dir, f), 'utf8')
      expect(src, f).not.toMatch(/anthropic|openai|fetch\(|Date\.now\(|supabase/i)
    }
  })
  it('every rule cites a source', () => {
    for (const [id, r] of Object.entries(ENGINE_CONFIG.rules)) expect(r.source.length, id).toBeGreaterThan(10)
  })
})

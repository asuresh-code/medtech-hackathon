import { describe, expect, it } from 'vitest'
import { getItem } from '../shared/epds'
import { matchSpokenAnswer } from './speech'

const item1 = getItem(1).options
const item6 = getItem(6).options
const item10 = getItem(10).options

describe('matchSpokenAnswer (deterministic)', () => {
  it('matches exact option text', () => {
    expect(matchSpokenAnswer(['Not quite so much now'], item1)).toMatchObject({ kind: 'option', index: 1 })
    expect(matchSpokenAnswer(['never'], item10)).toMatchObject({ kind: 'option', index: 3 })
  })

  it('matches option numbers and ordinals', () => {
    expect(matchSpokenAnswer(['option two'], item1)).toMatchObject({ kind: 'option', index: 1 })
    expect(matchSpokenAnswer(['the third one'], item1)).toMatchObject({ kind: 'option', index: 2 })
    expect(matchSpokenAnswer(['4'], item1)).toMatchObject({ kind: 'option', index: 3 })
  })

  it('matches clear partial phrasing by word overlap', () => {
    expect(matchSpokenAnswer(['coping as well as ever'], item6)).toMatchObject({ kind: 'option', index: 3 })
    expect(matchSpokenAnswer(['hardly ever'], item10)).toMatchObject({ kind: 'option', index: 2 })
  })

  it('returns unknown rather than guessing when ambiguous', () => {
    expect(matchSpokenAnswer(['yes'], item1).kind).not.toBe('option')
    expect(matchSpokenAnswer(['banana'], item1)).toMatchObject({ kind: 'unknown' })
    expect(matchSpokenAnswer([''], item1)).toMatchObject({ kind: 'unknown' })
  })

  it('recognises change / yes / no commands', () => {
    expect(matchSpokenAnswer(['change'], item1).kind).toBe('change')
    expect(matchSpokenAnswer(['go back'], item1).kind).toBe('change')
    expect(matchSpokenAnswer(['yes'], []).kind).toBe('yes')
    expect(matchSpokenAnswer(['no'], []).kind).toBe('no')
  })

  it('tries later alternatives when the first is unclear', () => {
    expect(matchSpokenAnswer(['mumble', 'not at all'], item1)).toMatchObject({ kind: 'option', index: 3 })
  })
})

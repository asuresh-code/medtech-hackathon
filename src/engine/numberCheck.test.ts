import { describe, expect, it } from 'vitest'
import { checkSummary } from './numberCheck'

const input = '7-day total 11; baseline 6; 2 missed check-ins; note: "Tired."'
describe('checkSummary', () => {
  it('accepts numbers from the input', () => expect(checkSummary('Total 11 against baseline 6, with 2 missed check-ins.', input).ok).toBe(true))
  it('rejects a new number', () => expect(checkSummary('Total rose by 5.', input).ok).toBe(false))
  for (const w of ['depressed', 'Depression', 'risk', 'recommend', 'should', 'fine', 'reassuring']) {
    it(`rejects "${w}"`, () => expect(checkSummary(`She seems ${w}.`, input).ok).toBe(false))
  }
  it('rejects empty', () => expect(checkSummary('  ', input).ok).toBe(false))
})

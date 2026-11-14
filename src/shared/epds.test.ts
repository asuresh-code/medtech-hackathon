import { describe, expect, it } from 'vitest'
import { EPDS_ITEMS, isPositiveSelfHarm } from './epds'

describe('EPDS contract', () => {
  it('has 10 items, each with 4 options scoring 0-3 exactly once', () => {
    expect(EPDS_ITEMS).toHaveLength(10)
    for (const item of EPDS_ITEMS) {
      expect(item.options.map((o) => o.value).sort()).toEqual([0, 1, 2, 3])
    }
  })

  it('item 10 is positive for anything other than "Never"', () => {
    expect(isPositiveSelfHarm(10, 0)).toBe(false)
    expect(isPositiveSelfHarm(10, 1)).toBe(true)
    expect(isPositiveSelfHarm(9, 3)).toBe(false)
  })
})

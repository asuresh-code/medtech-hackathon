// Next check-in: 2 days on at her hour (London); rotating groups so all 10 items (incl. item 10)
// land in every 7-day window. Deterministic.
import { addDays, fromLondon, toLondon } from './time.js'

export const ITEM_GROUPS: number[][] = [
  [1, 2, 3],
  [4, 5, 6, 10],
  [7, 8, 9],
]
export const CADENCE_DAYS = 2

export function nextItems(lastItems: readonly number[] | null): number[] {
  const idx = lastItems ? ITEM_GROUPS.findIndex((g) => g.join() === [...lastItems].sort((a, b) => a - b).join()) : -1
  return ITEM_GROUPS[(idx + 1) % ITEM_GROUPS.length]
}

export function nextCheckinAt(nowIso: string, hour: number): string {
  const day = addDays(toLondon(Date.parse(nowIso)), CADENCE_DAYS)
  return fromLondon(day, Math.min(23, Math.max(0, Math.round(hour)))).toISOString()
}

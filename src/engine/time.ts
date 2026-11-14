// Europe/London calendar helpers (DST-safe, no dependencies). Pure.
export const DAY_MS = 86_400_000
export const HOUR_MS = 3_600_000

export interface LocalDate {
  y: number
  m: number
  d: number
}

const fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  hourCycle: 'h23',
})

export function toLondon(t: number): LocalDate & { hh: number; mm: number; ss: number } {
  const p: Record<string, string> = {}
  for (const x of fmt.formatToParts(new Date(t))) p[x.type] = x.value
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour % 24, mm: +p.minute, ss: +p.second }
}

function offsetMs(t: number): number {
  const l = toLondon(t)
  return Date.UTC(l.y, l.m - 1, l.d, l.hh, l.mm, l.ss) - Math.floor(t / 1000) * 1000
}

/** UTC instant of a London wall-clock time. */
export function fromLondon(d: LocalDate, hh = 0, mm = 0): Date {
  const wall = Date.UTC(d.y, d.m - 1, d.d, hh, mm)
  return new Date(wall - offsetMs(wall - offsetMs(wall)))
}

export function addDays(d: LocalDate, n: number): LocalDate {
  const x = new Date(Date.UTC(d.y, d.m - 1, d.d + n))
  return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() }
}

export function isoDate(d: LocalDate): string {
  return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
}

export function isWorkingDay(d: LocalDate, holidays: readonly string[]): boolean {
  const wd = new Date(Date.UTC(d.y, d.m - 1, d.d)).getUTCDay()
  return wd !== 0 && wd !== 6 && !holidays.includes(isoDate(d))
}

export function addWorkingDays(start: LocalDate, n: number, holidays: readonly string[]): LocalDate {
  let d = start
  for (let counted = 0; counted < n; ) {
    d = addDays(d, 1)
    if (isWorkingDay(d, holidays)) counted++
  }
  return d
}

function clock(s: string): [number, number] {
  const [h = 0, m = 0] = s.split(':').map(Number)
  return [h, m]
}

/** 0 working days → end of today (London); n → working_day_end on the nth working day after today. */
export function dueAfter(now: number, workingDays: number, sameDayEnd: string, workingDayEnd: string, holidays: readonly string[]): string {
  const today = toLondon(now)
  if (workingDays === 0) return fromLondon(today, ...clock(sameDayEnd)).toISOString()
  return fromLondon(addWorkingDays(today, workingDays, holidays), ...clock(workingDayEnd)).toISOString()
}

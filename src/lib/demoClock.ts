// Demo-only clock offset so judges can see a week of check-ins in seconds.
// Stored per device in localStorage; real use has offset 0.

const KEY = 'aluna.demoOffsetDays'

function read(): number {
  try {
    return Number(localStorage.getItem(KEY) ?? '0') || 0
  } catch {
    return 0
  }
}

export function demoOffsetDays(): number {
  return read()
}

export function now(): Date {
  return new Date(Date.now() + read() * 86_400_000)
}

export function advanceDays(days: number): void {
  try {
    localStorage.setItem(KEY, String(read() + days))
  } catch {
    /* storage unavailable — demo control just won't persist */
  }
}

export function resetDemoClock(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

// Deterministic guard for the clinician AI summary: reject any output that introduces a number
// not present in the input, or uses diagnostic / risk / advice / reassurance language.
export const BANNED = /\b(depress\w*|pnd|anxiety disorder|risk\w*|recommend\w*|should|fine|reassur\w*|diagnos\w*|urgent)\b/i

const numbers = (s: string) => (s.match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n)))

export function checkSummary(output: string, input: string): { ok: true } | { ok: false; why: string } {
  if (!output.trim()) return { ok: false, why: 'empty' }
  const banned = output.match(BANNED)
  if (banned) return { ok: false, why: `banned word: ${banned[0]}` }
  const allowed = new Set(numbers(input))
  const extra = numbers(output).find((n) => !allowed.has(n))
  if (extra) return { ok: false, why: `number not in input: ${extra}` }
  return { ok: true }
}

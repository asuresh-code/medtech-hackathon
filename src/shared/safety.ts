// SHARED CONTRACT — deterministic safety-phrase check on free text (the optional note).
// Used client-side (to show crisis contacts immediately) and server-side by the engine (urgent flag).
// Dev B owns the phrase list content (safety-phrases.ts); Esme signs it off.
// This is a deliberately over-inclusive net: false positives are acceptable, misses are not.

import { SAFETY_PHRASES } from './safety-phrases.js'

export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Returns the matched phrase, or null. */
export function findSafetyPhrase(text: string | null | undefined): string | null {
  if (!text) return null
  const t = ` ${normalise(text)} `
  for (const p of SAFETY_PHRASES) {
    // Word-start match: "self harm" also catches "self harmed", "suicidal" etc.
    if (t.includes(` ${normalise(p)}`)) return p
  }
  return null
}

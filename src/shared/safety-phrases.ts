// SHARED CONTRACT content — owned by Dev B (extend to ~30 phrasings incl. indirect ones); Esme signs off.
// Over-inclusive by design: false positives are acceptable, misses are not.
// Kept as .ts (not .json) so Vercel functions can import it as a native ES module.

export const SAFETY_PHRASES_VERSION = "0.1-placeholder"

export const SAFETY_PHRASES: readonly string[] = [
  "kill myself",
  "killing myself",
  "suicide",
  "suicidal",
  "end it all",
  "end my life",
  "want to die",
  "wish i was dead",
  "wish i were dead",
  "better off without me",
  "better off dead",
  "harm myself",
  "hurt myself",
  "self harm",
  "cut myself",
  "can't go on",
  "cant go on",
  "no point living",
  "no reason to live",
  "want to disappear",
  "don't want to be here",
  "dont want to be here",
  "hurt the baby",
  "harm the baby",
  "hurt my baby",
  "harm my baby",
]

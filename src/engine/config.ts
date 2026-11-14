// Aluna rules engine config — from docs/research/deterministic-rules.md §4.
// Thresholds need clinical sign-off (Esme) before any claim of safety. Kept as .ts (CLAUDE.md rule 10).
export const ENGINE_CONFIG = {
  version: 'aluna-rules-0.2.0-draft',
  signedOffBy: null as string | null,
  timezone: 'Europe/London',
  windowHours: { value: 168, source: 'EPDS recall "in the past 7 days" (Cox, Holden & Sagovsky 1987)' },
  missedAfterHours: { value: 24, source: 'Placeholder agreed Dev A/B (docs/plan/B-engine-clinician.md decisions log)' },
  lookbackDays: { value: 14, source: 'Placeholder; SIGN 127 s4 "re-evaluated after two weeks"' },
  reflagAfterClosedDays: { value: 14, source: 'Placeholder; SIGN 169 s2.1 CBR "repeat ... in 2-4 weeks"' },
  priority: ['U1', 'U2', 'R1', 'R2', 'R3', 'D1', 'D4', 'D2', 'D3'] as const,
  rules: {
    U1: {
      enabled: true, level: 'urgent', owner: 'gp', due: { hours: 4 }, item10Min: 1, basis: 'guideline',
      source: 'SIGN 169 (2023) s2.1 CBR: Q10 >= 1 -> further assessment; EPDS form: item 10 > 0 "further assessment required right away"; NICE CG192 1.6.3, 1.6.5',
    },
    U2: {
      enabled: true, level: 'urgent', owner: 'gp', due: { hours: 4 }, basis: 'placeholder',
      source: 'MBRRACE-UK red flag "new thoughts or acts of violent self harm" (quoted in SIGN 169 s2.6); phrase list src/shared/safety-phrases.ts (needs sign-off)',
    },
    R1: {
      enabled: true, level: 'review', owner: 'gp', due: { workingDays: 2 }, totalMin: 13, basis: 'guideline',
      source: 'SIGN 169 s2.1 EBR (>=13 further assessment); Matthey 2004 (accepted 12/13); Levis et al. BMJ 2020;371:m4022',
    },
    R2: {
      enabled: true, level: 'review', owner: 'gp', due: { workingDays: 2 }, partialSumMin: 13, basis: 'guideline',
      source: 'As R1; a partial sum is a lower bound on the total (items score >= 0), so no prorating is needed',
    },
    R3: {
      enabled: false, level: 'review', owner: 'gp', due: { workingDays: 2 }, items: [3, 4, 5], subscaleMin: 6, basis: 'placeholder',
      source: 'Matthey 2008 (EPDS-3A >= 6); SIGN 169 s2.2 CBR; contra Fairbrother 2019',
    },
    D1: {
      enabled: true, level: 'drift', owner: 'hv', due: { workingDays: 5 }, riseMin: 4, basis: 'guideline',
      source: 'Matthey 2004 J Affect Disord 78:269 (EPDS reliable change index = 4 points)',
    },
    D4: {
      enabled: true, level: 'drift', owner: 'hv', due: { workingDays: 5 }, bandMin: 10, bandMax: 12, baselineMax: 9, basis: 'guideline',
      source: 'SIGN 169 s2.1 CBR (EPDS 10-12: monitor, repeat in 2-4 weeks); Levis 2020 (>=10 sens 0.85)',
    },
    D2: {
      enabled: true, level: 'drift', owner: 'hv', due: { workingDays: 5 }, missedMin: 2, itemRiseMin: 1, basis: 'placeholder',
      source: 'Aluna hypothesis (README); no published source',
    },
    D3: {
      enabled: true, level: 'drift', owner: 'hv', due: { workingDays: 5 }, consecutiveMissed: 3, basis: 'placeholder',
      source: 'MOMitor: Varma et al. mHealth 2025;11:46 (>3 consecutive non-responses -> call)',
    },
  },
}

export type EngineConfig = typeof ENGINE_CONFIG
export type RuleId = (typeof ENGINE_CONFIG.priority)[number]

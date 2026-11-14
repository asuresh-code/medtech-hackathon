// Versioned engine thresholds. Deterministic only — no LLM/ML influences any value here.
// PLACEHOLDERS pending clinical sign-off (Esme). Bump `version` on any change; every flag stores it.
// (.ts, not .json: Vercel functions run as native ESM and must not import .json — CLAUDE.md rule 10.)

export interface Threshold {
  value: number
  source: string
}

export interface EngineConfig {
  version: string
  window_days: Threshold
  item10_urgent_min: Threshold
  review_total_min: Threshold
  drift_rise_min: Threshold
  missed_grace_hours: Threshold
  missed_in_a_row_min: Threshold
  missed_any_min: Threshold
  missed_classes_min: Threshold
  lookback_days: Threshold
  due_working_days: { urgent: Threshold; review: Threshold; drift: Threshold }
  same_day_end: string // London wall clock, HH:MM
  working_day_end: string // London wall clock, HH:MM
  bank_holidays: string[] // England & Wales, YYYY-MM-DD
}

export const DEFAULT_CONFIG: EngineConfig = {
  version: 'engine-2026-11-14.1',
  window_days: { value: 7, source: 'EPDS recall period is "the past 7 days" (Cox, Holden & Sagovsky 1987)' },
  item10_urgent_min: {
    value: 1,
    source: 'EPDS item 10 (thoughts of self-harm): any answer above "Never" needs same-day clinical contact (NICE CG192 / local PMH pathway)',
  },
  review_total_min: {
    value: 13,
    source: 'EPDS >= 13 commonly used cut-off for probable depression (Cox et al. 1987; NICE CG192). Partial totals count because sums only rise',
  },
  drift_rise_min: {
    value: 4,
    source: 'Placeholder: rise of >= 4 over her own first complete window, approx. reliable-change on EPDS (Matthey 2004). Clinical sign-off pending',
  },
  missed_grace_hours: {
    value: 24,
    source: 'Agreed with Dev A: missed = completed_at still null 24 h after scheduled_for (placeholder)',
  },
  missed_in_a_row_min: { value: 3, source: 'Placeholder: silence as a signal — 3 consecutive missed check-ins (approx. 1 week)' },
  missed_any_min: { value: 2, source: 'Placeholder: >= 2 missed check-ins in look-back, combined with any rise vs baseline' },
  missed_classes_min: { value: 2, source: 'Placeholder: >= 2 missed group sessions in look-back, combined with any rise vs baseline' },
  lookback_days: { value: 14, source: 'Placeholder: look-back for missed check-ins / classes (D3)' },
  due_working_days: {
    urgent: { value: 0, source: 'Same day (NICE CG192 urgent assessment for self-harm thoughts)' },
    review: { value: 2, source: 'Placeholder: GP review within 2 working days' },
    drift: { value: 5, source: 'Placeholder: health visitor follow-up within 5 working days' },
  },
  same_day_end: '23:59',
  working_day_end: '18:00',
  bank_holidays: ['2026-12-25', '2026-12-28', '2027-01-01', '2027-03-26', '2027-03-29', '2027-05-03', '2027-05-31', '2027-08-30', '2027-12-27', '2027-12-28'],
}

# Aluna: deterministic rules specification (draft for clinical sign-off)

Status: **DRAFT, 14 Nov 2026.** Proposed rule set for `src/engine/**` (Dev B implements it). Every threshold below is either *guideline-derived* (cites a source I opened) or a *placeholder* (needs sign-off from Esme). None of them has been validated for Aluna's split, rolling administration (see §1.6). Synthetic data only.

---

## 1. Evidence base (what each source actually says)

All sources below were opened on 14 Nov 2026 unless they are marked **[UNVERIFIED]**.

### 1.1 EPDS cut-offs
| Source | What it says (quoted or close paraphrase) | Use in Aluna |
|---|---|---|
| **Cox, Holden & Sagovsky 1987**, Br J Psychiatry 150:782-6 (PMID 3651732) | Abstract: validated on 84 mothers; "satisfactory sensitivity and specificity, and ... sensitive to change in the severity of depression over time". The widely reproduced form adds: "A score of 10+ indicates the likelihood of depression"; "If any number other than '0' is picked for question number 10, further assessment is required right away"; "All ten items must be completed"; "in doubtful cases, it may be usefully repeated after 2 weeks". | Instrument and scoring. **[UNVERIFIED]** The full text is paywalled, so I could not check the original 12/13 (probable depression) and 9/10 (primary-care) figures against the paper. The 12/13 cut-off is confirmed second-hand by Matthey 2004 ("the accepted EPDS cut-off score of 12/13 for major depression (English-speaking women)"). |
| **SIGN 169** (Dec 2023; replaces SIGN 127), s2.1 | EBR: "Arrange a further assessment ... with an EPDS score of 13 or more." CBR: "For ... a positive score of 1 or above for Question 10 ... undertake or arrange further assessment". CBR: "EPDS score of 10-12, monitor and repeat assessment with the EPDS in 2-4 weeks' time." | **The main UK source for R1, U1 and D4.** |
| **SIGN 127** (2012, withdrawn) s4 | No single cut-off. "limited evidence on appropriate cut-offs"; "no clear evidence on the timing and number of administrations"; "re-evaluated after two weeks"; refer to the GP if there is "evidence of severe illness or suicidality". | Historical. It supports the re-evaluation interval. |
| **Levis et al. 2020**, BMJ 371:m4022 (IPD meta-analysis, 58 studies, n=15,557) | Cut-off ≥10: sens 0.85 / spec 0.84. ≥11: 0.81 / 0.88 (best combined). ≥13: 0.66 / 0.95. "To identify ... women with higher symptom levels, a cut-off of 13 or higher could be used. Lower cut-off values could be used if the intention is to avoid false negatives." | Explains the trade-off: ≥13 goes to the GP for review, and 10-12 goes to the HV for monitoring (D4). |
| **NICE CG192** (current web version) | 1.5.4: Whooley questions + GAD-2. 1.5.5: if positive, "consider using the EPDS or PHQ-9 as part of a full assessment or referring ... to her GP". 1.5.8: HV "should consider ... using the EPDS or the PHQ-9 as part of monitoring". 1.6.3: risk assessment covers "self-harm, suicidal thoughts and intent". 1.6.5: if there is risk of self-harm or suicide, "arrange help appropriate to the level of risk; inform all relevant healthcare professionals (including the GP)". | **NICE gives no EPDS cut-off and no item-10 rule.** It supports EPDS monitoring by the HV and routing to the GP. Do not quote NICE for "≥13". |
| NHS England / NHS Talking Therapies perinatal guidance | **[UNVERIFIED]** I did not open it. It is not needed for any threshold. | n/a |

### 1.2 Item 10 and the anxiety subscale
- **Item 10.** SIGN 169: a score of ≥1 means further assessment, and any disclosure of suicidal ideation is handled "in accordance with local policy". The EPDS form says "further assessment is required right away". So *any value ≥1* is guideline-derived. "Same day" is our operational choice (CLAUDE.md rule 6). No source I opened gives a number of hours.
- **EPDS-3A** (items 3+4+5, range 0-9). In **Matthey 2008**, Depress Anxiety 25:926-31 (n=238 women at 6 weeks), the optimum cut-off for women was **≥6**. **SIGN 169** s2.2 (CBR) says to "use anxiety items from the EPDS ... as part of the clinical assessment". On the other side, **Fairbrother et al. 2019**, J Affect Disord 250:363-70, concluded "Neither the EPDS/EPDS 3-A, nor the GAD-7/GAD-2 can be recommended for widespread use as a perinatal AD screening tool". **Verdict:** a subscale flag has some support but the evidence is contested. Ship it **disabled by default** (R3) and let Esme decide.

### 1.3 Reliable change (personal baseline)
**Matthey 2004**, J Affect Disord 78:269-72 (PMID 15013253): "The RCI for the EPDS is calculated to be four points. This is the size of difference between two scores which is needed for a clinician to be 95% confident that this change reflects a real change". So **X = 4** (a rise of ≥4 is reliable, and +3 is not). This comes from the literature; it is not an invented number. Caveat: the RCI was derived for two full administrations, not for a rolling, split window.

### 1.4 Missing items and partial windows
- The EPDS form says "All ten items must be completed". There is no EPDS-specific prorating rule in any source I opened.
- General practice: **Bell et al. 2016**, BMC Res Notes 9:479 (HADS simulation) recommends the "half rule" (mean-impute if at least half the items are answered) for individual-level scores. It also found that every method is biased when missingness depends on severity.
- **Aluna policy:** never prorate in order to *fire* a flag, because that would invent scores. Each item scores ≥0, so a **partial sum is a lower bound on the true total**. If a partial sum is ≥ threshold, the full total must also be ≥ threshold (R2, R3). Rules that need an exact total (D1, D4) require a complete window. The brief shows "n/10 items answered" and no imputed total.

### 1.5 Silence as a trigger
- **MOMitor (Univ. Florida).** Varma et al. 2025, *mHealth* 11:46 (open access, full text read): "More than three consecutive 'no response' statuses to any question flagged the study team ... contacted via phone ... to encourage participation". In the earlier ACOG abstract (Varma, ..., Roussos-Ross, *Obstet Gynecol* 2023;141(5S):65S-66S), EPDS ≥12 or three consecutive nonresponses triggered a nurse call. **[PARTLY VERIFIED]** The abstract page is behind a bot wall, so I checked it only through a search-engine extract plus Crossref metadata. Roussos-Ross et al. 2026, *J Clin Psychiatry* 87(4):26m16429 confirms nurse follow-up "due to participant requests or nonresponsiveness".
- **README correction.** I found no support in any source I opened for the README's "30.2% lost to follow-up" or "88.5% → 45.0%" figures. The 2026 paper reports 65.7% sensitivity and 92.6% specificity for the pre-screen item. Treat the README figures as unverified.
- **EMA non-compliance.** In Rintala et al. 2019 (*Psychol Assess* 31:226) compliance averaged 78% and declined over days. Rintala et al. 2020 (*Psychiatry Res* 286:112896) found that missingness was predicted by context (outside home, disturbed by the prompt, evenings), and that "participants with depression tended to be more compliant". **So silence is a reason to make contact, not evidence of deterioration.** D3 is worded and routed that way: to the HV, with no risk language.

### 1.6 MBRRACE-UK red flags, and our limits
- SIGN 169 s2.6 quotes the MBRRACE-UK red flags for "urgent senior psychiatric assessment": "recent significant change in mental state or emergence of new symptoms; new thoughts or acts of violent self harm; new and persistent expressions of incompetency as a mother or estrangement from the infant; severe difficulties with sleeping". The MBRRACE 2015 lay summary (opened) gives the same list in lay words, plus "Do you feel you are getting worse?". These red flags support U1/U2 (self-harm), and they support baseline drift (D1) as a "change in mental state" signal. Aluna does **not** detect psychosis or estrangement. The brief must say so.
- **Validity caveat.** The EPDS was validated as all 10 items at one sitting with "past 7 days" recall. A rolling window of split answers covers up to 14 days of experience, and no cut-off has been validated for split administration (SIGN 127: "no clear evidence on the timing and number of administrations"). Say this to judges.

---

## 2. Definitions (all deterministic; `now` is passed in, and the engine never calls `Date.now()`)
- **Window W(now)** = answers with `now − 168 h < answered_at ≤ now`. An answer 167 h old is in, and one 168 h old is out. Clamp any `answered_at > now` (device clock skew) to `now`.
- **Latest per item** = for each item, the answer in W with the greatest `answered_at`. **Complete** = all 10 items present. **Partial** = 1-9 present. **Total** = sum of the latest values (only defined when complete). **Partial sum** = sum over the items present.
- **Baseline** = the *first complete window*: in ascending `answered_at` order, the first instant t at which W(t) is complete. `baseline_items` = latest per item at t, and `baseline_total` = their sum. It is set once and never auto-updated, and it is recomputable from data, so no new column is needed (`women.baseline_total` caches it). If baseline is null, D1/D2 cannot fire, but U/R rules still can.
- **Check-in states.** *Completed* = `completed_at` not null, even if late (a late answer counts as completed, and its answers enter W by `answered_at`). *Missed* = `completed_at` null **and** `now ≥ scheduled_for + 24 h`. *Pending* = otherwise. *Resolved* = completed or missed. Answers saved on an abandoned (missed) check-in still count in W.
- **Missed class** = an `attendance` row with `attended = false` and `session_date` in the last 14 days.
- **Item-matched rise** (D2) = Σ over the items present in W of (latest − baseline value for that item). A value ≥1 is "any rise".
- **Evidence id** = the answer id (U1) or check-in id (U2) that made a rule fire. It is stored in `audit_log.detail` of `flag.created`.

## 3. Rule set

| rule_id | level | condition (testable) | owner | due | source | basis |
|---|---|---|---|---|---|---|
| **U1** | urgent | There is an item-10 answer with `value ≥ 1` whose answer id is not already the evidence of a U1 flag. **Not window-bound**, and it includes abandoned check-ins. | `gp_id` | +4 h ("same day") | SIGN 169 s2.1 CBR; EPDS form (item 10 "right away"); NICE 1.6.3, 1.6.5 | threshold guideline-derived; **due time placeholder** |
| **U2** | urgent | `findSafetyPhrase(note_text) ≠ null` on a check-in whose id is not already the evidence of a U2 flag | `gp_id` | +4 h | MBRRACE red flag "new thoughts or acts of violent self harm" (via SIGN 169 s2.6); NICE 1.6.5 | deterministic phrase match; **phrase list placeholder** |
| **R1** | review | W complete **and** total ≥ 13 | `gp_id` | 2 working days | SIGN 169 EBR (≥13); Matthey 2004 (12/13); Levis 2020 | guideline-derived; due placeholder |
| **R2** | review | W partial **and** partial sum ≥ 13 | `gp_id` | 2 working days | as R1, plus the lower-bound argument in §1.4 | derived from R1 |
| **R3** *(off by default)* | review | EPDS-3A sum of items 3, 4, 5 present in W ≥ 6 (partial allowed, because it is a lower bound) | `gp_id` | 2 working days | Matthey 2008; SIGN 169 s2.2 CBR; *contra* Fairbrother 2019 | research-derived, contested; **needs sign-off** |
| **D1** | drift | baseline set, W complete, **and** total ≥ baseline_total + 4 | `hv_id` | 5 working days | Matthey 2004 RCI = 4; MBRRACE "recent significant change" | research-derived; not validated for split use |
| **D4** | drift | W complete, total in 10-12, **and** (baseline_total ≤ 9 **or** this W is the baseline window) | `hv_id` | 5 working days | SIGN 169 CBR (10-12: monitor, repeat in 2-4 weeks); Levis 2020 (≥10 sens 0.85) | band guideline-derived; entry logic placeholder |
| **D2** | drift | (missed check-ins + missed classes in the last 14 days) ≥ 2 **and** item-matched rise ≥ 1 | `hv_id` | 5 working days | No published source. This is Aluna's hypothesis (README) | **placeholder** |
| **D3** | drift | The 3 most recent *resolved* check-ins are all missed | `hv_id` | 5 working days | MOMitor (Varma 2025; ACOG 2023 abstract) | placeholder (engagement prompt, not risk) |

**Precedence, de-duplication and re-flagging**
1. `evaluate()` returns every rule that fired (`fired[]`) plus `top`. Top = highest level, and ties go by priority order `U1 U2 R1 R2 R3 D1 D4 D2 D3`. The reason line comes from `top`, and `fired[]` goes into the audit detail.
2. **Urgent rules are keyed by evidence.** Each new piece of evidence creates one urgent flag, even if other flags are open, because a new disclosure restarts the same-day clock. The same evidence never creates a second flag.
3. **Review and drift rules.** Create a flag for `top` only if (a) the woman has no open flag at a level ≥ `top.level`, **and** (b) this rule has never fired, **or** its last flag is closed and either `trigger_value > last trigger_value` or the closure was ≥ 14 days ago. The 14 days is a placeholder, based on SIGN 127's "re-evaluate after two weeks" and SIGN 169's "2-4 weeks". In short, a new flag is raised only on escalation, a worse value, or after a re-arm interval. If `top` is suppressed, no lower rule is raised in its place (#41: a closed R1 at 14 does not turn into a D1).
4. **The engine never closes a flag.** Lower open flags stay open after an escalation. The clinician closes them through a decision (CLAUDE.md rule 4).
5. Working days are Mon-Fri, Europe/London. Bank holidays are ignored in the prototype.

## 4. Proposed engine config (`src/engine/config.ts`, a `.ts` module per CLAUDE.md rule 10)
```ts
// Proposed by docs/research/deterministic-rules.md. Thresholds need clinical sign-off before any claim of safety.
export const ENGINE_CONFIG = {
  version: 'aluna-rules-0.2.0-draft',
  signedOffBy: null as string | null, // Esme, with date, once reviewed
  timezone: 'Europe/London',
  windowHours: { value: 168, source: 'EPDS recall "in the past 7 days" (Cox, Holden & Sagovsky 1987)' },
  missedAfterHours: { value: 24, source: 'Placeholder agreed Dev A/B (docs/plan/B-engine-clinician.md decisions log)' },
  lookbackDays: { value: 14, source: 'Placeholder; SIGN 127 s4 "re-evaluated after two weeks"' },
  reflagAfterClosedDays: { value: 14, source: 'Placeholder; SIGN 169 s2.1 CBR "repeat ... in 2-4 weeks"' },
  priority: ['U1', 'U2', 'R1', 'R2', 'R3', 'D1', 'D4', 'D2', 'D3'],
  rules: {
    U1: { enabled: true, level: 'urgent', owner: 'gp', due: { hours: 4 }, item10Min: 1, basis: 'guideline',
      source: 'SIGN 169 (2023) s2.1 CBR: Q10 >= 1 -> further assessment; EPDS form: item 10 > 0 "further assessment required right away"; NICE CG192 1.6.3, 1.6.5',
      dueSource: 'Placeholder: "same day" (CLAUDE.md rule 6); no guideline states hours' },
    U2: { enabled: true, level: 'urgent', owner: 'gp', due: { hours: 4 }, basis: 'placeholder',
      source: 'MBRRACE-UK red flag "new thoughts or acts of violent self harm" (quoted in SIGN 169 s2.6); phrase list src/shared/safety-phrases.ts (needs sign-off)' },
    R1: { enabled: true, level: 'review', owner: 'gp', due: { workingDays: 2 }, totalMin: 13, basis: 'guideline',
      source: 'SIGN 169 s2.1 EBR (>=13 further assessment); Matthey 2004 (accepted 12/13); Levis et al. BMJ 2020;371:m4022 (>=13 spec 0.95)' },
    R2: { enabled: true, level: 'review', owner: 'gp', due: { workingDays: 2 }, partialSumMin: 13, basis: 'guideline',
      source: 'As R1; a partial sum is a lower bound on the total (items score >= 0), so no prorating is needed' },
    R3: { enabled: false, level: 'review', owner: 'gp', due: { workingDays: 2 }, items: [3, 4, 5], subscaleMin: 6, basis: 'placeholder',
      source: 'Matthey 2008 Depress Anxiety 25:926 (EPDS-3A >= 6, women 6 wk); SIGN 169 s2.2 CBR; contra Fairbrother 2019 JAD 250:363' },
    D1: { enabled: true, level: 'drift', owner: 'hv', due: { workingDays: 5 }, riseMin: 4, basis: 'guideline',
      source: 'Matthey 2004 J Affect Disord 78:269 (EPDS reliable change index = 4 points)' },
    D4: { enabled: true, level: 'drift', owner: 'hv', due: { workingDays: 5 }, bandMin: 10, bandMax: 12, basis: 'guideline',
      source: 'SIGN 169 s2.1 CBR (EPDS 10-12: monitor, repeat in 2-4 weeks); Levis 2020 (>=10 sens 0.85)' },
    D2: { enabled: true, level: 'drift', owner: 'hv', due: { workingDays: 5 }, missedMin: 2, itemRiseMin: 1, basis: 'placeholder',
      source: 'Aluna hypothesis (README); no published source' },
    D3: { enabled: true, level: 'drift', owner: 'hv', due: { workingDays: 5 }, consecutiveMissed: 3, basis: 'placeholder',
      source: 'MOMitor: Varma et al. mHealth 2025;11:46 (>3 consecutive non-responses -> call); Obstet Gynecol 2023;141(5S):65S' },
  },
} as const
```

## 5. Test cases (Vitest)
`now` = **2026-11-14T20:00Z**. "Cur [v1..v10]" means all 10 items answered 1-5 days before `now` unless stated. Default baseline **B6** = [1,1,1,1,0,1,0,1,0,0] (total 6). **B10** = [1,1,2,1,1,1,1,1,1,0]. **B8** = [1,1,1,1,1,1,1,1,0,0]. **B3** = [1,0,1,1,0,0,0,0,0,0]. Unless stated, all past check-ins are completed, there are no prior flags, and R3 is off. "–" = item not in W.

| # | Setup | Expected (top / also fired) |
|---|---|---|
| 1 | B6; Cur = B6 (6) | none |
| 2 | B6; Cur [0,0,0,0,0,0,0,0,0,1] (1) | **urgent U1** (item 10 = 1) |
| 3 | B6; Cur all 0 | none (item 10 = 0) |
| 4 | B6; Cur [2,2,2,2,2,2,2,2,0,2] (18) | **U1** / R1, D1 |
| 5 | B6; item 10 = 1 answered −9 d, never flagged; Cur = B6 | **U1** (not window-bound) |
| 6 | B6; item 10 = 2 at −3 d, then item 10 = 0 at −1 d; not yet flagged | **U1** (the earlier positive still counts) |
| 7 | as 6, but a U1 flag already holds that answer id (open or closed) | no new flag |
| 8 | B6; Cur = B6; note "they'd all be better off without me" | **urgent U2** |
| 9 | B6; Cur = B6; note "SELF-HARMED again last night" | **U2** (normalised match) |
| 10 | B6; Cur = B6; note "Lovely walk, baby slept" | none |
| 11 | B10; Cur [1,1,2,1,1,2,1,2,1,0] (12) | none (12 < 13; +2; D4 not met because baseline is in band) |
| 12 | B10; Cur [1,1,2,1,1,2,1,2,2,0] (13) | **review R1** |
| 13 | B10; partial [2,2,2,2,1,2,–,2,–,0] (13) | **review R2** |
| 14 | B10; partial [2,2,2,2,1,2,–,1,–,0] (12) | none |
| 15 | B10; Cur as #12 but item 1 (=1) answered exactly −167 h | **R1** (in window) |
| 16 | B10; as #15 but item 1 answered −168 h | none (item 1 out; partial sum 12) |
| 17 | B10; as #12 but item 1's only answer is 8 days old | none (partial 12) |
| 18 | B10; item 4 = 3 at −6 d and item 4 = 1 at −2 d (both in W); others as #11 | none (latest value used, so the total is 12; using the max would give 14) |
| 19 | B6; Cur [1,1,2,1,1,1,0,1,1,0] (9, +3) | none |
| 20 | B6; Cur [1,1,2,1,1,1,1,1,1,0] (10, +4) | **drift D1** / D4 |
| 21 | B3; Cur total 7 (+4) | **D1** |
| 22 | B3; Cur total 6 (+3) | none |
| 23 | B8; Cur total 10 (+2) | **D4** (entered the 10-12 band) |
| 24 | B8; Cur total 9 | none |
| 25 | No baseline; this evaluation completes the first window, total 11 | **D4** (baseline in band); baseline_total := 11 |
| 26 | No baseline; partial 6 items, sum 9 | none |
| 27 | No baseline; partial 6 items, sum 13 | **R2** |
| 28 | B6; check-ins at −8 d, −6 d, −3 d all missed; no answers in W | **D3** |
| 29 | B6; −8 d, −6 d missed; latest scheduled −23 h 59 m, not completed | none (latest still pending) |
| 30 | as 29 but latest scheduled exactly −24 h 00 m | **D3** |
| 31 | B6; −8 d missed, −6 d completed late (+30 h), −3 d missed; late answers = baseline values | none (run broken; no rise) |
| 32 | B6; 2 non-consecutive misses (−10 d, −4 d); items in W have item-matched rise +1 | **D2** |
| 33 | as 32, item-matched rise 0 | none |
| 34 | B6; no missed check-ins; classes missed −13 d and −6 d; Cur total 7 | **D2** |
| 35 | B6; 1 missed class −6 d + 1 missed check-in −4 d; rise +2 | **D2** (combined count) |
| 36 | B6; classes missed −15 d and −6 d; rise +2 | none (one is outside the 14-day lookback) |
| 37 | B6; Cur total 14 | **R1** / D1 (one flag only) |
| 38 | B6; open R1 (trigger 14); Cur 14 | no new flag |
| 39 | B6; open D1; Cur 13 | **new R1**; D1 stays open |
| 40 | B6; open R1; new item 10 = 1 | **new U1** |
| 41 | B6; R1 (trigger 14) closed −3 d → Cur 14: none · Cur 15: **R1** · closed −15 d with Cur 14: **R1** | re-flag rules |
| 42 | B6; R3 on; Cur [0,0,2,2,2,0,0,0,0,0] → **R3** · items 3-5 = 2,2,1 → none · R3 off with 2,2,2 → none | subscale |
| 43 | B6; item 10 = 2 saved on an abandoned check-in (`completed_at` null), engine run by the sweep | **U1** |
| 44 | Any case run twice with the same input | byte-identical output (determinism) |

## 6. Audit: "no LLM in decisions" (repo state 14 Nov 2026, branch `a/foundation`)
I searched `api/`, `src/`, `scripts/`, `tests/`, `supabase/`, `package.json`, `vercel.json` and `.env.example` for anthropic, openai, claude, gpt, llm, `fetch(` and AI hostnames. I also searched `dist/`.

| Where | What | Status | Can it touch flag / level / owner / due / routing / patient view? |
|---|---|---|---|
| `package.json` `@anthropic-ai/sdk` | Claude SDK | installed, **imported nowhere yet** | No |
| `api/summary.ts` (Dev B, planned) | Claude `claude-opus-5-5` writes the clinician summary | not written | Must not. See the guardrails |
| `api/numberCheck.ts` (planned) | deterministic post-check | not written | No (not an LLM) |
| `scripts/draft-phrases.ts` (planned) | build-time Claude drafts of phrase variants | not written | Only via text a human approves. Never at runtime |
| `scripts/generate-voice.ts` (Dev A) | **OpenAI `gpt-4o-mini-tts` or ElevenLabs TTS**, build-time, reads fixed approved lines + verbatim EPDS text → static mp3s in `public/voice/` | exists | No decisions. Risk: the audio could deviate from the text, so someone must listen to the item and crisis clips. Its `STYLE` prompt ("kind practice nurse") is a voice-tone issue only |
| `src/lib/speech.ts` | Browser speech recognition (vendor ML, which may run in the cloud) → **deterministic** regex match to the printed options | exists | It can change an *input* only if she accepts the option shown. Item 10 also needs an explicit confirm. Not a decision |
| `api/score.ts` (stub), `api/heartbeat.ts`, `api/join.ts`, `api/push-test.ts`, `api/_lib/*`, `src/patient/*` | no AI calls (patient `fetch` goes only to `/api/score`, `/api/join`, `/voice/manifest.json`) | exists | No |
| `dist/` bundle; `.env*` | no `anthropic` or `openai` strings in the bundle; AI keys are not `VITE_`-prefixed | checked | No |

**Guardrails Dev B must keep (each one testable)**
1. `src/engine/**` is pure: no `fetch`, no SDK import, no `Date.now()`, no DB access. Add a Vitest test that greps `src/engine` for `anthropic|openai|fetch\(|Date\.now` and fails on a match. Test #44 covers determinism.
2. Only `/api/score` and `/api/sweep` write `flags`, and only from `evaluate()` output. `api/summary.ts` inserts into `summaries` only. The engine never reads `summaries`.
3. The summary is **never stored on a flag**, never shown in queue rows, and never used to sort or filter the queue. The queue sorts by `level`, then `due_at`. The summary loads only inside the brief, is labelled "AI summary of data — not a clinical opinion", and is shown **beside** the raw item grid, totals, rule fired and notes.
4. The prompt input excludes the flag level, rule and thresholds, so the model has nothing to restate as risk. It contains only answers, dates, completion, attendance and the notes verbatim.
5. Number check: convert number words (one to thirty) to digits, then every number must appear in the input. Text inside quotation marks must be an exact substring of a note. Banned words: depress*, PND, anxiety disorder, diagnos*, risk, recommend, should, fine, reassur*, safe, concern*. On failure show "Summary unavailable — see data", with no retry on looser checks. Log `summary.generated` / `summary.rejected` with the model id and source hash.
6. Patient side: no LLM call. The `/api/score` response stays `{ok, next_checkin}`. A CI test greps `dist/` for `anthropic` and fails on a match.
7. `draft-phrases.ts` writes to a drafts file **outside** `src/content/` and `src/shared/`. A human copies approved lines across. If Claude is used to brainstorm `safety-phrases.ts`, Esme approves every line and the version is bumped. The LLM then has influenced the *content* of U2's list, but it is not in the runtime decision path. Disclose this.
8. Re-listen to TTS clips for all EPDS items and crisis lines after each `npm run voice`.

## 7. How to say this to judges
"Every flag in Aluna comes from about a dozen lines of rules you can read on one slide, and each threshold cites its source: SIGN 169 for 13 and for item 10, Matthey's reliable-change index for a rise of 4, and SIGN's 10-12 'monitor' band. The same answers always give the same flag, and 44 unit tests pin every boundary. The AI never sees a score threshold or a flag level. It writes three factual sentences for the clinician, and we reject those if they contain a number that isn't in her data or any risk or diagnostic word. It sits beside the raw data and never touches the queue. The patient never talks to an AI. What we have *not* done is validate these cut-offs for answers split across a week, and that is the first thing a pilot would test."

## Sources (opened 14 Nov 2026)
SIGN 169 (2023): sign.ac.uk/media/2172/sign-169-perinatal.pdf · SIGN 127 (2012): sign.ac.uk/assets/sign127_update.pdf · NICE CG192 recommendations: nice.org.uk/guidance/cg192/chapter/Recommendations · Levis 2020 BMJ (PMID 33177069) · Matthey 2004 (PMID 15013253) · Matthey 2008 (PMID 18041072) · Fairbrother 2019 (PMID 30877859) · Cox 1987 abstract (PMID 3651732) and reproduced EPDS form (nj.gov/health/fhs/maternalchild/documents/PPD-Edinburgh-Scale.pdf) · Bell 2016 (PMID 27770833) · Varma 2025 mHealth (PMC12593978) · Roussos-Ross 2026 (PMID 42726635) · Varma 2023 Obstet Gynecol abstract (doi 10.1097/01.AOG.0000930604.07054.e0, metadata only) · Rintala 2019 (PMID 30394762), 2020 (PMID 32146247) · MBRRACE-UK 2015 lay summary (npeu.ox.ac.uk).

# Engagement techniques for Aluna: research basis

Scope: techniques to keep postnatal women (6 weeks to 12 months) doing 3-4 EPDS items every 2-3 days, within Aluna's constraints. These are: no streaks, guilt or "you missed" copy; no score-like gamification; no scores or verdicts shown to her; one prompt plus one reminder per check-in; an impersonal tool, not an AI friend; no chatbot.

Verification key: **[V]** means the source was opened (publisher page, Europe PMC record, Crossref or institutional repository) and the claim was checked against its abstract or full text. **[V-abs]** means only the abstract or metadata was checked. **[UNVERIFIED]** means the claim comes only from secondary sources.

Compiled 2026-11-14.

Two rules from CLAUDE.md apply to every build idea below:
- All patient-facing copy, including notification variants, onboarding cues and the reschedule suggestion, must be fixed approved lines in `src/content/phrases`. No generated text.
- EPDS item 10 is never dropped or skipped when items roll forward.

---

## Summary: top 8 techniques

Ranked by evidence strength (higher is better) and build effort (lower is better).

| # | Technique | Evidence | Effort | Key source |
|---|---|---|---|---|
| 1 | **Keep every check-in tiny** (3-4 items, under 60 s, no free text required) | Randomised experiment + meta-analysis | Already in the design | Eisele et al. 2022; Wrzus & Neubauer 2023 |
| 2 | **Name the human who reads it** ("Read by Sarah, your health visitor") | Meta-analysis of RCTs + theory | Low | Musiat et al. 2022; Mohr et al. 2011 |
| 3 | **One prompt, one reminder, at a time she picks** | Micro-randomised trials | Low | Bidargaddi et al. 2018; Klasnja et al. 2019 |
| 4 | **Wide, forgiving answer window** (open until the next set is due) | UK perinatal mixed-methods study (n=23) | Low | Eisner et al. 2022 |
| 5 | **If-then plan at onboarding** ("After the first morning feed, I'll open Aluna") | Meta-analyses | Low | Gollwitzer & Sheeran 2006; Sheeran et al. 2024 |
| 6 | **Same cue, same context, no penalty for gaps** | Observational field study | Low (copy and scheduling) | Lally et al. 2010 |
| 7 | **Make answering easy enough for one thumb or voice, half asleep** | Theory + perinatal cognition data | Medium | Fogg 2009; Insana et al. 2013 |
| 8 | **Adapt the prompt time to when she actually answers** (JITAI-lite) | Framework + observational | Medium | Nahum-Shani et al. 2018; Künzler et al. 2019 |

---

## 1. Keep every check-in tiny

- **Claim:** Questionnaire length, more than prompt frequency, drives burden and lower compliance in repeated self-report.
- **Sources:**
  - Eisele G, Vachon H, Lafit G, et al. (2022). *The effects of sampling frequency and questionnaire length on perceived burden, compliance, and careless responding in experience sampling data in a student population.* **Assessment** 29(2):136-151. https://doi.org/10.1177/1073191120957102 **[V-abs]**. 163 students were randomised to 30 or 60 items, three, six or nine times a day, for 14 days. Longer questionnaires were linked to more burden and lower data quantity and quality; higher frequency was not.
  - Wrzus C, Neubauer AB (2023). *Ecological Momentary Assessment: A Meta-Analysis on Designs, Samples, and Compliance Across Research Fields.* **Assessment** 30(3):825-846. https://doi.org/10.1177/10731911211067538 **[V-abs]**. This covers 477 articles and 677,536 participants. Mean compliance was 79%. The number of prompts per day did not predict compliance or dropout. Financial incentives did.
- **Strength:** Strong. One randomised experiment (in students, not mothers) plus a large meta-analysis.
- **Caveat:** A 2025 reanalysis of the Eisele data (Viechtbauer et al., *Psychological Assessment*) suggests frequency, not length, affected careless responding **[V-abs, via search summary only]**.
- **Build for Aluna:** Cap each check-in at 3-4 EPDS items with one tap each and no mandatory free text. Show "3 quick questions" (a count of work, not a score) on the notification. Open straight onto question 1 from the notification. Send nothing after the last item except "Sent to Sarah. Thank you."

## 2. Name the human who reads it (supportive accountability)

- **Claim:** Human guidance raises completion of digital mental-health interventions. The proposed mechanism is accountability to a person seen as trustworthy, benevolent and expert, with process-focused expectations.
- **Sources:**
  - Musiat P, Johnson C, Atkinson M, Wilksch S, Wade T (2022). *Impact of guidance on intervention adherence in computerised interventions for mental health problems: a meta-analysis.* **Psychological Medicine** 52(2):229-240. https://doi.org/10.1017/S0033291721004621 **[V-abs]**. This covers 22 studies. Guidance increased the amount of the intervention completed (g = 0.29) and the odds of full completion (log OR 0.50), with about 12% higher full completion.
  - Mohr DC, Cuijpers P, Lehman K (2011). *Supportive Accountability: A Model for Providing Human Support to Enhance Adherence to eHealth Interventions.* **J Med Internet Res** 13(1):e30. https://doi.org/10.2196/jmir.1602 **[V-abs]**. This is a theoretical model (viewpoint), not a trial. It says expectations should be clear, process-oriented and agreed with the patient, and the benefits should be made explicit.
  - Baumeister H et al. (2014). *Internet Interventions* 1(4):205-215. This review reportedly found that guided interventions increased module completion. **[UNVERIFIED]**: we saw it only via secondary citation.
- **Strength:** Strong for "guidance raises completion" (meta-analysis of RCTs). Theoretical for the specific mechanism.
- **Build for Aluna:** Show the clinician's name, role and practice, and optionally a photo, at onboarding and on the confirmation screen ("Your answers go to Sarah Patel, health visitor, Riverside Practice. She looks at them every week."). Make the expectation process-based ("Sarah reads whatever you send") and never outcome-based. Aluna stays a neutral conduit: the human relationship belongs to the clinician, not the app. This is not an AI friend and there is no chat. A one-line "what happens next" statement makes the benefit explicit without showing a verdict.

## 3. One prompt, one reminder, at a time she picks

- **Claim:** A push notification measurably raises next-day engagement, but the effect is small, is larger at some times, and fades over weeks. More prompts are not the lever.
- **Sources:**
  - Bidargaddi N, Almirall D, Murphy S, Nahum-Shani I, et al. (2018). *To Prompt or Not to Prompt? A Microrandomized Trial of Time-Varying Push Notifications to Increase Proximal Engagement With a Mobile Health App.* **JMIR mHealth uHealth** 6(11):e10123. https://doi.org/10.2196/10123 **[V-abs]**. With 1,255 users over 89 days, a notification raised self-monitoring within 24 hours by 3.9% (RR 1.039). The effect was 8.7% on weekends and 2.5% on weekdays, and largest at weekend mid-day. It weakened over time, though not significantly.
  - Klasnja P, Smith S, Seewald NJ, et al. (2019). *Efficacy of Contextually Tailored Suggestions for Physical Activity: A Micro-randomized Optimization Trial of HeartSteps.* **Ann Behav Med** 53(6):573-582. https://doi.org/10.1093/abm/kay067 **[V-abs]**. The initial effect of a suggestion was large (+66% steps) and diminished over the 6 weeks, which is consistent with habituation.
  - De Leon E, Fuentes LW, Cohen JE (2014). *Characterizing periodic messaging interventions across health behaviors and media: systematic review.* **J Med Internet Res** 16(3):e93. https://doi.org/10.2196/jmir.2837 **[V-abs]**. In 42 of 55 studies, periodic prompts gave positive short-term outcomes. Few studies justified their timing.
- **Strength:** Strong for the existence of an effect (MRTs). Moderate for its size, which is small.
- **Build for Aluna:** At onboarding she picks a window ("usually mornings / afternoons / evenings"), with weekends optional. Send one prompt. Send one reminder about 4 hours later, or at the end of her chosen window. Then stop: never a third nudge. Rotate neutral copy from about 6 variants to blunt habituation (for example "3 questions for Sarah are ready"). Never use "you missed" copy. Respect quiet hours by default.

## 4. Wide, forgiving answer window

- **Claim:** In a UK perinatal pilot of daily app-based EPDS, most participants said a 2-hour answer window was too short and stopped them answering. They asked for 4-5 hours or "any time".
- **Source:** Eisner E, Lewis S, Stockton-Powdrell C, Agass R, Whelan P, Tower C (2022). *Digital screening for postnatal depression: mixed methods proof-of-concept study.* **BMC Pregnancy and Childbirth** 22:429. https://doi.org/10.1186/s12884-022-04756-2 **[V, full text via Europe PMC]**. The app was ClinTouch DAWN-P, with one alert a day between 09:00 and 19:00, a 2-hour window and a 30-minute snooze. 15 mothers and 8 partners took part. 67% of daily EPDS assessments were completed and 2 of 23 dropped out. 18 of 23 said the window was too short. Participants also wanted predictable prompt times, fewer prompts over time, and to "get something back".
- **Strength:** Moderate. Small mixed-methods study, but the population and NHS context match Aluna directly.
- **Build for Aluna:** A check-in stays open until the next set is due (2-3 days). Missed items roll forward quietly or are dropped. Never show a backlog or a counter. Neutral feedback answers the "get something back" request without scores: "Sent to Sarah on Tuesday" plus a static link to NHS perinatal mental health information.

## 5. If-then plan at onboarding (implementation intentions)

- **Claim:** Forming an "If situation X, then I will do Y" plan improves goal attainment, mainly by helping people get started and by automating the response to a cue.
- **Sources:**
  - Gollwitzer PM, Sheeran P (2006). *Implementation intentions and goal achievement: a meta-analysis of effects and processes.* **Advances in Experimental Social Psychology** 38:69-119. https://doi.org/10.1016/S0065-2601(06)38002-1 **[V-abs]**. This covers 94 tests, d = .65.
  - Sheeran P, Listrom O, Gollwitzer PM (2024). *The when and how of planning: meta-analysis of the scope and components of implementation intentions in 642 tests.* **European Review of Social Psychology**. https://doi.org/10.1080/10463283.2024.2334563 **[V-abs, via search summary]**. It reports d = .27 to .66 across outcomes. Bias-corrected estimates reported to be much smaller are **[UNVERIFIED]**.
- **Strength:** Strong that an effect exists (meta-analyses). Its size in this population is uncertain and probably modest.
- **Build for Aluna:** Add one onboarding screen: "When is a calm-ish moment most days?" She chooses a cue such as "after the first morning feed", "when baby naps", "with my first cup of tea" or "after the bedtime routine". Show it back as "After the first morning feed, I'll answer Aluna's questions," and use her chosen cue in the notification copy. It is editable at any time and never framed as a commitment she can fail.

## 6. Same cue, same context, no penalty for gaps (habit formation)

- **Claim:** Automaticity grows gradually with repetition in a consistent context. Time to plateau varies widely between people, and missing one opportunity did not materially affect habit formation.
- **Source:** Lally P, van Jaarsveld CHM, Potts HWW, Wardle J (2010). *How are habits formed: modelling habit formation in the real world.* **European Journal of Social Psychology** 40(6):998-1009. https://doi.org/10.1002/ejsp.674 **[V-abs via Crossref]**. 96 volunteers were followed for 12 weeks. Time to 95% of the plateau ranged from 18 to 254 days. Missing a single opportunity "did not materially affect" the process. The often-quoted median of 66 days is in the results, not the abstract we opened, so it is **[UNVERIFIED by us]**.
- **Strength:** Moderate. Observational and small, but widely replicated in principle.
- **Build for Aluna:** Keep the prompt tied to the same cue and time band rather than random times. This gives scientific cover for "no streaks": a gap does not reset anything, so the app never tells her it did. Anchor to "after" or "around" a feed, not "during" one. Lab evidence shows digital media use during breastfeeding halves the share of the feed mothers spend attending to the infant (Mason, Riccabona & Ventura 2024, *Front Dev Psychol*, https://doi.org/10.3389/fdpys.2024.1441486, **[V]**, n = 25).

## 7. Make answering easy enough for one thumb or voice, half asleep (ability over motivation)

- **Claim:** A behaviour happens when motivation, ability and a prompt coincide. When motivation is low, raising ability (making the task easier) is the dependable lever. Postpartum sleep loss measurably impairs attention for weeks.
- **Sources:**
  - Fogg BJ (2009). *A behavior model for persuasive design.* **Proceedings of Persuasive '09** (4th Int. Conf. on Persuasive Technology), pp. 1-7. https://doi.org/10.1145/1541948.1541999 **[V-abs, metadata via Crossref; full text not opened]**. This is a theory and design model, not empirically tested.
  - Insana SP, Williams KB, Montgomery-Downs HE (2013). *Sleep disturbance and neurobehavioral performance among postpartum women.* **Sleep** 36(1):73-81. https://doi.org/10.5665/sleep.2304 **[V-abs]**. 70 first-time mothers were followed with actigraphy and a daily vigilance test for 12 weeks. Their slowest reaction times were worse than controls' at every week, and performance kept worsening even as sleep improved.
- **Strength:** Theory (Fogg) plus observational physiology (Insana).
- **Build for Aluna:** Use full-width answer buttons in the bottom half of the screen for thumb reach, and keep the 4 EPDS options as plain words. Voice answering already exists, so default it on for notification launches at night. Skip re-login: use device-bound sessions with a PIN or biometric only when the app is reopened from cold. Autosave after every tap and resume mid-set. Use no animation or decision points beyond the answers themselves.

## 8. Adapt the prompt time to when she actually answers (JITAI-lite)

- **Claim:** Support should be delivered when the person is receptive and withheld when it would interrupt. Receptivity varies with time of day and phone use.
- **Sources:**
  - Nahum-Shani I, Smith SN, Spring BJ, et al. (2018). *Just-in-Time Adaptive Interventions (JITAIs) in Mobile Health: Key Components and Design Principles for Ongoing Health Behavior Support.* **Ann Behav Med** 52(6):446-462. https://doi.org/10.1007/s12160-016-9830-8 **[V-abs]**. This is a framework paper. Its components are decision points, tailoring variables, intervention options and decision rules, with the aim of "eliminating support provision that is interruptive".
  - Künzler F, Mishra V, Kramer J-N, Kotz D, Fleisch E, Kowatsch T (2019). *Exploring the State-of-Receptivity for mHealth Interventions.* **Proc ACM IMWUT** 3(4):140. https://doi.org/10.1145/3369805 **[V-abs]**. 189 participants were followed for 6 weeks. Day and time, battery level, phone interaction and location were associated with in-the-moment receptivity.
- **Strength:** Framework plus observational evidence. JITAIs are not proven for questionnaire completion.
- **Build for Aluna:** Use a deterministic rule, with no machine learning needed. If her last 3 completions all fell outside her chosen window, suggest moving it with one tap ("You often answer around 9pm. Move reminders there?"). Never send prompts between 23:00 and 06:00 unless she opts in. Send the reminder only if the app was not opened since the prompt. Log prompt time vs answer time so the GP or health visitor can see the pattern, which also makes the silence signal clearer.

---

## Supporting evidence (not in the top 8)

- **NICE NG183 (2020), Behaviour change: digital and mobile health interventions.** https://www.nice.org.uk/guidance/ng183 **[V, via UK Government Web Archive copy]**. Rec 1.1.3: use evidence-based behaviour change techniques ("goals and planning, feedback and monitoring, and social support"). Rec 1.1.8: involve potential users early and throughout development. Rec 1.1.9: use feedback to improve the intervention continuously. Its scope is lifestyle behaviours, not perinatal mental health screening, so cite it for principles only.
- **Doherty K, Marcano-Belisario J, Cohn M, et al. (2019).** *Engagement with Mental Health Screening on Mobile Devices: Results from an Antenatal Feasibility Study.* CHI 2019. https://doi.org/10.1145/3290605.3300416 **[V-abs, via search summary of repository abstract]**. 254 women across 14 NHS midwifery clinics made 2,280 reports. Of the 39 who reported risk, two-thirds had not been identified by in-clinic screening. Engagement held regardless of age and education. This is antenatal, not postnatal.
- **Davis JA et al. (2022).** *Understanding Engagement in Digital Mental Health and Well-being Programs for Women in the Perinatal Period: Systematic Review Without Meta-analysis.* JMIR 24(8):e36620. https://doi.org/10.2196/36620 **[V-abs]**. Across 16 studies, engagement metrics were too inconsistent to pool. This gap is worth naming: Aluna can log completion and time-to-answer in a standard way.
- **Eisner et al. 2022 (above):** a history of depression predicted lower app use (median 54% vs 77% completion). This directly supports treating silence as a clinical signal.

---

## Say this in the pitch (safe, cited)

1. "In a randomised experience-sampling study, longer questionnaires raised burden and lowered compliance, while more frequent prompts did not. So Aluna asks 3-4 questions at a time, never 10." (Eisele et al., *Assessment*, 2022)
2. "A meta-analysis of 22 studies found human guidance increases completion of digital mental-health programmes, with about 12% more people finishing. So every Aluna answer goes to a named health visitor or GP, not to an algorithm she talks to." (Musiat et al., *Psychological Medicine*, 2022)
3. "In a UK pilot, mothers completed 67% of daily app-based EPDS checks, and women with past depression used it less. So we treat silence as a signal, not a failure." (Eisner et al., *BMC Pregnancy and Childbirth*, 2022)
4. "Micro-randomised trials show a push notification helps, but only a little, and the effect fades. So Aluna sends one prompt and one reminder at a time she chose, and never nags." (Bidargaddi et al., *JMIR mHealth uHealth*, 2018; Klasnja et al., *Ann Behav Med*, 2019)

## Claims to avoid

- **"CareLoop/DAWN-P achieved 67% daily completion."** The 67% comes from the ClinTouch DAWN-P proof-of-concept: n = 23, including partners, run from late pregnancy to 6 weeks postpartum during COVID lockdown. We found no published outcomes from the later CareLoop PND feasibility RCT (ISRCTN10781027). Say "a UK proof-of-concept study".
- **"Splitting the EPDS across the week is validated."** It is not. DAWN-P validated daily, full 10-item EPDS with 24-hour recall against paper EPDS. Aluna's split-item weekly scheme needs its own validation, so present it as a prototype design choice.
- **"It takes 66 days (or 21 days) to form a habit."** Lally found a range of 18-254 days. Say "habits build gradually with a consistent cue, and a missed day doesn't reset them".
- **"Implementation intentions have a medium-to-large effect (d = .65)."** That is the 2006 estimate. The 2024 synthesis of 642 tests gives a range of .27-.66, and bias-corrected estimates are reportedly smaller. Say "consistently helps people get started".
- **"Supportive accountability is proven by Mohr 2011."** Mohr is a theoretical model. The evidence for guidance raising completion is Musiat 2022.
- **"Push notifications dramatically increase engagement."** The effect is about 4% relative and fades.
- **"Aluna is a just-in-time adaptive intervention."** It is a monitoring tool with a simple adaptive schedule. JITAI is a framework for interventions, and Aluna does not deliver treatment.
- **"Fogg's model proves..."** It is a design heuristic, not an empirically validated model.
- **"Answer during night feeds."** Anchor to after the feed. There is lab evidence that device use during feeds reduces maternal attention to the infant (Mason et al. 2024).
- **"78% of mothers use a device during feeds"** and other prevalence statistics seen only in secondary sources: **[UNVERIFIED]**. Do not quote them.

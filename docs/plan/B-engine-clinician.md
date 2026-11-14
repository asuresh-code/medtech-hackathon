# Dev B — Engine + Clinician app + AI summary

## Status (14 Nov, end of build)
Built by Dev A on branch `a/redesign` (Dev B had not started): `src/engine/**` (rules per docs/research/deterministic-rules.md, 47 tests), `api/score.ts`, the silence sweep inside `api/heartbeat.ts` (every 15 min via Supabase pg_cron), `scripts/seed.ts` (`npm run seed` resets the demo), and the clinician app in `src/clinician/**` (queue, brief, decisions, invite QR). **Not built:** `api/summary.ts` (AI summary; needs ANTHROPIC_API_KEY). Don't rebuild the rest; extend it.

Read `CLAUDE.md` and `docs/plan/00-shared.md` first. Stay in your folders.

**You own:** `src/engine/**`, `src/clinician/**` (replace the placeholder), `api/score.ts` (replace Dev A's stub — keep the contract), `api/summary.ts`, `api/numberCheck.ts`, `scripts/seed.ts`, `scripts/simulate.ts`, `scripts/draft-phrases.ts`, `tests/e2e/clinician.spec.ts`.
**Read-only contracts:** `src/shared/*` (you own the *content* of `safety-phrases.ts`), `supabase/migrations/*`, `package.json` — propose changes via PR.

## Engine (`src/engine/`) — deterministic, pure functions, versioned config
- `window.ts`: rolling 7-day window — latest answer per EPDS item within 7 days of `now`; partial total; complete-window total (all 10 present); baseline = her first complete window.
- `rules.ts` + `config.json`: `evaluate(input, config) → Flag-shaped result | null`. Highest wins:

| Level | Rule (placeholders — Esme signs off, cite source in config) | Owner | Due |
|---|---|---|---|
| urgent | latest item 10 ≠ "Never" (value > 0) OR `findSafetyPhrase(note)` | GP (`gp_id`) | same day |
| review | rolling 7-day total ≥ 13 (partial ≥ 13 also counts — sums only rise) | GP | 2 working days |
| drift | complete total ≥ baseline + X; OR (≥ 2 missed classes OR ≥ 2 missed check-ins) with any rise; OR ≥ 3 check-ins missed in a row | HV (`hv_id`) | 5 working days |

  Each result: `rule_id`, one-line human `reason` (e.g. "D3: 3 check-ins missed in a row"), `rule_version`, `owner_id`, `due_at`.
- `schedule.ts`: next check-in every 2–3 days at `usual_hour` (median hour of her last 5 completions, default 20); 3–4 items per check-in so all 10 land within each 7-day window **including item 10**; at most one reminder.
- Use `src/shared/safety.ts` for the phrase check (extend `safety-phrases.ts` to ~30 phrasings incl. indirect ones).

## API
- **`POST /api/score {checkin_id, now?}`** — replace the stub in `api/score.ts`. Keep: bearer-token auth via `callerId`, ownership check, `checkin.completed` audit. Add: load answers/check-ins/attendance/baseline with `adminClient()`, run `evaluate`, insert `flags` (avoid duplicates for the same open rule) + `audit_log` (`flag.created`), set `baseline_total` when the first complete window appears, schedule next check-in with `schedule.ts`. **Response stays `{ok, next_checkin}` — never a flag/score.**
- **`POST /api/summary {woman_id}`** — clinician bearer token; check `is_my_patient`. Anthropic TS SDK, `claude-opus-5-5`, `output_config.effort: "low"` (load the `claude-api` skill before writing it). Prompt: 3–4 factual sentences on what changed + her notes quoted; no diagnosis/condition names, risk, recommendations, reassurance; only numbers from the input. Post-check in `numberCheck.ts`: every number must appear in the input; banned words (depress*, PND, anxiety disorder, risk, recommend, should, fine, reassur*). Fail → `"Summary unavailable — see data"`. Cache in `summaries` by source hash.

## Clinician app (`src/clinician/`, route `/clinician/*`)
- Login: email + password (`supabase.auth.signInWithPassword`); demo logins from `npm run seed:dev`.
- **Queue**: urgent → review → drift; one reason per row, owner, due time, overdue highlighted (`--urgent` token only here).
- **Brief** (one page): 7-day item grid, rolling total vs baseline trend, check-in completion, class attendance, her notes quoted, rule fired, AI summary labelled *"AI summary of data — not a clinical opinion"* **beside** raw data. Opening it writes `audit_log` (`brief.viewed`).
- **Decision panel**: Contacted / Book GP review / Health visitor follow-up / Talking Therapies support / Refer to secondary care (reason required) / No action (reason required) → `decisions` + `audit_log`; close the flag. Primary-care options first.
- **Generate invite**: insert `invite_codes` (6 digits) and show QR (`/join?code=…`) + the code.
- Styling: `src/styles/tokens.css` (cream, neutral). SYNTHETIC badge on every screen.

## Scripts
- `seed.ts`: Sarah (drift: 11 vs baseline 6, missed 2 classes + 2 check-ins), Maya (review: 14), Priya (urgent: item 10), Ellie (stable) — ~3 weeks history each; reuse the clinicians from `dev-seed.ts`.
- `simulate.ts`: 200 synthetic trajectories → flag distribution, labelled "design simulation, not validation".
- `draft-phrases.ts`: build-time only — Claude drafts ~10 neutral variants per slot following CLAUDE.md voice rules → a drafts file for Esme. The app never calls Claude for patient text.

## Tests (Vitest, mock Claude)
Each flag + edges: item 10 alone → urgent; partial 13 → review; answers older than 7 days drop out; baseline+X−1 vs +X; missed classes/check-ins with/without rise; 3 missed in a row; highest wins; same input → same output. Schedule: all 10 items per 7-day window incl. item 10, ≤1 reminder. ~30 safety phrasings. Number check + banned words. Playwright `clinician.spec.ts`: Sarah shows as drift with the right reason → brief → decision → audit row.

## Order
Hour 1 engine + config + seed · Hour 2 tests + `/api/score` · Hour 3 queue, brief, decisions, invite · Hour 4 `/api/summary`, simulate, draft-phrases, e2e → **feature freeze**.

## Agreed with Dev A (decisions log)
- **Missed check-in** = `completed_at` still null 24 h after `scheduled_for` (24 h is a placeholder in engine config). Derived, no new DB column. A late completion counts as completed, not missed.
- **Silence sweep — approved, Dev B owns `api/sweep.ts`.** It finds overdue check-ins, re-runs the engine for those women (so D3 "3 missed in a row" fires when she goes quiet), and **schedules her next check-in after a miss** (otherwise her schedule stalls, because `/api/score` only runs on completion). Must be idempotent (no duplicate flags/check-ins). Triggers:
  1. Vercel Cron, once a day (Hobby plan limit) — add `"crons": [{ "path": "/api/sweep", "schedule": "0 7 * * *" }]` to `vercel.json` in your PR; protect with `CRON_SECRET` (Vercel sends `Authorization: Bearer <CRON_SECRET>`).
  2. When the clinician queue loads — call it with the clinician's bearer token; only sweep that clinician's patients.
  3. Accept an optional `now` (ISO) so the demo clock works: "advance days" on the patient side, then reload the queue → Sarah's silence flag appears.
- **Owners:** `gp_id` and `hv_id` are now NOT NULL (migration `20261114140000_require_named_owners.sql`). No fallback logic needed: urgent/review → `gp_id`, drift → `hv_id`.
- **Branch base:** branch from `main` after Mani merges `a/foundation` (contains rule 10, `safety-phrases.ts`, this log).

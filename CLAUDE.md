# Aluna — shared context for every Claude Code session

**The product was renamed from "Freya" to "Aluna".** README.md (research, safety, pitch) and docs/basicbrief.md (product essentials + do-nots) still say Freya — read them as Aluna.

Aluna: short, regular check-ins for women 6 weeks–12 months postnatal. EPDS questions are split across sessions every 2–3 days (all 10 within each rolling 7-day window). A **deterministic** engine compares her to her own baseline and treats silence as a signal. Flags go only to a **named primary-care clinician** who makes every decision. Goal: catch drift early and keep care in primary care (GP, health visitor, Talking Therapies) instead of escalating to secondary care. Hackathon prototype — **synthetic data only**.

Two developers work in parallel, each with their own Claude session, pushing to the same repo:
- **Dev A — platform + patient app** → `docs/plan/A-platform-patient.md`
- **Dev B — engine + clinician app + AI** → `docs/plan/B-engine-clinician.md`
- Shared rules, setup, git workflow → `docs/plan/00-shared.md`

## Non-negotiable product rules
1. **Deterministic scoring and flagging.** Pure TypeScript + versioned JSON config. No LLM/ML in scoring, flagging, prioritising or routing.
2. **The LLM never diagnoses, names a condition, assesses risk, recommends or reassures.** It is used only for (a) the clinician's factual summary (guarded by a number check + banned words, shown beside raw data) and (b) build-time drafting of phrase variants a human approves. **No live LLM on the patient side.**
3. **Nothing decided is shown to the patient**: no scores, thresholds, flags, levels, verdicts, streaks, "you're fine", "well done". Crisis contacts after a positive item 10 / disclosure are support info, not a verdict.
4. **The clinician makes every final decision.** Every flag has a named owner (`owner_id`) and a due time (`due_at`).
5. **Impersonal voice.** Aluna is a calm tool, not a friend: no "I", no feelings, no emojis, no memory of personal details, no open chat, no replies to her notes. Every close points outward to real people. All patient text comes from `src/content/phrases` (approved lines only).
6. **EPDS item 10** needs a deliberate, confirmed answer, has no default and can't be skipped; a positive answer shows crisis contacts immediately and raises an urgent flag (same-day).
7. **No streaks, guilt or "you missed…"**. One prompt per check-in + at most one reminder.
8. **Design:** cream, very neutral, low-blue-light night mode (`src/styles/tokens.css`). Patient UI never uses red/green. 48px+ tap targets. SYNTHETIC label on every screen.
9. Never commit secrets. `.env.local` is git-ignored.
10. **Vercel functions run as native ES modules.** In `api/**` and anything it imports (`src/shared/**`, `src/engine/**`), relative imports must end in `.js` (e.g. `import { evaluate } from "../src/engine/rules.js"`) and must not import `.json` files — use `.ts` modules for config. Otherwise the function crashes with ERR_MODULE_NOT_FOUND.

## Ownership (stay in your folders)
| Path | Owner |
|---|---|
| `src/shared/**` (types, epds, safety) , `supabase/migrations/**`, `package.json` | **Contracts** — change only via a PR the other dev has seen |
| `src/patient/**`, `src/lib/**`, `src/styles/**`, `src/content/**`, `public/**`, `api/join.ts`, `api/_lib/**`, `scripts/dev-seed.ts`, `scripts/rls-check.ts`, `scripts/make-icons.mjs`, `tests/e2e/patient.spec.ts` | Dev A |
| `src/engine/**`, `src/clinician/**`, `api/score.ts` (replace the stub), `api/sweep.ts`, the `crons` entry in `vercel.json`, `api/summary.ts`, `api/numberCheck.ts`, `scripts/seed.ts`, `scripts/simulate.ts`, `scripts/draft-phrases.ts`, `tests/e2e/clinician.spec.ts` | Dev B |

## Stack & commands
Vite + React 19 + TypeScript PWA · Supabase (Postgres, Auth, RLS; London) · Vercel (static + `/api` functions, region lhr1) · Anthropic SDK (`@anthropic-ai/sdk`, model `claude-opus-5-5`) for the clinician summary only.

```
npm run dev        # Vite only (no /api)            → http://localhost:5173
npm run dev:full   # vercel dev: Vite + /api        → http://localhost:3000
npm test           # Vitest unit tests
npm run typecheck  # tsc -b
npm run build
npm run seed:dev   # Dev A minimal seed (prints an invite code + clinician logins)
npm run rls-check  # proves patients can't read flags/scores
npm run e2e        # Playwright (needs app running + seed)
```

## Key contracts
- DB schema + RLS: `supabase/migrations/20261114090000_init.sql`. Patients read their own data only via `patient_me` (view, no scores), `checkins`; they can INSERT `item_answers` but never read them; no access to `flags`, `decisions`, `summaries`, `audit_log`, `attendance`.
- `POST /api/join {code}` → `{token_hash}` (Dev A). Client then calls `supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })`.
- `POST /api/score {checkin_id, now?}` → `{ok, next_checkin}` (Dev B; Dev A's stub exists). Called by the patient app after every check-in with the patient's bearer token. **Response must never contain a flag/score.**
- Types: `src/shared/types.ts`. EPDS text: `src/shared/epds.ts` (verbatim, cite Cox et al. 1987). Safety phrases: `src/shared/safety.ts` + `safety-phrases.ts`.
- Demo clock: the patient app passes `now` (ISO) to `/api/score`; the "+2 days" demo control shifts it.

# Dev A — Platform + Patient app

Read `CLAUDE.md` first. You own: scaffold, Supabase schema/RLS/auth, PWA, design tokens, patient app, speech, deploys, RLS check, patient E2E.

## Status
- [x] Vite + React + TS scaffold, deps, tsconfigs, `vercel.json` (lhr1, SPA rewrites)
- [x] PWA: manifest, icons (`npm run icons`), service worker (offline shell incl. crisis screen)
- [x] Contracts: `src/shared/types.ts`, `epds.ts`, `safety.ts`, migration with RLS + `patient_me` view
- [x] `/api/join` (invite code → magic-link token), `/api/score` **stub** (Dev B replaces)
- [x] Patient app: join, home (due/next check-in), check-in flow (one item per screen, voice read-aloud + spoken answers, item 10 confirm, optional note, neutral "your week" close), crisis screen, night mode, demo "+2 days" clock
- [x] Unit tests: speech matching, safety phrases, EPDS contract, phrase-library voice rules
- [x] `scripts/dev-seed.ts`, `scripts/rls-check.ts`, `tests/e2e/patient.spec.ts`
- [x] Supabase project created, migrations applied, `npm run seed:dev` + `npm run rls-check` green
- [x] Vercel (CLI deploys, project aluna), env vars set, production deploy
- [x] Patient + clinician E2E green on the production URL
- [ ] Fold in engagement notes (within CLAUDE.md voice rules)
- [ ] Esme approves every line in `src/content/phrases` + crisis wording; EPDS licence confirmed
- [x] Web Push: one prompt + max one reminder via /api/heartbeat (Supabase pg_cron every 15 min)

## Done when
A seeded patient signs in with a code, finishes a check-in by voice or tap, sees only neutral text, gets crisis contacts (offline too) on a positive item 10 or a disclosure; RLS check passes; production URL installed on a phone.

## Pitch
- QR codes: `public/qr/` (patient.png, clinician.png, printable sheet at /qr/index.html). Regenerate with `node scripts/make-qr.mjs <DEMO_INVITE_CODE>`.
- Shared judge code = `DEMO_INVITE_CODE` (Vercel env). Delete it after the event to switch it off.
- Before presenting: `npm run seed` (resets Priya/Maya/Sarah/Ellie + Alex).

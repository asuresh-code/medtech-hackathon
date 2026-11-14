# 00 — Shared: setup, accounts, git workflow

## Install (Windows, each laptop)
1. **Node.js LTS** — `winget install OpenJS.NodeJS.LTS` (or https://nodejs.org). Restart the terminal, check `node -v`.
2. **Git** — https://git-scm.com/download/win, then `git config --global user.name "…"` / `user.email "…"`.
3. **VS Code + Claude Code extension.**
4. **Vercel CLI** — `npm i -g vercel`, then `vercel login`.
5. **Supabase CLI** — no install needed: `npx supabase …`.
6. (Optional) **GitHub CLI** — `winget install GitHub.cli`, `gh auth login`.

## Accounts
- **GitHub**: repo `medtech-hackathon`; owner adds the other dev as collaborator.
- **Supabase** (Dev A owns): project `aluna`, region **London (eu-west-2)**. Invite Dev B to the org. Keys from Project Settings → API keys.
- **Vercel** (whoever owns the GitHub repo imports it): Add New → Project → import repo → framework **Vite**. Add env vars (below). Every push to `main` deploys production; every PR gets a Preview URL.
- **Anthropic** (Dev B owns): https://console.anthropic.com → API key. Put it in Vercel env vars and your own `.env.local` only.

## Environment (`.env.local`, git-ignored — copy from `.env.example`)
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # server only
ANTHROPIC_API_KEY=           # server only (Dev B)
```
Share keys by private DM / password manager. Never paste them into the repo or a public channel.

## Database
Migrations live in `supabase/migrations/`. Apply either way:
- **Easiest:** Supabase dashboard → SQL Editor → New query → paste the migration file → Run.
- **CLI:** `npx supabase login` → `npx supabase link --project-ref <ref>` → `npx supabase db push`.
Only Dev A edits migrations; Dev B asks via PR.

## Git workflow
- Branches: `a/<feature>` and `b/<feature>`. Small PRs into `main` every 45–60 min.
- `git pull origin main` before each new task.
- Stay in your own folders (see CLAUDE.md). Contracts (`src/shared/**`, migrations, `package.json`) only via a PR the other dev has seen.
- `package-lock.json` conflict → take `main`'s version, `npm install`, commit.
- Start each Claude session with: *"Read CLAUDE.md and docs/plan/<my file>. Work only in my folders."*

## Demo data
- `npm run seed:dev` (Dev A) — 1 patient (Sarah, W-DEV1), GP + HV + unlinked GP, prints an invite code. Password for demo clinicians: `aluna-demo-2026` (synthetic only).
- `scripts/seed.ts` (Dev B) — the full demo cast: Sarah (drift), Maya (review), Priya (urgent), Ellie (stable) with ~3 weeks of history.

## Testing overview
| What | Command | Owner |
|---|---|---|
| Unit (engine, schedule, safety, speech matching, phrase rules, number check) | `npm test` | both |
| RLS: patient can't read flags/scores; clinicians see only their patients | `npm run rls-check` | A |
| Patient E2E (iPhone + Pixel) incl. no-verdict scan, item 10 confirm, offline crisis | `npm run e2e -- tests/e2e/patient.spec.ts` | A |
| Clinician E2E | `npm run e2e -- tests/e2e/clinician.spec.ts` | B |
| Full run on production URL on a real phone, voice + night mode | manual, hour 4 | both |

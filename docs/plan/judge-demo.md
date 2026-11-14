# Judge demo: scan a QR, try both sides with your own sandbox

Status: **design only, not built.** Owners: Dev A (platform, patient, `/api/demo`) and Dev B (cast builder, clinician app). Synthetic data only.

## Recommendation (TL;DR)
- QR → `https://aluna-flame.vercel.app/demo`. The page shows two big buttons: **Try as a mother** and **Try as the GP**. A DEMO · SYNTHETIC DATA banner stays on every screen.
- **Each phone gets its own sandbox**, created when the page loads by `POST /api/demo` (service role). A sandbox is one judge mother "Alex" with ~2 weeks of history, plus the four cast women (Priya, Maya, Sarah, Ellie), a GP "Dr Okafor (you)" and a health visitor "Jo Bennett". Judges never collide and never see each other's answers.
- **No typing.** The same magic-link token-hash pattern as `/api/join` works for both roles. Demo users have no password, and `verifyOtp` signs in either one.
- **The two roles are linked.** Alex's GP is the judge's GP, so a demo-only **Switch to GP view** button shows the judge their own check-in in the queue a few seconds later.
- Safeguards: a 48 h TTL with lazy and daily clean-up, global and per-IP caps, a kill switch, no push or email for demo users, and a demo note on the crisis screen (the real numbers stay).
- Effort: about 65 min for Dev A and 50 min for Dev B, built in parallel. The only contract change is one migration plus one field in `types.ts`, reviewed by the other dev.

## 1. Landing page `/demo` (Dev A, route added in `src/App.tsx` before `*`)
- On load: fire `POST /api/demo {action:'start'}` straight away, so the sandbox is usually ready before the judge taps. Also prefetch the lazy `ClinicianApp` chunk. The buttons show "Setting up your private demo…" until the call returns. Add `<meta name="robots" content="noindex">`.
- If `localStorage['aluna.demo']` holds an unexpired demo id and a Supabase session exists, show **Continue as mother / Continue as GP** instead (this uses `switch`, below). Rescanning must not create a second sandbox.
- Wording:
  > **Try Aluna** · A one-minute demo on your own phone. Everything here is made up.
  > [ **Try as a mother** ] *Do a short check-in, the way she might at 3am.*
  > [ **Try as the GP** ] *See who needs attention today, why, and by when.*
  > Your demo is private to this phone: a made-up mother (Alex) and a made-up practice with four more patients. Switch sides any time. Deleted after 48 hours. Please don't enter real personal details.
- Banner (on every demo screen, replacing the corner badge): `DEMO · SYNTHETIC DATA · not a medical service` with a **Switch** button and **End demo**.
- On error or 429: show "The demo is busy right now. Try again in a minute, or watch the 90-second video" and link the video.

## 2. Isolation and provisioning
**One sandbox per phone.** Existing RLS already isolates it: the sandbox GP sees only women where `gp_id = me`, and Alex sees only herself. No policy changes are needed.

**`api/demo.ts` (Dev A), one function and two actions** (this keeps the Hobby function count low):
1. `start`: kill switch (`DEMO_ENABLED`) → rate limit → create 3 auth users in parallel with `admin.auth.admin.createUser({email, email_confirm:true, user_metadata:{demo_id, demo_role}})`, no password:
   - `demo-<id6>-mum@demo.aluna.example.com` (Alex)
   - `-gp@` (Dr Okafor, `role:'clinician'`, `job_title:'GP'`)
   - `-hv@` (Jo Bennett, Health visitor; never signed in, exists only as the owner of drift flags)
   
   Then insert `demo_sessions` and the profiles. Call `buildDemoCast({gpId, hvId, alexUserId, demoId, now})` (Dev B), which returns rows with client-made UUIDs plus engine-computed flags. Bulk-insert one table at a time: women → checkins → answers + attendance → flags + summaries. Finally run `generateLink({type:'magiclink'})` for both mum and GP in parallel and return `{demo_id, patient_token_hash, clinician_token_hash}`.
2. `switch {to}` with a Bearer token: `callerId` → find the `demo_sessions` row whose `patient_user_id` or `clinician_user_id` is the caller and that has not expired → return `{token_hash}` for the other user. The client runs `signOut({scope:'local'})` (never global), then `verifyOtp({token_hash, type:'magiclink'})`, then navigates to `/` or `/clinician`.
- Move the generic part of `patientSignInToken` into `signInToken(admin, email, metadata?)` in `api/_lib/supabaseAdmin.ts`. `/api/join` behaviour stays the same.
- Example.com addresses can't receive mail and `generateLink` sends none, so no email ever leaves the system.

**Time budget (target under 10 s):** camera to browser ~2 s, static page from CDN ~1 s, provision ~2–4 s (overlaps with reading), `verifyOtp` ~0.5 s, first screen ~1 s.

**Rate limit and abuse (public QR):**
- Global cap: 40 starts per 10 min and 150 active sandboxes, by counting `demo_sessions`.
- Per-IP cap: 20 per 10 min, keyed on `ip_hash = sha256(x-forwarded-for + DEMO_SALT)`. Never store the raw IP. Keep this cap high because all judges on venue wifi share one NAT IP.
- Turn the demo off after the event by setting `DEMO_ENABLED=false`.
- Anthropic cost: copy pre-generated cast summaries into each sandbox. Only Alex can trigger a live summary, capped at 3 per sandbox.

**Clean-up:** `expires_at = now() + 48 h`.
- Each `start` purges up to 5 expired sessions (lazy garbage collection).
- Dev B's daily `api/sweep` cron calls the same `purgeExpiredDemos()` from `api/_lib/demo.ts`.
- `scripts/demo-purge.ts [--all]` wipes everything after the event.
- Purge order: delete the `demo_sessions` row, which cascades to women and from there to checkins, answers, flags, decisions, summaries, invites and push rows. Then `auth.admin.deleteUser` × 3 (cascades to profiles). Then delete `audit_log` rows whose `actor_id` is one of those users.

**Schema: new migration `2026111416…_demo_sandbox.sql`. This is a CONTRACT change: Dev A writes it, Dev B reviews it.**
```sql
create table public.demo_sessions (
  id uuid primary key, patient_user_id uuid not null, clinician_user_id uuid not null, hv_user_id uuid not null,
  ip_hash text, created_at timestamptz not null default now(), expires_at timestamptz not null default now() + interval '48 hours');
alter table public.demo_sessions enable row level security;   -- no policies: service role only
alter table public.women add column demo_session uuid references public.demo_sessions (id) on delete cascade; -- null = main cast
create index on public.women (demo_session);
```
- `src/shared/types.ts` (contract): add `demo_session: string | null` to `Woman`.
- The client tells demo mode apart using `session.user.user_metadata.demo_id`, so no view or RLS change is needed.
- Pseudonyms stay unique: `D<id6>-ALEX`, `D<id6>-SARAH`, and so on.
- The main cast (`gp.demo` / `hv.demo`, used by the presenter) is untouched.

## 3. Mother path (~60 s)
1. Tap **Try as a mother** → "Hi Alex" → *Start check-in*. The due check-in is items **1, 2, 3**: gentle, and item 10 is already covered in her seeded window.
2. One question per screen. Tap, or use *Read aloud* and answer by voice where the browser supports it (iOS Safari will ask for microphone permission, so tap is the default).
3. Optional note → neutral close → **Your week**, the journal showing her own chosen words from `patient_answers` (no scores). If the journal screen isn't merged in time, the close screen's "your week" stands in.
4. **The "aha"**: the banner says *"Notice what you didn't see: no score, no verdict. Now see what her GP sees."* → **Switch to GP view**. The queue shows **Alex (you)** with today's answers in the brief grid. If the answers crossed a rule, a flag shows its reason, owner and due time.
- **Dev B tunes Alex's history**: baseline about 6, other items steady. Gentle answers produce no flag (the brief still updates). Choosing the harder options on 2–3 questions produces a **review** flag owned by Dr Okafor (you), due in 2 working days. The rules are not changed for the demo, so the result is honest.
- **Silence path**: from home, tap **+2 days** three times without checking in, then switch. The queue load calls `/api/sweep` with the demo clock `now` (shared `localStorage`, so it is the same offset on both roles). That raises Alex's **D3 "3 check-ins missed in a row"** drift flag, owned by Jo Bennett (HV). This is the "silence is a signal" moment.

## 4. GP path (~60–90 s)
The judge lands on the queue, sorted urgent → review → drift, with overdue items highlighted. Every row shows its owner and due time:

| Row | Reason (engine output) | Owner | Due |
|---|---|---|---|
| **Priya**, urgent | U1: item 10 answered other than "Never" (+ date) | Dr Okafor (you) | today |
| **Maya**, review | R1: 7-day total 14 (≥ 13) | Dr Okafor (you) | +2 working days |
| **Sarah**, drift | D2: total 11 vs baseline 6; missed 2 classes and 2 check-ins | Jo Bennett (HV) | +5 working days |
| Ellie, Alex (you) | No open flag. A "new answers today" chip after Alex checks in | n/a | n/a |

- **Queue scope (Dev B):** show *all* open flags for my patients and label the owner. Do not filter to `owner_id = me`, or Sarah's HV-owned flag disappears.
- Open **Sarah** → one-page brief: 7-day item grid, total vs baseline, completion, class attendance, her notes quoted, the rule that fired, and beside the raw data the *"AI summary of data, not a clinical opinion"* (copied in, so no live call). Opening the brief writes `brief.viewed`.
- **Decision**: *Health visitor follow-up* → the flag closes, the `decisions` and `audit_log` rows are written, and the queue re-sorts. *Refer to secondary care* and *No action* require a reason.
- Demo hint card (shown only if Alex has no answers yet): *"Switch to the mother's app, do a check-in, then come back: your answers will appear here."*
- `ClinicianApp` must accept an existing session and show the password form only when there is none.

## 5. Role switching on one phone
- Build the banner as one component, `src/demo/DemoBar.tsx` (new folder, Dev A). It renders only when `user_metadata.demo_id` is set and is used in both `PatientLayout` (Dev A) and the `ClinicianApp` layout (Dev B, a one-line import).
- Button label: **Switch to GP view** / **Switch to Alex's app**. It calls `switch` (~1 s). **End demo** signs out locally and returns to `/demo`.
- Real patients and clinicians never see the bar, because they have no `demo_id`.

## 6. Safety for a public demo
- **Labels:** the DemoBar appears on every demo screen, and the main-cast screens keep the existing SYNTHETIC badge. Every name is invented. Alex's notes are visible only to that judge's own GP and are deleted at TTL.
- **Crisis screen:** keep the **real** numbers (999, Samaritans 116 123, NHS 111, SHOUT) and working `tel:` links. A person scanning may genuinely need them, and showing the real behaviour is the point.
  - Add one demo-only line above them: *"This is a demo with made-up data. These are real UK services: contact them only if you need support yourself."*
  - On phones, `tel:` opens the dialler or a confirmation step; it does not call.
- **No outbound contact:**
  - Demo users never see the push opt-in.
  - The push sender and sweep skip women whose `demo_session is not null`.
  - No email (example.com addresses, and `generateLink` sends none) and no SMS.
  - Invite QRs created in a sandbox can only point at that sandbox's women.
- **Known gap (pre-existing):** `audit_clin_sel` lets *any* clinician read *all* audit rows, so a judge could see other sandboxes' audit events (ids and event names; details mostly null). Before the pitch, tighten it to `actor_id = auth.uid() or entity_id in (my women/flags/checkins)`. This is a contract change, so the other dev reviews it.
- Add one assertion to `npm run rls-check`: a sandbox GP sees zero main-cast women and zero women from another sandbox.

## 7. QR code
- URL: `https://aluna-flame.vercel.app/demo`. It is static, has no tracking redirect, and never expires.
- Generate it without touching `package.json`: `npx -y qrcode -t png -w 1200 -e M -o qr-demo.png "https://aluna-flame.vercel.app/demo"`. Keep the file off the repo, or put it in `public/` if you want to serve it.
  - Avoid free "dynamic QR" sites: they redirect through their own servers and some expire.
- On the slide: black on white, at least a quarter of the slide's height, with a quiet zone around it. Test from the back of the room with an iPhone camera and with Google Lens on Android.
- Printed fallback: an A6 card with the QR plus the typed URL `aluna-flame.vercel.app/demo`.
  - If a nicer name is free, add a second Vercel domain, for example `aluna-demo.vercel.app` (Project → Domains). Don't use bit.ly-style interstitials.

## 8. Failure plan
- **Backup video:** 90 s, portrait, both paths. It lives on the laptop (not streamed) and on an unlinked YouTube URL for the busy fallback.
- **Two phones signed in on mobile data at T-30 min:** phone A in a sandbox as Alex with a check-in due, phone B as the GP with the queue open. Presenters' laptop and phones use a personal hotspot, not venue wifi.
- **Freeze:** no deploys in the hour before the pitch. Keep the last good deployment ready for Vercel *Instant Rollback*.
- **Pre-warm (T-10 to T-0):**
  - Run `npm run demo:warm`, which calls `POST /api/demo {action:'warm'}`: a `select 1` plus module load, no sandbox.
  - Also hit `/api/score`, `/api/sweep` and `/api/summary` with an empty body (401 is fine; the point is to warm them), and open `/clinician` once.
  - Keep a laptop loop running during the pitch: `while true; do curl -s -X POST …/api/demo -d '{"action":"warm"}'; sleep 120; done`.
- **Auth limits:** check Supabase Auth → Rate limits. Token verifications must allow more than 60 per hour from one IP, because of the venue NAT.
- **Supabase down:** play the video and talk over phone B's screenshots.

## 9. Ownership and ordered tasks (~60–90 min wall clock, in parallel)
| # | Owner | Task | Effort |
|---|---|---|---|
| 1 | A | Migration `demo_sandbox.sql` + `Woman.demo_session` in `types.ts` → PR, B reviews (**contract**) | 10 m |
| 2 | B | `src/engine/demoCast.ts`: pure `buildDemoCast({gpId,hvId,alexUserId,demoId,now})` → rows + engine flags + copied summaries (refactor from `scripts/seed.ts`; `.js` imports, no JSON); tune Alex's history | 25 m |
| 3 | A | `api/_lib/demo.ts` (`signInToken`, rate limit, `purgeExpiredDemos`) + `api/demo.ts` (`start` / `switch` / `warm`), using a stub `buildDemoCast` until #2 lands | 25 m |
| 4 | A | `/demo` page, `src/demo/DemoBar.tsx`, switch logic, crisis demo line, hide push for demo users, route in `App.tsx` | 20 m |
| 5 | B | `ClinicianApp`: reuse an existing session, mount DemoBar, show all flags with owner labels, "(you)" chip on Alex, hint card | 20 m |
| 6 | B | Sweep: skip push for demo women and call `purgeExpiredDemos`; summary cap (3 per sandbox) | 10 m |
| 7 | A | `scripts/demo-purge.ts`, `demo:warm`, rls-check assertion, QR image | 10 m |
| 8 | A+B | Test with 3 phones at once on production: scan → both paths → switch → flag appears → purge | 15 m |

Interface to agree first (5 min, before #2 and #3): the return shape of `buildDemoCast` and the fact that it runs `evaluate` in memory, so `/api/demo` makes no further engine calls.

## Open questions for the team
1. TTL: 24 h or 48 h? It depends on whether judges deliberate the next day.
2. The judge mother's name: is "Alex" fine? Should the GP be "Dr Okafor (you)" or a neutral "Dr Demo"?
3. Build only on-demand provisioning (recommended), or also pre-create a **warm pool** of 20 sandboxes at T-1 h, claimed with `FOR UPDATE SKIP LOCKED` (+20 min and one RPC)?
4. Can Alex's free-text note go to Anthropic for a live summary, or should a demo sandbox show "Summary unavailable, see data"?
5. Tighten `audit_clin_sel` now (recommended) or accept the gap for the demo?
6. Esme: sign off the demo line on the crisis screen and the landing-page copy.

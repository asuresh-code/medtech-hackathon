# Dev B's clinician app (archived)

Built by Dev B on `b/clinician` and merged to `main` in PR #3 (14 Nov, 14:26). At the same time Dev A had built a
clinician app on `a/redesign`, which was already deployed and covered by the end-to-end tests and the judge QR demo
(one-tap demo logins). The team chose to ship Dev A's version; this folder keeps Dev B's files unchanged so nothing
is lost.

Ideas worth porting into `src/clinician/` later: the separate Invite page, the dependency-free QR encoder (`qr.ts`),
"(you)" on owner labels, the demo-clock banner, and the "Not a clinician account" screen.

These files are outside `src/`, so they are not compiled, bundled or deployed.

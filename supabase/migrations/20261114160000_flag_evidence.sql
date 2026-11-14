-- Engine de-duplication + re-flag rules (docs/research/deterministic-rules.md §3).
alter table public.flags add column if not exists evidence_id text;      -- answer id (U1) / check-in id (U2)
alter table public.flags add column if not exists trigger_value int;     -- e.g. the total that fired R1/D1
alter table public.flags add column if not exists closed_at timestamptz; -- set by the clinician's decision
create index if not exists flags_woman_rule on public.flags (woman_id, rule_id, status);

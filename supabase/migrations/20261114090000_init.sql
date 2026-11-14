-- Aluna — initial schema + row-level security.
-- SHARED CONTRACT: owned by Dev A. Dev B requests changes via PR. Mirrors src/shared/types.ts.
-- Principles: patient can never read flags, decisions, summaries, scores or audit;
-- clinicians see only women they are named on (gp_id / hv_id); all data synthetic.

create extension if not exists pgcrypto;

-- ---------- tables ----------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('patient', 'clinician')),
  first_name text not null,
  job_title text
);

create table public.women (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  pseudonym text not null unique,
  first_name text not null,
  baby_weeks int not null check (baby_weeks between 0 and 104),
  gp_id uuid references public.profiles (id),
  hv_id uuid references public.profiles (id),
  baseline_total int check (baseline_total between 0 and 30),
  usual_hour int not null default 20 check (usual_hour between 0 and 23),
  group_label text,
  synthetic boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  woman_id uuid not null references public.women (id) on delete cascade,
  scheduled_for timestamptz not null,
  items int[] not null check (array_length(items, 1) between 1 and 10),
  completed_at timestamptz,
  note_text text check (char_length(note_text) <= 2000),
  reminder_sent_at timestamptz
);
create index on public.checkins (woman_id, scheduled_for);

create table public.item_answers (
  id uuid primary key default gen_random_uuid(),
  woman_id uuid not null references public.women (id) on delete cascade,
  checkin_id uuid not null references public.checkins (id) on delete cascade,
  item_no int not null check (item_no between 1 and 10),
  value int not null check (value between 0 and 3),
  answered_at timestamptz not null default now(),
  via text not null default 'tap' check (via in ('tap', 'voice')),
  unique (checkin_id, item_no)
);
create index on public.item_answers (woman_id, answered_at);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  woman_id uuid not null references public.women (id) on delete cascade,
  session_date date not null,
  attended boolean not null
);

create table public.flags (
  id uuid primary key default gen_random_uuid(),
  woman_id uuid not null references public.women (id) on delete cascade,
  level text not null check (level in ('urgent', 'review', 'drift')),
  rule_id text not null,
  reason text not null,
  rule_version text not null,
  owner_id uuid references public.profiles (id),
  due_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);
create index on public.flags (status, level, due_at);

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  flag_id uuid not null references public.flags (id) on delete cascade,
  woman_id uuid not null references public.women (id) on delete cascade,
  clinician_id uuid not null references public.profiles (id),
  decision text not null check (decision in
    ('contacted', 'gp_review', 'hv_followup', 'talking_therapies', 'secondary_referral', 'no_action')),
  reason text,
  created_at timestamptz not null default now(),
  constraint reason_required check (
    decision not in ('secondary_referral', 'no_action') or coalesce(length(trim(reason)), 0) > 0
  )
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  event text not null,
  entity text not null,
  entity_id uuid,
  detail jsonb,
  at timestamptz not null default now()
);

create table public.summaries (
  id uuid primary key default gen_random_uuid(),
  woman_id uuid not null references public.women (id) on delete cascade,
  source_hash text not null,
  text text not null,
  created_at timestamptz not null default now(),
  unique (woman_id, source_hash)
);

create table public.invite_codes (
  code text primary key check (code ~ '^[0-9]{6}$'),
  woman_id uuid not null references public.women (id) on delete cascade,
  created_by uuid references public.profiles (id),
  expires_at timestamptz not null default now() + interval '1 day',
  used_at timestamptz
);

-- ---------- helper functions (security definer avoids RLS recursion) ----------

create or replace function public.is_clinician() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'clinician')
$$;

create or replace function public.my_woman_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from women where user_id = auth.uid()
$$;

create or replace function public.is_my_patient(w uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from women
    where id = w and auth.uid() is not null and (gp_id = auth.uid() or hv_id = auth.uid())
  )
$$;

-- ---------- row-level security ----------

alter table public.profiles     enable row level security;
alter table public.women        enable row level security;
alter table public.checkins     enable row level security;
alter table public.item_answers enable row level security;
alter table public.attendance   enable row level security;
alter table public.flags        enable row level security;
alter table public.decisions    enable row level security;
alter table public.audit_log    enable row level security;
alter table public.summaries    enable row level security;
alter table public.invite_codes enable row level security;

-- profiles: everyone reads own; clinicians read all (to show owner names)
create policy profiles_self on public.profiles for select using (id = auth.uid());
create policy profiles_clin on public.profiles for select using (public.is_clinician());

-- women: clinician reads women they are named on. Patients have NO direct access
-- (the row holds baseline_total); they read the patient-safe view `patient_me` below.
create policy women_clin on public.women for select using (public.is_my_patient(id));

-- Patient-safe view: owner-privileged (bypasses RLS) but filtered to the caller, and exposes no scores.
create view public.patient_me as
  select w.id, w.first_name, w.baby_weeks, w.usual_hour, w.group_label
  from public.women w
  where w.user_id = auth.uid();
revoke all on public.patient_me from anon;
grant select on public.patient_me to authenticated;

-- checkins: patient reads + completes own; clinician reads
create policy checkins_self_sel on public.checkins for select using (woman_id = public.my_woman_id());
create policy checkins_self_upd on public.checkins for update
  using (woman_id = public.my_woman_id()) with check (woman_id = public.my_woman_id());
create policy checkins_clin on public.checkins for select using (public.is_my_patient(woman_id));

-- item_answers: patient may INSERT only (never read back — no scores on her side); clinician reads
create policy answers_self_ins on public.item_answers for insert
  with check (woman_id = public.my_woman_id());
create policy answers_clin on public.item_answers for select using (public.is_my_patient(woman_id));

-- attendance: clinician only
create policy attendance_clin on public.attendance for select using (public.is_my_patient(woman_id));

-- flags: clinician only (written by /api/score with the service role)
create policy flags_clin_sel on public.flags for select using (public.is_my_patient(woman_id));
create policy flags_clin_upd on public.flags for update
  using (public.is_my_patient(woman_id)) with check (public.is_my_patient(woman_id));

-- decisions: clinician only
create policy decisions_clin_sel on public.decisions for select using (public.is_my_patient(woman_id));
create policy decisions_clin_ins on public.decisions for insert
  with check (public.is_my_patient(woman_id) and clinician_id = auth.uid());

-- summaries: clinician only (written by /api/summary with the service role)
create policy summaries_clin on public.summaries for select using (public.is_my_patient(woman_id));

-- audit_log: clinicians append their own entries and read entries for their patients' entities.
create policy audit_clin_ins on public.audit_log for insert
  with check (public.is_clinician() and actor_id = auth.uid());
create policy audit_clin_sel on public.audit_log for select using (public.is_clinician());

-- invite codes: clinician creates/reads for their patients; patients never read (redeemed via /api/join)
create policy invites_clin_sel on public.invite_codes for select using (public.is_my_patient(woman_id));
create policy invites_clin_ins on public.invite_codes for insert
  with check (public.is_my_patient(woman_id) and created_by = auth.uid());

-- Patient may only change completed_at / note_text on her check-ins (not items or schedule).
revoke update on public.checkins from authenticated;
grant update (completed_at, note_text) on public.checkins to authenticated;

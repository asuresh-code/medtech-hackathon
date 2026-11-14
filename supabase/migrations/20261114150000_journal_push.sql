-- Aluna: patient journal (no scores), push notifications, reminder preference. Owned by Dev A.

-- ---------- Journal: her own answers as the option she chose (never a score) ----------
-- Returns option_index (position of the option she tapped on the printed form), not the 0-3 value.
-- Items 1, 2, 4 list options in ascending score order; items 3, 5-10 are printed in reverse.
create view public.patient_answers as
  select a.checkin_id,
         a.item_no,
         case when a.item_no in (1, 2, 4) then a.value else 3 - a.value end as option_index,
         a.answered_at
  from public.item_answers a
  join public.women w on w.id = a.woman_id
  where w.user_id = auth.uid();
revoke all on public.patient_answers from anon;
grant select on public.patient_answers to authenticated;

-- ---------- Her chosen check-in time (implementation intention set at onboarding / settings) ----------
alter table public.women add column if not exists reminder_hour int check (reminder_hour between 0 and 23);
alter table public.women add column if not exists routine_label text; -- e.g. 'after the evening feed'

create or replace function public.set_my_reminder(p_hour int, p_label text)
returns void language sql security definer set search_path = public as $$
  update women set reminder_hour = p_hour, routine_label = left(p_label, 80) where user_id = auth.uid();
$$;
revoke all on function public.set_my_reminder(int, text) from anon;
grant execute on function public.set_my_reminder(int, text) to authenticated;

drop view if exists public.patient_me;
create view public.patient_me as
  select w.id, w.first_name, w.baby_weeks, w.usual_hour, w.group_label, w.reminder_hour, w.routine_label,
         hv.first_name as hv_name, gp.first_name as gp_name
  from public.women w
  left join public.profiles hv on hv.id = w.hv_id
  left join public.profiles gp on gp.id = w.gp_id
  where w.user_id = auth.uid();
revoke all on public.patient_me from anon;
grant select on public.patient_me to authenticated;

-- ---------- Web Push subscriptions ----------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  woman_id uuid not null references public.women (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy push_self_sel on public.push_subscriptions for select using (user_id = auth.uid());
create policy push_self_ins on public.push_subscriptions for insert
  with check (user_id = auth.uid() and woman_id = public.my_woman_id());
create policy push_self_del on public.push_subscriptions for delete using (user_id = auth.uid());

-- ---------- Notification log: enforces one prompt + at most one reminder per check-in ----------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  woman_id uuid not null references public.women (id) on delete cascade,
  checkin_id uuid references public.checkins (id) on delete cascade,
  kind text not null check (kind in ('prompt', 'reminder', 'test')),
  sent_at timestamptz not null default now(),
  unique (checkin_id, kind)
);
alter table public.notifications enable row level security;
create policy notif_clin on public.notifications for select using (public.is_my_patient(woman_id));

-- ---------- Tighten audit visibility: clinicians see only entries about their own patients ----------
alter table public.audit_log add column if not exists woman_id uuid references public.women (id) on delete cascade;
drop policy if exists audit_clin_sel on public.audit_log;
create policy audit_clin_sel on public.audit_log for select
  using (public.is_clinician() and (actor_id = auth.uid() or (woman_id is not null and public.is_my_patient(woman_id))));
drop policy if exists audit_clin_ins on public.audit_log;
create policy audit_clin_ins on public.audit_log for insert
  with check (public.is_clinician() and actor_id = auth.uid() and (woman_id is null or public.is_my_patient(woman_id)));

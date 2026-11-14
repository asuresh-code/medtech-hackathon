-- Every woman must have a named GP and a named health visitor, so every flag has an owner.
-- (basicbrief: "Don't ask about self-harm without a guaranteed response.")
-- Engine can rely on: urgent/review → gp_id, drift → hv_id. No fallback logic needed.
alter table public.women alter column gp_id set not null;
alter table public.women alter column hv_id set not null;

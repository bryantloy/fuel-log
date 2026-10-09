-- Run once in this project's Supabase SQL Editor before enabling cloud saves.
-- No database password or secret/service-role key goes in the app.
begin;
create table if not exists public.fuel_log_cloud_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
alter table public.fuel_log_cloud_state enable row level security;
revoke all on public.fuel_log_cloud_state from anon, authenticated;
grant select on public.fuel_log_cloud_state to authenticated;
drop policy if exists "Read own fuel log" on public.fuel_log_cloud_state;
create policy "Read own fuel log" on public.fuel_log_cloud_state
  for select to authenticated using ((select auth.uid()) = user_id);

-- All writes go through a compare-and-save function. A stale device cannot
-- bypass the revision check through a direct REST update.
create or replace function public.save_fuel_log_state(p_payload jsonb, p_expected_revision bigint)
returns table(revision bigint, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_count integer;
begin
  if v_user is null then raise exception 'Sign in before saving' using errcode = '42501'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or jsonb_typeof(p_payload->'days') is distinct from 'object'
     or octet_length(p_payload::text) > 4194304 then
    raise exception 'Invalid or oversized backup' using errcode = '22023';
  end if;
  if p_expected_revision is null then
    return query insert into public.fuel_log_cloud_state as s (user_id, payload)
      values (v_user, p_payload) on conflict (user_id) do nothing
      returning s.revision, s.updated_at;
  else
    return query update public.fuel_log_cloud_state as s
      set payload = p_payload, revision = s.revision + 1, updated_at = now()
      where s.user_id = v_user and s.revision = p_expected_revision
      returning s.revision, s.updated_at;
  end if;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'CLOUD_CONFLICT: another save exists. Download a local backup and load the newer cloud copy before saving again.' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function public.save_fuel_log_state(jsonb,bigint) from public, anon;
grant execute on function public.save_fuel_log_state(jsonb,bigint) to authenticated;
commit;

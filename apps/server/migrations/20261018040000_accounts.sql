alter table public.menulens_sessions add column if not exists owner_id uuid;
create index if not exists menulens_sessions_owner on public.menulens_sessions(owner_id,created_at desc);
create table if not exists public.menulens_auth (
  key text primary key,
  value text not null,
  expires_at bigint not null
);
create index if not exists menulens_auth_expiry on public.menulens_auth(expires_at);
alter table public.menulens_auth enable row level security;
revoke all on public.menulens_auth from public;
do $$
declare role_name text;
begin
  foreach role_name in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=role_name) then
      execute format('revoke all on public.menulens_auth from %I',role_name);
    end if;
  end loop;
end $$;

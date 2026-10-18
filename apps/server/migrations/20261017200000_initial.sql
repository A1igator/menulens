create table if not exists public.menulens_sessions (
  id uuid primary key, code_hash text unique not null, read_hash text unique not null,
  write_hash text unique, pair_expires bigint not null, share_expires bigint,
  state text not null check(state in ('pending','sharing','stopped','expired')),
  fix jsonb, created_at bigint not null
);
create table if not exists public.menulens_menus (
  id text primary key, restaurant jsonb not null, source_url text not null,
  fetched_at bigint not null, mode text not null check(mode in ('live','fixture')), note text
);
create table if not exists public.menulens_dishes (
  menu_id text not null references public.menulens_menus(id) on delete cascade,
  id text not null, position integer not null, payload jsonb not null,
  primary key(menu_id,id)
);
create table if not exists public.menulens_payments (
  id uuid primary key, workflow text not null, amount numeric(12,6) not null check(amount>=0),
  created_at bigint not null, state text not null check(state in ('reserved','settled','uncertain','released'))
);
create index if not exists menulens_payments_created_at on public.menulens_payments(created_at);
create index if not exists menulens_payments_workflow on public.menulens_payments(workflow);
alter table public.menulens_sessions enable row level security;
alter table public.menulens_menus enable row level security;
alter table public.menulens_dishes enable row level security;
alter table public.menulens_payments enable row level security;
revoke all on public.menulens_sessions,public.menulens_menus,public.menulens_dishes,public.menulens_payments from public;
do $$
declare runtime_role text;
begin
  foreach runtime_role in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=runtime_role) then
      execute format('revoke all on public.menulens_sessions,public.menulens_menus,public.menulens_dishes,public.menulens_payments from %I',runtime_role);
    end if;
  end loop;
end $$;
-- No public policies: a server DB credential owns and accesses these app tables.

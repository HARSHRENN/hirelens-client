// The whole database, idempotent: safe to run on every deploy (scripts/migrate.mjs)
// and from Admin → Platform → "Run database setup".
//
// Tenancy: every row a recruiter owns carries owner = auth.uid(); row-level security
// lets a signed-in, active user see only their own rows. Platform settings, usage logs
// and the geocode cache have no policies at all, so only the server (service role) reads them.
export const SCHEMA_SQL = /* sql */ `

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9][a-z0-9-]{2,29}$'),
  full_name text not null default '',
  company text not null default '',
  phone text not null default '',
  email text not null,
  role text not null default 'hr' check (role in ('hr', 'admin')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  trial_start timestamptz not null default now(),
  trial_days int not null default 7 check (trial_days between 1 and 30),
  buyer jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  last_seen timestamptz
);

-- every workspace object (jobs, candidates, templates, panelists, workspace config) as a JSON document
create table if not exists public.docs (
  owner uuid not null references auth.users(id) on delete cascade,
  coll text not null check (coll in ('jobs', 'candidates', 'templates', 'panelists', 'config')),
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner, coll, id)
);
create index if not exists docs_owner_coll on public.docs (owner, coll);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  number text unique not null,
  issued_at timestamptz not null default now(),
  period_from timestamptz not null,
  period_to timestamptz not null,
  description text not null,
  plan_name text not null,
  amount numeric(12, 2) not null,
  tax_pct numeric(5, 2) not null default 0,
  seller jsonb not null default '{}'::jsonb,
  buyer jsonb not null default '{}'::jsonb,
  status text not null default 'due' check (status in ('due', 'paid', 'void')),
  emailed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner, period_from)
);
create index if not exists invoices_owner on public.invoices (owner);

create table if not exists public.platform_settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (id) values (1) on conflict (id) do nothing;

-- emails and AI calls, for the daily caps and the admin usage panel
create table if not exists public.usage_log (
  id bigserial primary key,
  owner uuid references auth.users(id) on delete set null,
  kind text not null,
  detail text not null default '',
  ok boolean not null default true,
  error text,
  at timestamptz not null default now()
);
create index if not exists usage_log_at on public.usage_log (at);
create index if not exists usage_log_owner_kind_at on public.usage_log (owner, kind, at);

create table if not exists public.geocache (
  q text primary key,
  lat double precision,
  lng double precision,
  label text,
  at timestamptz not null default now()
);

create sequence if not exists public.invoice_seq;
create or replace function public.next_invoice_no() returns bigint
  language sql security definer set search_path = public as $$ select nextval('public.invoice_seq') $$;
revoke all on function public.next_invoice_no() from public;
do $$ begin
  revoke all on function public.next_invoice_no() from anon, authenticated;
exception when undefined_object then null; end $$;

-- New Supabase projects may not grant service_role access to new objects.
-- The server needs table privileges as well as its RLS bypass.
grant usage on schema public to service_role;
grant all on public.profiles, public.docs, public.invoices,
  public.platform_settings, public.usage_log, public.geocache to service_role;
grant usage, select on sequence public.usage_log_id_seq, public.invoice_seq to service_role;
grant execute on function public.next_invoice_no() to service_role;

create or replace function public.is_active_user() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active')
$$;

-- row-level security
alter table public.profiles enable row level security;
alter table public.docs enable row level security;
alter table public.invoices enable row level security;
alter table public.platform_settings enable row level security;
alter table public.usage_log enable row level security;
alter table public.geocache enable row level security;

drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles for select using (id = auth.uid());

drop policy if exists docs_own on public.docs;
create policy docs_own on public.docs for all
  using (owner = auth.uid() and public.is_active_user())
  with check (owner = auth.uid() and public.is_active_user());

drop policy if exists invoices_self_read on public.invoices;
create policy invoices_self_read on public.invoices for select using (owner = auth.uid());

-- what the browser may touch (row-level security still filters every row);
-- explicit, because newer Supabase projects no longer grant table access by default
do $$ begin
  grant usage on schema public to anon, authenticated;
  grant select, insert, update, delete on public.docs to authenticated;
  grant select on public.profiles, public.invoices to authenticated;
  revoke all on public.docs, public.profiles, public.invoices, public.platform_settings, public.usage_log, public.geocache from anon;
  revoke all on public.platform_settings, public.usage_log, public.geocache from authenticated;
  grant execute on function public.is_active_user() to authenticated;
exception when undefined_object then null; end $$;

-- per-recruiter numbers for the admin panel; never exposed to browsers
create or replace view public.admin_user_stats as
select
  p.id,
  count(d.*) filter (where d.coll = 'jobs') as jobs,
  count(d.*) filter (where d.coll = 'candidates') as candidates,
  count(d.*) filter (where d.coll = 'candidates' and coalesce((d.data ->> 'shortlisted')::boolean, false)) as shortlisted,
  count(d.*) filter (where d.coll = 'candidates' and d.data ->> 'stage' in ('selected', 'offered', 'joined', 'declined')) as selected,
  count(d.*) filter (where d.coll = 'candidates' and d.data ->> 'stage' in ('offered', 'joined', 'declined')) as offered,
  count(d.*) filter (where d.coll = 'candidates' and d.data ->> 'stage' = 'joined') as joined,
  count(d.*) filter (where d.coll = 'candidates' and d.data ->> 'stage' = 'declined') as declined,
  count(d.*) filter (where d.coll = 'candidates' and d.data ->> 'stage' = 'rejected') as rejected,
  count(d.*) filter (where d.coll = 'candidates' and d.data ->> 'stage' = 'hold') as hold,
  coalesce(sum(case when d.coll = 'candidates' and jsonb_typeof(d.data -> 'interviews') = 'array'
    then jsonb_array_length(d.data -> 'interviews') else 0 end), 0) as interviews,
  count(d.*) filter (where d.coll = 'panelists') as panelists,
  max(d.updated_at) as last_change
from public.profiles p
left join public.docs d on d.owner = p.id
group by p.id;
revoke all on public.admin_user_stats from public;
grant select on public.admin_user_stats to service_role;
do $$ begin
  revoke all on public.admin_user_stats from anon, authenticated;
exception when undefined_object then null; end $$;
`

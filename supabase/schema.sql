

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

create unique index if not exists docs_job_candidate_id on public.docs(coll, id) where coll in ('jobs','candidates');
create table if not exists public.job_assignments (
 job_id text primary key,
 recruiter_id uuid not null references public.profiles(id),
 original_owner uuid not null references public.profiles(id),
 assigned_by uuid not null references public.profiles(id),
 assigned_at timestamptz not null default now(),
 version int not null default 1
);
alter table public.job_assignments enable row level security;
create or replace function public.is_workspace_admin() returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and status='active')
$$;
create or replace function public.can_manage_job(jid text) returns boolean language sql stable security definer set search_path=public as $$
 select public.is_active_user() and (public.is_workspace_admin() or exists(select 1 from public.job_assignments where job_id=jid and recruiter_id=auth.uid()))
$$;
drop policy if exists assignments_read on public.job_assignments;
create policy assignments_read on public.job_assignments for select using(public.is_workspace_admin() or (public.is_active_user() and recruiter_id=auth.uid()));
grant select on public.job_assignments to authenticated;
grant all on public.job_assignments to service_role;
revoke all on public.job_assignments from anon;
revoke insert, update, delete on public.job_assignments from authenticated;
revoke all on function public.is_workspace_admin(), public.can_manage_job(text) from public;
grant execute on function public.is_workspace_admin(), public.can_manage_job(text) to authenticated;
drop policy if exists docs_own on public.docs;
drop policy if exists docs_read on public.docs;
drop policy if exists docs_insert on public.docs;
drop policy if exists docs_update on public.docs;
drop policy if exists docs_delete on public.docs;
create policy docs_read on public.docs for select using(
 public.is_active_user() and case when coll in ('jobs','candidates') then
 public.is_workspace_admin() or (owner=auth.uid() and public.can_manage_job(case when coll='jobs' then id else data->>'jobId' end))
 else owner=auth.uid() end
);
create policy docs_insert on public.docs for insert with check(
 public.is_active_user() and case when coll='jobs' then public.is_workspace_admin()
 when coll='candidates' then public.is_workspace_admin() or (owner=auth.uid() and public.can_manage_job(data->>'jobId'))
 else owner=auth.uid() end
);
create policy docs_update on public.docs for update using(
 public.is_active_user() and case when coll in ('jobs','candidates') then public.is_workspace_admin() or (owner=auth.uid() and public.can_manage_job(case when coll='jobs' then id else data->>'jobId' end)) else owner=auth.uid() end
) with check(
 public.is_active_user() and case when coll in ('jobs','candidates') then public.is_workspace_admin() or (owner=auth.uid() and public.can_manage_job(case when coll='jobs' then id else data->>'jobId' end)) else owner=auth.uid() end
);
create policy docs_delete on public.docs for delete using(
 public.is_active_user() and case when coll in ('jobs','candidates') then public.is_workspace_admin() or (owner=auth.uid() and public.can_manage_job(case when coll='jobs' then id else data->>'jobId' end)) else owner=auth.uid() end
);
create or replace function public.assign_job(p_job text, p_recruiter uuid, p_admin uuid, p_version int) returns public.job_assignments
language plpgsql security definer set search_path=public as $$
declare j public.docs; a public.job_assignments; target public.profiles; result public.job_assignments;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_job, 0));
 if not exists(select 1 from public.profiles where id=p_admin and role='admin' and status='active') then raise exception 'Admin access required'; end if;
 select * into j from public.docs where coll='jobs' and id=p_job for update;
 if not found then raise exception 'Job not found'; end if;
 select * into target from public.profiles where id=p_recruiter for share;
 if not found or target.role<>'hr' or target.status<>'active' then raise exception 'Choose an active recruiter'; end if;
 select * into a from public.job_assignments where job_id=p_job;
 if coalesce(a.version,0)<>p_version then raise exception 'Assignment changed. Refresh and try again.'; end if;
 if a.recruiter_id=p_recruiter then raise exception 'This job is already assigned to that recruiter'; end if;
 update public.docs set owner=p_recruiter where (coll='jobs' and id=p_job) or (coll='candidates' and data->>'jobId'=p_job);
 insert into public.job_assignments(job_id,recruiter_id,original_owner,assigned_by,version)
 values(p_job,p_recruiter,coalesce(a.original_owner,j.owner),p_admin,coalesce(a.version,0)+1)
 on conflict(job_id) do update set recruiter_id=excluded.recruiter_id,assigned_by=excluded.assigned_by,assigned_at=now(),version=excluded.version
 returning * into result;
 return result;
end $$;
revoke all on function public.assign_job(text,uuid,uuid,int) from public,anon,authenticated;
grant execute on function public.assign_job(text,uuid,uuid,int) to service_role;
create or replace function public.cleanup_job_assignment() returns trigger language plpgsql security definer set search_path=public as $$
begin if old.coll='jobs' then delete from public.job_assignments where job_id=old.id; end if; return old; end $$;
drop trigger if exists cleanup_job_assignment on public.docs;
create trigger cleanup_job_assignment after delete on public.docs for each row execute function public.cleanup_job_assignment();

create or replace function public.record_job_dates() returns trigger language plpgsql set search_path=public as $$
declare created text; closed text; admin_user boolean;
begin
 if new.coll <> 'jobs' then return new; end if;
 admin_user := current_user in ('postgres','service_role') or public.is_workspace_admin();
 if tg_op='UPDATE' then
  new.data := jsonb_set(new.data,'{createdAt}',old.data->'createdAt');
  created := coalesce(old.data->>'vacancyCreatedDate',to_char(to_timestamp((old.data->>'createdAt')::double precision/1000) at time zone 'Asia/Kolkata','YYYY-MM-DD'));
 else
  new.data := jsonb_set(new.data,'{createdAt}',to_jsonb(floor(extract(epoch from now())*1000)));
  created := to_char(now() at time zone 'Asia/Kolkata','YYYY-MM-DD');
 end if;
 new.data := jsonb_set(new.data,'{vacancyCreatedDate}',to_jsonb(created));
 if new.data->>'status'='closed' then
  closed := nullif(new.data->>'positionClosedDate','');
  if tg_op='INSERT' or old.data->>'status' is distinct from 'closed' then
   if not admin_user or closed is null then closed := to_char(now() at time zone 'Asia/Kolkata','YYYY-MM-DD'); end if;
  elsif not admin_user and closed is distinct from nullif(old.data->>'positionClosedDate','') then
   raise exception 'Only the admin can edit the position close date';
  end if;
  if closed is not null then
   if closed !~ '^\d{4}-\d{2}-\d{2}$' or closed::date < created::date then raise exception 'Position close date must be on or after vacancy creation'; end if;
   new.data := jsonb_set(new.data,'{positionClosedDate}',to_jsonb(closed));
  else new.data := new.data - 'positionClosedDate'; end if;
 else new.data := new.data - 'positionClosedDate'; end if;
 return new;
end $$;
drop trigger if exists record_job_dates on public.docs;
create trigger record_job_dates before insert or update of data on public.docs for each row execute function public.record_job_dates();

create table if not exists public.panel_feedback (
 id bigint generated always as identity primary key,
 candidate_id text not null,
 interview_id text not null,
 panelist_id text not null,
 panelist_name text not null,
 token_hash text unique not null,
 expires_at timestamptz not null,
 requested_at timestamptz not null default now(),
 revoked_at timestamptz,
 submitted_at timestamptz,
 rating int check(rating between 1 and 5),
 recommendation text check(recommendation in ('select','hold','reject')),
 comments text check(length(comments)<=5000),
 unique(candidate_id,interview_id,panelist_id)
);
alter table public.panel_feedback enable row level security;
create or replace function public.can_review_panel_feedback(cid text) returns boolean language sql stable security definer set search_path=public as $$
 select public.is_active_user() and exists(select 1 from public.docs d where d.coll='candidates' and d.id=cid and (public.is_workspace_admin() or (d.owner=auth.uid() and public.can_manage_job(d.data->>'jobId'))))
$$;
revoke all on function public.can_review_panel_feedback(text) from public;
grant execute on function public.can_review_panel_feedback(text) to authenticated;
drop policy if exists panel_feedback_read on public.panel_feedback;
create policy panel_feedback_read on public.panel_feedback for select using(public.can_review_panel_feedback(candidate_id));
revoke all on public.panel_feedback from public, anon, authenticated;
grant select(candidate_id,interview_id,panelist_id,panelist_name,expires_at,requested_at,revoked_at,submitted_at,rating,recommendation,comments) on public.panel_feedback to authenticated;
grant all on public.panel_feedback to service_role;
grant usage,select on sequence public.panel_feedback_id_seq to service_role;

-- Actor and submission operations are service-only, with permission and membership
-- checks repeated inside the transaction to handle reassignment and concurrent requests.
create or replace function public.request_panel_feedback(cid text, iid text, pid text, actor uuid, digest text) returns void
language plpgsql security definer set search_path=public as $$
declare c public.docs; iv jsonb; pname text; previous public.panel_feedback;
begin
 select * into c from public.docs where coll='candidates' and id=cid for update;
 if not found or not exists(select 1 from public.profiles p where p.id=actor and p.status='active' and (p.role='admin' or (c.owner=actor and exists(select 1 from public.job_assignments a where a.job_id=c.data->>'jobId' and a.recruiter_id=actor)))) then raise exception 'Candidate is not accessible'; end if;
 select value into iv from jsonb_array_elements(coalesce(c.data->'interviews','[]')) where value->>'id'=iid;
 if iv is null or not coalesce(iv->'panelistIds','[]') ? pid then raise exception 'Panelist is not assigned to this interview'; end if;
 select data->>'name' into pname from public.docs where coll='panelists' and id=pid and (owner=c.owner or owner=(select original_owner from public.job_assignments where job_id=c.data->>'jobId')) order by (owner=c.owner) desc limit 1;
 if pname is null then raise exception 'Panelist record not found'; end if;
 select * into previous from public.panel_feedback where candidate_id=cid and interview_id=iid and panelist_id=pid for update;
 if previous.submitted_at is not null then raise exception 'Feedback has already been submitted'; end if;
 insert into public.panel_feedback(candidate_id,interview_id,panelist_id,panelist_name,token_hash,expires_at)
 values(cid,iid,pid,pname,digest,now()+interval '7 days')
 on conflict(candidate_id,interview_id,panelist_id) do update set token_hash=excluded.token_hash,expires_at=excluded.expires_at,requested_at=now(),revoked_at=null,panelist_name=excluded.panelist_name;
end $$;
create or replace function public.revoke_panel_feedback(cid text, iid text, pid text, actor uuid) returns void
language plpgsql security definer set search_path=public as $$
declare c public.docs;
begin
 select * into c from public.docs where coll='candidates' and id=cid for update;
 if not found or not exists(select 1 from public.profiles p where p.id=actor and p.status='active' and (p.role='admin' or (c.owner=actor and exists(select 1 from public.job_assignments a where a.job_id=c.data->>'jobId' and a.recruiter_id=actor)))) then raise exception 'Candidate is not accessible'; end if;
 update public.panel_feedback set revoked_at=now() where candidate_id=cid and interview_id=iid and panelist_id=pid and submitted_at is null;
end $$;
revoke all on function public.revoke_panel_feedback(text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.revoke_panel_feedback(text,text,text,uuid) to service_role;
create or replace function public.submit_panel_feedback(digest text, score int, decision text, notes text) returns void
language plpgsql security definer set search_path=public as $$
declare f public.panel_feedback; cid text;
begin
 if score is null or score<1 or score>5 or decision is null or decision not in ('select','hold','reject') or notes is null or length(trim(notes))<5 or length(notes)>5000 then raise exception 'Add a rating, recommendation and comments (5 to 5000 characters)'; end if;
 select candidate_id into cid from public.panel_feedback where token_hash=digest;
 perform 1 from public.docs where coll='candidates' and id=cid for update;
 select * into f from public.panel_feedback where token_hash=digest for update;
 if not found or f.revoked_at is not null or f.expires_at<=now() or f.submitted_at is not null then raise exception 'This feedback link is expired, revoked or already submitted'; end if;
 if not exists(select 1 from public.docs d cross join lateral jsonb_array_elements(coalesce(d.data->'interviews','[]')) iv where d.coll='candidates' and d.id=f.candidate_id and iv->>'id'=f.interview_id and coalesce(iv->'panelistIds','[]') ? f.panelist_id) then raise exception 'Interview is no longer available'; end if;
 update public.panel_feedback set rating=score,recommendation=decision,comments=trim(notes),submitted_at=now() where id=f.id;
end $$;
revoke all on function public.request_panel_feedback(text,text,text,uuid,text),public.submit_panel_feedback(text,int,text,text) from public,anon,authenticated;
grant execute on function public.request_panel_feedback(text,text,text,uuid,text),public.submit_panel_feedback(text,int,text,text) to service_role;
create or replace function public.cleanup_candidate_feedback() returns trigger language plpgsql security definer set search_path=public as $$
begin if old.coll='candidates' then delete from public.panel_feedback where candidate_id=old.id; end if; return old; end $$;
drop trigger if exists cleanup_candidate_feedback on public.docs;
create trigger cleanup_candidate_feedback after delete on public.docs for each row execute function public.cleanup_candidate_feedback();

create table if not exists public.recruiter_assignment_reviews (
 id bigint generated always as identity primary key,
 job_id text not null,
 assignment_version int not null check(assignment_version>0),
 recruiter_id uuid not null,
 recruiter_name text not null,
 recruiter_email text not null,
 job_title text not null,
 assigned_at timestamptz not null,
 outcome text not null check(outcome in ('successful','unsuccessful')),
 rating int check(rating between 1 and 5),
 feedback text not null check(length(trim(feedback)) between 5 and 5000),
 revision int not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by text not null,
 history jsonb not null default '[]'::jsonb,
 unique(job_id,assignment_version)
);
alter table public.recruiter_assignment_reviews enable row level security;
revoke all on public.recruiter_assignment_reviews from public,anon,authenticated;
grant all on public.recruiter_assignment_reviews to service_role;
grant usage,select on sequence public.recruiter_assignment_reviews_id_seq to service_role;
create index if not exists recruiter_reviews_recruiter on public.recruiter_assignment_reviews(recruiter_id,created_at);
create or replace function public.save_recruiter_assignment_review(p_job text,p_version int,p_recruiter uuid,p_revision int,p_outcome text,p_rating int,p_feedback text,p_actor text)
returns public.recruiter_assignment_reviews language plpgsql security definer set search_path=public as $$
declare a public.job_assignments; old_review public.recruiter_assignment_reviews; result public.recruiter_assignment_reviews; person public.profiles; title text;
begin
 if p_actor is null or (p_actor<>'platform-admin' and not exists(select 1 from public.profiles p where p.id::text=p_actor and p.role='admin' and p.status='active')) then raise exception 'Admin access required'; end if;
 if p_outcome is null or p_outcome not in ('successful','unsuccessful') or p_feedback is null or length(trim(p_feedback))<5 or length(p_feedback)>5000 or (p_rating is not null and (p_rating<1 or p_rating>5)) then raise exception 'Choose an outcome, an optional rating (1 to 5), and feedback (5 to 5000 characters)'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_job,0));
 select * into old_review from public.recruiter_assignment_reviews where job_id=p_job and assignment_version=p_version for update;
 if found then
  if old_review.recruiter_id<>p_recruiter or old_review.revision<>p_revision then raise exception 'Review changed. Refresh before saving.'; end if;
  update public.recruiter_assignment_reviews set outcome=p_outcome,rating=p_rating,feedback=trim(p_feedback),revision=revision+1,updated_at=now(),updated_by=p_actor,
   history=history || jsonb_build_array(jsonb_build_object('revision',old_review.revision,'outcome',old_review.outcome,'rating',old_review.rating,'feedback',old_review.feedback,'updated_at',old_review.updated_at,'updated_by',old_review.updated_by))
   where id=old_review.id returning * into result;
 else
  if p_revision<>0 then raise exception 'Review changed. Refresh before saving.'; end if;
  select * into a from public.job_assignments where job_id=p_job;
  if not found or a.version<>p_version or a.recruiter_id<>p_recruiter then raise exception 'Assignment changed. Refresh and choose the current assignment.'; end if;
  select * into person from public.profiles where id=p_recruiter and role='hr';
  if not found then raise exception 'Recruiter record not found'; end if;
  select data->>'title' into title from public.docs where coll='jobs' and id=p_job;
  if not found then raise exception 'Job not found'; end if;
  insert into public.recruiter_assignment_reviews(job_id,assignment_version,recruiter_id,recruiter_name,recruiter_email,job_title,assigned_at,outcome,rating,feedback,updated_by)
   values(p_job,p_version,p_recruiter,coalesce(nullif(to_jsonb(person)->>'full_name',''),to_jsonb(person)->>'username','Recruiter'),coalesce(to_jsonb(person)->>'email',''),coalesce(title,'Untitled job'),a.assigned_at,p_outcome,p_rating,trim(p_feedback),p_actor) returning * into result;
 end if;
 return result;
end $$;
revoke all on function public.save_recruiter_assignment_review(text,int,uuid,int,text,int,text,text) from public,anon,authenticated;
grant execute on function public.save_recruiter_assignment_review(text,int,uuid,int,text,int,text,text) to service_role;

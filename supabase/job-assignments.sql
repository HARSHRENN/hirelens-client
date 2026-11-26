begin;

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

commit;
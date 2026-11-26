export const PANEL_FEEDBACK_SQL = `
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
`;

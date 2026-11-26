// Private admin assessments. A review belongs to one assignment version, not its next assignee.
export const RECRUITER_FEEDBACK_SQL = `
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
`;

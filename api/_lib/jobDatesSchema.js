export const JOB_DATES_SQL = `
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
   if closed !~ '^\\d{4}-\\d{2}-\\d{2}$' or closed::date < created::date then raise exception 'Position close date must be on or after vacancy creation'; end if;
   new.data := jsonb_set(new.data,'{positionClosedDate}',to_jsonb(closed));
  else new.data := new.data - 'positionClosedDate'; end if;
 else new.data := new.data - 'positionClosedDate'; end if;
 return new;
end $$;
drop trigger if exists record_job_dates on public.docs;
create trigger record_job_dates before insert or update of data on public.docs for each row execute function public.record_job_dates();
`;

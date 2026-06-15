alter table public.applications
add column if not exists submission_source text not null default 'browser';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'applications_submission_source_check'
      and conrelid = 'public.applications'::regclass
  ) then
    alter table public.applications
    add constraint applications_submission_source_check
    check (submission_source in ('browser', 'edge_function'));
  end if;
end
$$;

comment on column public.applications.submission_source is
  'Identifies whether the browser webhook flow or synchronous Edge Function created the application.';

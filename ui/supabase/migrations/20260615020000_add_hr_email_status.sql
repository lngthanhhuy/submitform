alter table public.applications
add column if not exists hr_email_status text not null default 'not_tracked',
add column if not exists hr_email_id text,
add column if not exists hr_email_error text,
add column if not exists hr_email_sent_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'applications_hr_email_status_check'
      and conrelid = 'public.applications'::regclass
  ) then
    alter table public.applications
    add constraint applications_hr_email_status_check
    check (
      hr_email_status in ('not_tracked', 'pending', 'accepted', 'failed')
    );
  end if;
end
$$;

comment on column public.applications.hr_email_status is
  'Tracks synchronous or webhook HR email processing.';

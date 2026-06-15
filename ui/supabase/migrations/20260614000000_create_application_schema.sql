create extension if not exists pgcrypto with schema extensions;

create table if not exists public.positions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  last_name text not null,
  first_name text not null,
  email text not null,
  position_id uuid not null references public.positions(id),
  cv_path text not null,
  cover_letter text,
  created_at timestamptz not null default now()
);

create index if not exists positions_active_title_idx
on public.positions (is_active, title);

create index if not exists applications_position_id_idx
on public.applications (position_id);

create index if not exists applications_created_at_idx
on public.applications (created_at desc);

alter table public.positions enable row level security;
alter table public.applications enable row level security;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'positions'
  loop
    execute format(
      'drop policy if exists %I on public.positions',
      policy_record.policyname
    );
  end loop;

  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'applications'
  loop
    execute format(
      'drop policy if exists %I on public.applications',
      policy_record.policyname
    );
  end loop;
end
$$;

create policy "Public can read active positions"
on public.positions
for select
to anon, authenticated
using (is_active = true);

revoke all on table public.positions from anon, authenticated;
grant select on table public.positions to anon, authenticated;
grant select, insert, update, delete
on table public.positions to service_role;

revoke all on table public.applications from anon, authenticated;
grant select, insert, update, delete
on table public.applications to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'cv ung tuyen',
  'cv ung tuyen',
  false,
  5242880,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        coalesce(qual, '') ilike '%cv ung tuyen%'
        or coalesce(with_check, '') ilike '%cv ung tuyen%'
      )
  loop
    execute format(
      'drop policy if exists %I on storage.objects',
      policy_record.policyname
    );
  end loop;
end
$$;

comment on table public.positions is
  'Career positions available to the public application form.';

comment on table public.applications is
  'Private candidate submissions created by trusted backend services.';

comment on column public.applications.cv_path is
  'Private object path in the cv ung tuyen Storage bucket.';

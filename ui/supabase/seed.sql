insert into public.positions (
  id,
  title,
  is_active
)
select
  '11111111-1111-4111-8111-111111111111'::uuid,
  'Developer',
  true
where not exists (
  select 1
  from public.positions
  where lower(title) = lower('Developer')
);

insert into public.positions (
  id,
  title,
  is_active
)
select
  '22222222-2222-4222-8222-222222222222'::uuid,
  'Designer',
  true
where not exists (
  select 1
  from public.positions
  where lower(title) = lower('Designer')
);

create schema if not exists private;

create table if not exists private.application_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null,
  request_count integer not null,
  updated_at timestamptz not null
);

create index if not exists application_rate_limits_updated_at_idx
on private.application_rate_limits (updated_at);

revoke all on schema private from public;
revoke all on private.application_rate_limits from public, anon, authenticated;

create or replace function public.consume_application_rate_limit(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  retry_after_seconds integer,
  request_count integer
)
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  current_time timestamptz := clock_timestamp();
  rate_limit_row private.application_rate_limits%rowtype;
begin
  if p_key_hash is null or length(p_key_hash) = 0 then
    raise exception 'p_key_hash is required';
  end if;

  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'rate limit values must be positive';
  end if;

  insert into private.application_rate_limits as existing (
    key_hash,
    window_started_at,
    request_count,
    updated_at
  )
  values (
    p_key_hash,
    current_time,
    1,
    current_time
  )
  on conflict (key_hash) do update
  set
    window_started_at = case
      when existing.window_started_at
        <= current_time - make_interval(secs => p_window_seconds)
        then current_time
      else existing.window_started_at
    end,
    request_count = case
      when existing.window_started_at
        <= current_time - make_interval(secs => p_window_seconds)
        then 1
      else existing.request_count + 1
    end,
    updated_at = current_time
  returning * into rate_limit_row;

  allowed := rate_limit_row.request_count <= p_limit;
  request_count := rate_limit_row.request_count;
  retry_after_seconds := case
    when allowed then 0
    else greatest(
      1,
      ceil(
        extract(
          epoch from (
            rate_limit_row.window_started_at
              + make_interval(secs => p_window_seconds)
              - current_time
          )
        )
      )::integer
    )
  end;

  return next;
end;
$$;

revoke all on function public.consume_application_rate_limit(
  text,
  integer,
  integer
) from public, anon, authenticated;

grant execute on function public.consume_application_rate_limit(
  text,
  integer,
  integer
) to service_role;

comment on table private.application_rate_limits is
  'Stores salted IP hashes for the application submission rate limit.';

comment on function public.consume_application_rate_limit(
  text,
  integer,
  integer
) is
  'Atomically consumes one application submission attempt for a fixed window.';

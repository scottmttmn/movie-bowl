begin;

drop function public.get_bowl_filter_metadata(uuid, text);

create function public.get_bowl_filter_metadata(
  p_bowl_id uuid,
  p_region text default 'US'
)
returns table (
  tmdb_id bigint,
  region text,
  certification text,
  providers text[],
  fetched_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.bowls bowl
    where bowl.id = p_bowl_id
      and (
        bowl.owner_id = auth.uid()
        or exists (
          select 1
          from public.bowl_members member
          where member.bowl_id = bowl.id
            and member.user_id = auth.uid()
        )
      )
  ) then
    raise exception using
      errcode = '42501',
      message = 'You do not have access to this bowl metadata.';
  end if;

  return query
  select
    active.tmdb_id,
    upper(p_region)::text,
    metadata.certification,
    coalesce(metadata.providers, '{}')::text[],
    metadata.fetched_at
  from public.bowl_active_tmdb_movies active
  left join public.tmdb_filter_metadata metadata
    on metadata.tmdb_id = active.tmdb_id
   and metadata.region = upper(p_region)
  where active.bowl_id = p_bowl_id
  order by active.tmdb_id;
end;
$$;

revoke all on function public.get_bowl_filter_metadata(uuid, text)
from public, anon;
grant execute on function public.get_bowl_filter_metadata(uuid, text)
to authenticated;

drop function public.complete_tmdb_filter_metadata_refresh(
  bigint, text, uuid, text, text[], timestamptz, jsonb, text
);

create function public.complete_tmdb_filter_metadata_refresh(
  p_tmdb_id bigint,
  p_region text,
  p_refresh_token uuid,
  p_certification text,
  p_providers text[],
  p_fetched_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tmdb_filter_metadata
  set
    certification = upper(nullif(trim(p_certification), '')),
    providers = coalesce(p_providers, '{}'),
    fetched_at = coalesce(p_fetched_at, now()),
    refresh_started_at = null,
    refresh_token = null,
    consecutive_failures = 0,
    retry_after = null,
    last_error = null,
    updated_at = now()
  where tmdb_id = p_tmdb_id
    and region = upper(p_region)
    and refresh_token = p_refresh_token;

  return found;
end;
$$;

revoke all on function public.complete_tmdb_filter_metadata_refresh(
  bigint, text, uuid, text, text[], timestamptz
) from public, anon, authenticated;
grant execute on function public.complete_tmdb_filter_metadata_refresh(
  bigint, text, uuid, text, text[], timestamptz
) to service_role;

alter table public.tmdb_filter_metadata
drop constraint tmdb_filter_metadata_provider_availability_object,
drop column provider_watch_url,
drop column provider_availability;

commit;

begin;

drop trigger if exists seed_tmdb_filter_metadata_cache_after_insert
on public.bowl_active_tmdb_movies;
drop trigger if exists prune_tmdb_filter_metadata_cache_after_delete
on public.bowl_active_tmdb_movies;

drop function if exists public.seed_tmdb_filter_metadata_cache();
drop function if exists public.prune_tmdb_filter_metadata_cache();
drop function if exists public.get_bowl_filter_metadata(uuid, text);
drop function if exists public.claim_tmdb_filter_metadata_refreshes(
  integer, text, timestamptz, bigint, uuid, uuid
);
drop function if exists public.complete_tmdb_filter_metadata_refresh(
  bigint, text, uuid, text, text[], timestamptz
);
drop function if exists public.fail_tmdb_filter_metadata_refresh(
  bigint, text, uuid, text
);

drop table if exists public.tmdb_filter_metadata;

commit;

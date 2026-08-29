begin;

drop function if exists public.record_tmdb_filter_metadata_refresh_run(
  text, text, timestamptz, timestamptz, integer, integer, integer, boolean,
  integer, text
);

drop table if exists public.tmdb_filter_metadata_refresh_runs;

commit;

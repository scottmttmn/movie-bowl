-- Reverts 20261114120000_add_movie_ratings.sql. Move into migrations/ with a
-- fresh timestamp to run it; every rating is lost, and the thumbs error until
-- the app that offers them is rolled back too. The shared history link goes
-- back to the shape it had before ratings.
begin;

drop trigger if exists user_watch_events_drop_unwatched_rating on public.user_watch_events;
drop function if exists public.drop_unwatched_movie_rating();
drop function if exists public.get_bowl_watched_ratings(uuid);
drop function if exists public.set_my_movie_rating(uuid, smallint);
drop table if exists public.user_movie_ratings;

create or replace function public.get_shared_watch_history(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'display_name', profile.display_name,
    'include_comments', link.include_comments,
    'entries', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'tmdb_id', event.tmdb_id,
          'title', event.title,
          'poster_path', event.poster_path,
          'release_date', event.release_date,
          'watched_on', event.watched_on,
          'personal_note', case when link.include_comments then event.personal_note end
        )
        order by event.watched_on desc, event.created_at desc, event.id
      )
      from public.user_watch_events event
      where event.user_id = link.user_id
    ), '[]'::jsonb)
  )
  from public.watch_history_share_links link
  left join public.profiles profile on profile.id = link.user_id
  where p_token is not null
    and link.token = p_token;
$$;

commit;

-- A person can share their Watch History through one private link: anyone
-- holding it can read the list, nobody can answer it, and turning it off ends
-- it. There are no followers, likes or viewer counts behind it on purpose --
-- see output/designs/watch-history-share-link.md.
--
-- The table is sealed: every read and write goes through the functions below,
-- so the token never reaches anyone but its owner, and the public read can
-- shape exactly what a viewer gets (never a bowl name, never another person's
-- reason for a slip, the owner's own comments only when they said so).

begin;

create table public.watch_history_share_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token text not null unique check (char_length(token) >= 32),
  include_comments boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.watch_history_share_links enable row level security;

-- Sealed: no API role reaches the rows, only the definer functions do.
revoke all on table public.watch_history_share_links from public, anon, authenticated, service_role;

create function public.get_my_watch_history_share_link()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_link public.watch_history_share_links%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in to share your watch history'
      using errcode = '42501';
  end if;

  select * into v_link
  from public.watch_history_share_links
  where user_id = auth.uid();

  if not found then
    return null;
  end if;

  return jsonb_build_object('token', v_link.token, 'include_comments', v_link.include_comments);
end;
$$;

-- Creates the link when there is none and otherwise only changes whether
-- comments show, so a retry or a second tab never rotates a link that has
-- already been sent to someone.
create function public.save_my_watch_history_share_link(p_include_comments boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.watch_history_share_links%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in to share your watch history'
      using errcode = '42501';
  end if;

  insert into public.watch_history_share_links (user_id, token, include_comments)
  values (
    auth.uid(),
    pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''),
    coalesce(p_include_comments, false)
  )
  on conflict (user_id) do update
    set include_comments = coalesce(p_include_comments, public.watch_history_share_links.include_comments),
        updated_at = pg_catalog.now()
  returning * into v_link;

  return jsonb_build_object('token', v_link.token, 'include_comments', v_link.include_comments);
end;
$$;

-- Turning the link off deletes it; a later link gets a new token, so the
-- old one never comes back to life.
create function public.delete_my_watch_history_share_link()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to share your watch history'
      using errcode = '42501';
  end if;

  delete from public.watch_history_share_links
  where user_id = auth.uid();
end;
$$;

-- The one public read. Unknown and turned-off tokens answer null alike, so a
-- viewer cannot tell a link that never existed from one that was withdrawn.
create function public.get_shared_watch_history(p_token text)
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

revoke all on function public.get_my_watch_history_share_link() from public, anon;
revoke all on function public.save_my_watch_history_share_link(boolean) from public, anon;
revoke all on function public.delete_my_watch_history_share_link() from public, anon;
revoke all on function public.get_shared_watch_history(text) from public;

grant execute on function public.get_my_watch_history_share_link() to authenticated;
grant execute on function public.save_my_watch_history_share_link(boolean) to authenticated;
grant execute on function public.delete_my_watch_history_share_link() to authenticated;
grant execute on function public.get_shared_watch_history(text) to anon, authenticated;

commit;

begin;

-- Who's here. A draw made with someone marked away should not land in that
-- person's Watch History: they were not there to watch it. The draw writes a
-- history row for every member, as it always has, and the person who drew
-- then takes the away members' rows back out, right after the draw.
--
-- As with set_bowl_draw_return_window, the draw functions themselves are
-- untouched: they are the most sensitive code here, and a failed call leaves
-- an ordinary draw with everyone's history rather than a failed draw.

-- Removes the personal history rows the draw of p_bowl_movie_id gave to the
-- people in p_away_user_ids. Only the person who drew may, only for ten
-- minutes after the draw, and only on rows that draw created. Answers how
-- many rows went.
create function public.leave_away_members_out_of_draw(
  p_bowl_movie_id uuid,
  p_away_user_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draw_event_id uuid;
  v_removed integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to change a draw.'
      using errcode = '42501';
  end if;

  if p_away_user_ids is null or cardinality(p_away_user_ids) = 0 then
    return 0;
  end if;

  select e.id
  into v_draw_event_id
  from public.bowl_draw_events e
  where e.source_bowl_movie_id = p_bowl_movie_id
    and e.drawn_by = auth.uid()
    and e.returned_at is null
    and e.removed_at is null
    and now() <= e.drawn_at + interval '10 minutes'
  for update of e;

  if not found then
    return 0;
  end if;

  delete from public.user_watch_events w
  where w.source_draw_event_id = v_draw_event_id
    and w.source_kind = 'bowl_draw'
    and w.user_id = any (p_away_user_ids)
    -- Whoever drew was in the room.
    and w.user_id <> auth.uid();
  get diagnostics v_removed = row_count;

  return v_removed;
end;
$$;

revoke all on function public.leave_away_members_out_of_draw(uuid, uuid[]) from public, anon;
grant execute on function public.leave_away_members_out_of_draw(uuid, uuid[]) to authenticated;

comment on function public.leave_away_members_out_of_draw(uuid, uuid[]) is
  'Lets the person who just drew keep the draw out of the Watch History of the members who were not there.';

commit;

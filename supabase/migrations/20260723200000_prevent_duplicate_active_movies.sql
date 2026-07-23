-- Prevent new duplicate active TMDB movies without deleting duplicate rows that
-- already exist. The migration runner keeps this lock through the transaction,
-- closing the gap between the registry backfill and trigger installation.
begin;

lock table public.bowl_movies in share row exclusive mode;

create table public.bowl_active_tmdb_movies (
  bowl_id uuid not null references public.bowls(id) on delete cascade,
  tmdb_id bigint not null check (tmdb_id > 0),
  active_count integer not null check (active_count > 0),
  primary key (bowl_id, tmdb_id)
);

alter table public.bowl_active_tmdb_movies enable row level security;

revoke all on table public.bowl_active_tmdb_movies from public, anon, authenticated;

insert into public.bowl_active_tmdb_movies (bowl_id, tmdb_id, active_count)
select
  bowl_id,
  tmdb_id,
  count(*)::integer
from public.bowl_movies
where drawn_at is null
  and tmdb_id > 0
group by bowl_id, tmdb_id;

create or replace function public.sync_bowl_active_tmdb_movies()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_bowl_id uuid;
  v_old_tmdb_id bigint;
  v_new_bowl_id uuid;
  v_new_tmdb_id bigint;
begin
  if tg_op <> 'INSERT'
    and old.drawn_at is null
    and old.tmdb_id > 0
  then
    v_old_bowl_id := old.bowl_id;
    v_old_tmdb_id := old.tmdb_id;
  end if;

  if tg_op <> 'DELETE'
    and new.drawn_at is null
    and new.tmdb_id > 0
  then
    v_new_bowl_id := new.bowl_id;
    v_new_tmdb_id := new.tmdb_id;
  end if;

  if v_old_bowl_id is not distinct from v_new_bowl_id
    and v_old_tmdb_id is not distinct from v_new_tmdb_id
  then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if v_new_bowl_id is not null and v_new_tmdb_id is not null then
    begin
      insert into public.bowl_active_tmdb_movies (bowl_id, tmdb_id, active_count)
      values (v_new_bowl_id, v_new_tmdb_id, 1);
    exception
      when unique_violation then
        raise exception using
          errcode = '23505',
          message = 'This movie is already in the bowl.',
          constraint = 'bowl_active_tmdb_movies_pkey';
    end;
  end if;

  if v_old_bowl_id is not null and v_old_tmdb_id is not null then
    update public.bowl_active_tmdb_movies
    set active_count = active_count - 1
    where bowl_id = v_old_bowl_id
      and tmdb_id = v_old_tmdb_id
      and active_count > 1;

    if not found then
      delete from public.bowl_active_tmdb_movies
      where bowl_id = v_old_bowl_id
        and tmdb_id = v_old_tmdb_id
        and active_count = 1;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_bowl_active_tmdb_movies() from public, anon, authenticated;

create trigger sync_bowl_active_tmdb_movies_after_write
after insert or update or delete on public.bowl_movies
for each row
execute function public.sync_bowl_active_tmdb_movies();

commit;

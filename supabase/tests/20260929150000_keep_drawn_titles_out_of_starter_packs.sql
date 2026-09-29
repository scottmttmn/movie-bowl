begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(8);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000941', 'drawn-pack-owner@example.com'),
  ('00000000-0000-0000-0000-000000000942', 'drawn-pack-member@example.com');

insert into public.profiles (id, email)
select id, email
from auth.users
where id::text like '00000000-0000-0000-0000-00000000094_';

insert into public.bowls (id, name, owner_id)
values
  ('10000000-0000-0000-0000-000000000941', 'Long History', '00000000-0000-0000-0000-000000000941'),
  ('10000000-0000-0000-0000-000000000942', 'Only Watched', '00000000-0000-0000-0000-000000000941'),
  ('10000000-0000-0000-0000-000000000943', 'Somewhere Else', '00000000-0000-0000-0000-000000000942');

insert into public.bowl_members (bowl_id, user_id, role)
values
  ('10000000-0000-0000-0000-000000000941', '00000000-0000-0000-0000-000000000941', 'Owner'),
  ('10000000-0000-0000-0000-000000000941', '00000000-0000-0000-0000-000000000942', 'Member'),
  ('10000000-0000-0000-0000-000000000942', '00000000-0000-0000-0000-000000000941', 'Owner'),
  ('10000000-0000-0000-0000-000000000943', '00000000-0000-0000-0000-000000000942', 'Owner');

-- 94001 was drawn and stands. 94002 was drawn and returned, which means the
-- group never watched it. 94003 was drawn and then removed from the watched
-- history by the owner, which hides it but does not undo it. 94004 was drawn,
-- but in someone else's bowl.
insert into public.bowl_draw_events (bowl_id, bowl_name, added_by, drawn_by, tmdb_id, title, drawn_at, returned_at, removed_at)
values
  ('10000000-0000-0000-0000-000000000941', 'Long History', '00000000-0000-0000-0000-000000000942', '00000000-0000-0000-0000-000000000941', 94001, 'Watched', '2026-01-01T00:00:00Z', null, null),
  ('10000000-0000-0000-0000-000000000941', 'Long History', '00000000-0000-0000-0000-000000000942', '00000000-0000-0000-0000-000000000941', 94002, 'Put Back', '2026-01-02T00:00:00Z', '2026-01-02T01:00:00Z', null),
  ('10000000-0000-0000-0000-000000000941', 'Long History', '00000000-0000-0000-0000-000000000942', '00000000-0000-0000-0000-000000000941', 94003, 'Hidden', '2026-01-03T00:00:00Z', null, '2026-02-01T00:00:00Z'),
  ('10000000-0000-0000-0000-000000000943', 'Somewhere Else', '00000000-0000-0000-0000-000000000942', '00000000-0000-0000-0000-000000000942', 94004, 'Elsewhere', '2026-01-04T00:00:00Z', null, null),
  ('10000000-0000-0000-0000-000000000942', 'Only Watched', '00000000-0000-0000-0000-000000000941', '00000000-0000-0000-0000-000000000941', 94001, 'Watched', '2026-01-01T00:00:00Z', null, null);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000941","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000941', true);

select is(
  public.install_bowl_starter_pack(
    '10000000-0000-0000-0000-000000000941',
    'spielberg-1980s',
    'Spielberg: The ''80s',
    '[{"tmdb_id": 94001, "title": "Watched"},
      {"tmdb_id": 94002, "title": "Put Back"},
      {"tmdb_id": 94003, "title": "Hidden"},
      {"tmdb_id": 94004, "title": "Elsewhere"},
      {"tmdb_id": 94005, "title": "New"}]'
  ),
  '{"starter_pack": "spielberg-1980s", "inserted": [94002, 94004, 94005], "already_in_bowl": [], "already_drawn": [94001, 94003], "over_limit": [], "pack_slips": 3}'::jsonb,
  'a top-up skips titles the bowl drew, however little history the client sent'
);

select is(
  public.install_bowl_starter_pack(
    '10000000-0000-0000-0000-000000000942',
    'hanks-1990s',
    'Tom Hanks: The ''90s',
    '[{"tmdb_id": 94001, "title": "Watched"}]'
  ),
  '{"starter_pack": null, "inserted": [], "already_in_bowl": [], "already_drawn": [94001], "over_limit": [], "pack_slips": 0}'::jsonb,
  'an install where every title was drawn lands nothing'
);

reset role;

select is(
  (
    select array_agg(tmdb_id order by tmdb_id)
    from public.bowl_movies
    where bowl_id = '10000000-0000-0000-0000-000000000941' and starter_pack is not null
  ),
  array[94002, 94004, 94005]::bigint[],
  'only the titles the bowl has not watched became slips'
);
select ok(
  not exists (
    select 1 from public.bowl_movies
    where bowl_id = '10000000-0000-0000-0000-000000000941' and tmdb_id in (94001, 94003)
  ),
  'a drawn title is not put back, including one hidden from the watched history'
);
select is(
  (select starter_pack from public.bowls where id = '10000000-0000-0000-0000-000000000942'),
  null,
  'and a bowl that landed nothing has no pack installed'
);
select is(
  (select count(*)::integer from public.bowl_draw_events where bowl_id = '10000000-0000-0000-0000-000000000941'),
  3,
  'skipping a drawn title leaves its draw alone'
);

select ok(
  has_function_privilege('authenticated', 'public.install_bowl_starter_pack(uuid,text,text,jsonb)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.install_bowl_starter_pack(uuid,text,text,jsonb)', 'EXECUTE'),
  'replacing the install keeps its grants'
);
select ok(
  (
    select prosecdef and proconfig @> array['search_path=public']
    from pg_proc
    where oid = 'public.install_bowl_starter_pack(uuid,text,text,jsonb)'::regprocedure
  ),
  'and keeps it security definer with a fixed search path'
);

select * from finish();

rollback;

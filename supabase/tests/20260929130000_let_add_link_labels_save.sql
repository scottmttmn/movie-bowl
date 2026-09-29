begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(15);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000301', 'relabel-owner@example.com'),
  ('00000000-0000-0000-0000-000000000302', 'relabel-creator@example.com'),
  ('00000000-0000-0000-0000-000000000303', 'relabel-member@example.com'),
  ('00000000-0000-0000-0000-000000000304', 'relabel-former@example.com');

insert into public.profiles (id, email)
select id, email
from auth.users
where id::text like '00000000-0000-0000-0000-00000000030_';

insert into public.bowls (id, name, owner_id)
values ('10000000-0000-0000-0000-000000000301', 'Relabel Bowl', '00000000-0000-0000-0000-000000000301');

insert into public.bowl_members (bowl_id, user_id, role)
values
  ('10000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000301', 'Owner'),
  ('10000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000302', 'Member'),
  ('10000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000303', 'Member');

-- The former member made a link while they still belonged, then left.
insert into public.bowl_add_links (id, bowl_id, token, created_by, max_adds, adds_used, default_contributor_name)
values
  ('30000000-0000-0000-0000-000000000301', '10000000-0000-0000-0000-000000000301',
   'relabel-owner-link', '00000000-0000-0000-0000-000000000301', 5, 0, 'Dad'),
  ('30000000-0000-0000-0000-000000000302', '10000000-0000-0000-0000-000000000301',
   'relabel-creator-link', '00000000-0000-0000-0000-000000000302', 5, 0, 'Mum'),
  ('30000000-0000-0000-0000-000000000303', '10000000-0000-0000-0000-000000000301',
   'relabel-former-link', '00000000-0000-0000-0000-000000000304', 5, 0, 'Aunt');

create function pg_temp.act_as(p_user uuid) returns void
language sql as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text,
    true
  );
$$;

create function pg_temp.relabel(p_where text, p_label text) returns integer
language plpgsql as $$
declare
  v_count integer;
begin
  execute format('update public.bowl_add_links set default_contributor_name = %L where %s', p_label, p_where);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create function pg_temp.label_of(p_link uuid) returns text
language sql as $$
  select default_contributor_name from public.bowl_add_links where id = p_link;
$$;

-- The owner relabels any link in their bowl, including one a member made.
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000000301');
select is(
  pg_temp.relabel('id = ''30000000-0000-0000-0000-000000000301''', 'Grandpa'),
  1,
  'the owner can relabel their own link'
);
select is(
  pg_temp.relabel('id = ''30000000-0000-0000-0000-000000000302''', 'Mother'),
  1,
  'the owner can relabel a link a member created'
);
reset role;

select is(pg_temp.label_of('30000000-0000-0000-0000-000000000301'), 'Grandpa', 'the owner''s relabel persisted');
select is(pg_temp.label_of('30000000-0000-0000-0000-000000000302'), 'Mother', 'the owner''s relabel of a member link persisted');

-- A member relabels the link they created.
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000000302');
select is(
  pg_temp.relabel('id = ''30000000-0000-0000-0000-000000000302''', 'Mum'),
  1,
  'a member can relabel a link they created'
);
select is(
  pg_temp.relabel('id = ''30000000-0000-0000-0000-000000000301''', 'Hijacked'),
  0,
  'a member cannot relabel a link someone else created'
);
reset role;

select is(pg_temp.label_of('30000000-0000-0000-0000-000000000302'), 'Mum', 'the creator''s relabel persisted');
select is(pg_temp.label_of('30000000-0000-0000-0000-000000000301'), 'Grandpa', 'the refused relabel changed nothing');

-- An ordinary member with no link of their own.
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000000303');
select is(
  pg_temp.relabel('bowl_id = ''10000000-0000-0000-0000-000000000301''', 'Hijacked'),
  0,
  'a member who created no link cannot relabel any'
);
reset role;

-- A creator who has since left can no longer see the bowl's links.
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000000304');
select is(
  pg_temp.relabel('id = ''30000000-0000-0000-0000-000000000303''', 'Hijacked'),
  0,
  'a creator who left the bowl cannot relabel their old link'
);
reset role;

select is(pg_temp.label_of('30000000-0000-0000-0000-000000000303'), 'Aunt', 'the former creator''s link is unchanged');

-- The label is the only editable column, even for the owner.
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000000301');
select throws_ok(
  $sql$ update public.bowl_add_links set max_adds = 500 where id = '30000000-0000-0000-0000-000000000301' $sql$,
  '42501',
  null,
  'the owner cannot raise a link''s allowance directly'
);
select throws_ok(
  $sql$ update public.bowl_add_links set adds_used = 0 where id = '30000000-0000-0000-0000-000000000301' $sql$,
  '42501',
  null,
  'the owner cannot reset a link''s usage directly'
);
reset role;

set local role anon;
select throws_ok(
  $sql$ update public.bowl_add_links set default_contributor_name = 'Anon' where id = '30000000-0000-0000-0000-000000000301' $sql$,
  '42501',
  null,
  'anonymous callers cannot relabel a link'
);
reset role;

-- The public add path still spends the link through its definer function.
set local role anon;
select is(
  (select remaining_adds from public.consume_bowl_add_link(
    'relabel-owner-link',
    '{"title":"Relabel Test","tmdb_id":"603"}'::jsonb,
    null
  )),
  4,
  'consuming a link still counts the add after the grant is narrowed'
);
reset role;

select * from finish();

rollback;

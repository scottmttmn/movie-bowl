begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-000000000091', 'default-owner@example.com'),
 ('00000000-0000-0000-0000-000000000092', 'default-member@example.com'),
 ('00000000-0000-0000-0000-000000000093', 'default-outsider@example.com');
insert into public.profiles (id, email)
 select id, email from auth.users where id in
 ('00000000-0000-0000-0000-000000000091','00000000-0000-0000-0000-000000000092','00000000-0000-0000-0000-000000000093');

insert into public.bowls (id, name, owner_id) values
 ('10000000-0000-0000-0000-000000000091', 'Zulu', '00000000-0000-0000-0000-000000000091');
select is((select bowl_id from user_bowl_defaults where user_id='00000000-0000-0000-0000-000000000091'),
 '10000000-0000-0000-0000-000000000091'::uuid, 'first owned bowl initializes without an owner membership');
insert into public.bowls (id, name, owner_id) values
 ('10000000-0000-0000-0000-000000000092', ' Alpha ', '00000000-0000-0000-0000-000000000091'),
 ('10000000-0000-0000-0000-000000000093', 'alpha', '00000000-0000-0000-0000-000000000091');
select is((select bowl_id from user_bowl_defaults where user_id='00000000-0000-0000-0000-000000000091'),
 '10000000-0000-0000-0000-000000000091'::uuid, 'later acquisitions do not replace the default');
insert into public.bowl_members (bowl_id,user_id,role) values
 ('10000000-0000-0000-0000-000000000093','00000000-0000-0000-0000-000000000092','Member');
select is((select bowl_id from user_bowl_defaults where user_id='00000000-0000-0000-0000-000000000092'),
 '10000000-0000-0000-0000-000000000093'::uuid, 'first joined bowl initializes member preference');
insert into public.bowl_members (bowl_id,user_id,role) values
 ('10000000-0000-0000-0000-000000000091','00000000-0000-0000-0000-000000000092','Member'),
 ('10000000-0000-0000-0000-000000000092','00000000-0000-0000-0000-000000000092','Member');
insert into public.bowl_movies (bowl_id,added_by,tmdb_id,title) values
 ('10000000-0000-0000-0000-000000000091','00000000-0000-0000-0000-000000000091',-9101,'Custom slip'),
 ('10000000-0000-0000-0000-000000000091','00000000-0000-0000-0000-000000000092',9102,'Member slip'),
 ('10000000-0000-0000-0000-000000000092','00000000-0000-0000-0000-000000000091',9103,'Alpha slip');

select ok(not has_table_privilege('authenticated','public.user_bowl_defaults','INSERT'), 'no direct insert');
select ok(not has_table_privilege('authenticated','public.user_bowl_defaults','UPDATE'), 'no direct update');
select ok(not has_table_privilege('authenticated','public.user_bowl_defaults','DELETE'), 'no direct delete');
select ok(not has_function_privilege('anon','public.get_my_bowl_context()','EXECUTE'), 'anonymous cannot resolve');
select ok(not has_function_privilege('anon','public.set_my_default_bowl(uuid)','EXECUTE'), 'anonymous cannot set');
select ok(not has_function_privilege('authenticated','public._ensure_user_bowl_default(uuid)','EXECUTE'), 'cannot initialize another account');
select ok(not has_function_privilege('authenticated','public._accessible_bowl_context(uuid)','EXECUTE'), 'cannot list another account');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000092',true);
select is((get_my_bowl_context()->>'default_bowl_id'), '10000000-0000-0000-0000-000000000093', 'counts do not change a valid saved default');
select is(jsonb_array_length(get_my_bowl_context()->'bowls'),3,'member can see all three bowls');
select is((select count(*) from user_bowl_defaults),1::bigint,'RLS exposes only own preference');
select is((set_my_default_bowl('10000000-0000-0000-0000-000000000092')->>'default_bowl_id'),
 '10000000-0000-0000-0000-000000000092','member can explicitly change default');
select lives_ok($$select set_my_default_bowl('10000000-0000-0000-0000-000000000092')$$,'selected star is idempotent');
select throws_ok($$select set_my_default_bowl(null)$$,'42501','That bowl is no longer available.','cannot unset default');
select throws_ok($$select set_my_default_bowl('10000000-0000-0000-0000-000000000099')$$,'42501','That bowl is no longer available.','nonexistent target is refused');
reset role;
select is((select bowl_id from user_bowl_defaults where user_id='00000000-0000-0000-0000-000000000091'),
 '10000000-0000-0000-0000-000000000091'::uuid,'member choice does not change owner choice');

-- Exercise the exact migration/repair helper against an existing account.
delete from user_bowl_defaults where user_id='00000000-0000-0000-0000-000000000092';
select is(_ensure_user_bowl_default('00000000-0000-0000-0000-000000000092'),
 '10000000-0000-0000-0000-000000000091'::uuid,'backfill counts all undrawn slips, including custom and other contributors');
update bowl_movies set drawn_at=now() where bowl_id='10000000-0000-0000-0000-000000000091';
update user_bowl_defaults set bowl_id=null where user_id='00000000-0000-0000-0000-000000000092';
select is(_ensure_user_bowl_default('00000000-0000-0000-0000-000000000092'),
 '10000000-0000-0000-0000-000000000092'::uuid,'drawn movies do not count');
update bowl_movies set drawn_at=now();
update user_bowl_defaults set bowl_id=null where user_id='00000000-0000-0000-0000-000000000092';
select is(_ensure_user_bowl_default('00000000-0000-0000-0000-000000000092'),
 '10000000-0000-0000-0000-000000000092'::uuid,'all-empty ties use trimmed case-insensitive name then UUID');
delete from bowl_members where user_id='00000000-0000-0000-0000-000000000092' and bowl_id='10000000-0000-0000-0000-000000000092';
select is(_ensure_user_bowl_default('00000000-0000-0000-0000-000000000092'),
 '10000000-0000-0000-0000-000000000093'::uuid,'membership loss repairs to next alphabetical bowl');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000092',true);
select throws_ok($$select set_my_default_bowl('10000000-0000-0000-0000-000000000092')$$,'42501','That bowl is no longer available.','lost membership cannot be selected');
reset role;
delete from bowls where id='10000000-0000-0000-0000-000000000093';
select is((select bowl_id from user_bowl_defaults where user_id='00000000-0000-0000-0000-000000000092'),null::uuid,'bowl deletion clears FK');
select is(_ensure_user_bowl_default('00000000-0000-0000-0000-000000000092'),
 '10000000-0000-0000-0000-000000000091'::uuid,'single remaining bowl is replacement');
delete from bowl_members where user_id='00000000-0000-0000-0000-000000000092';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000092',true);
select is(get_my_bowl_context(),'{"default_bowl_id":null,"bowls":[]}'::jsonb,'loss of final bowl resolves to empty context');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000093',true);
select throws_ok($$select set_my_default_bowl('10000000-0000-0000-0000-000000000091')$$,'42501','That bowl is no longer available.','outsider cannot select a private bowl');
select is(get_my_bowl_context(),'{"default_bowl_id":null,"bowls":[]}'::jsonb,'outsider cannot list private bowls');
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select get_my_bowl_context()$$,'42501','You must be signed in to load your bowls.','function rejects a missing user even with execute permission');
reset role;
insert into bowl_members (bowl_id,user_id,role) values
 ('10000000-0000-0000-0000-000000000092','00000000-0000-0000-0000-000000000092','Member');
select is((select bowl_id from user_bowl_defaults where user_id='00000000-0000-0000-0000-000000000092'),
 '10000000-0000-0000-0000-000000000092'::uuid,'new acquisition after no bowls becomes default');
select * from finish();
rollback;

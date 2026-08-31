-- Revert dependent clients first. This discards preferences, not bowl data.
begin;
drop trigger if exists initialize_owned_bowl_default on public.bowls;
drop trigger if exists initialize_joined_bowl_default on public.bowl_members;
drop function if exists public._initialize_acquired_bowl_default();
drop function if exists public.set_my_default_bowl(uuid);
drop function if exists public.get_my_bowl_context();
drop function if exists public._ensure_user_bowl_default(uuid);
drop function if exists public._accessible_bowl_context(uuid);
drop table if exists public.user_bowl_defaults;
commit;

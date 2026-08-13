-- Revert the owner-controlled draw method and return every bowl to the single
-- person-first behavior. Move this file into supabase/migrations/ with a fresh
-- timestamp to run it.

begin;

drop function if exists public.save_bowl_draw_method(uuid, text);

alter table public.bowls
  drop constraint if exists bowls_draw_method_check;

alter table public.bowls
  drop column if exists draw_method;

commit;

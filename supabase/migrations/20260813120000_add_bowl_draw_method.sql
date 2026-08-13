-- Make the draw method an owner-controlled bowl setting. Person-first is the
-- current behavior and stays the default, so this migration is a no-op for
-- every existing bowl.

begin;

alter table public.bowls
  add column if not exists draw_method text not null default 'person_first';

alter table public.bowls
  drop constraint if exists bowls_draw_method_check;

-- A text column with a check constraint rather than an enum: adding a method
-- later is then a plain additive migration instead of a type change. Only
-- shipped methods are allowed, so a stored value the client cannot honor
-- cannot exist.
alter table public.bowls
  add constraint bowls_draw_method_check
  check (draw_method in ('person_first', 'title_first'));

create or replace function public.save_bowl_draw_method(
  p_bowl_id uuid,
  p_method text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to update the draw method.'
      using errcode = '42501';
  end if;

  select bowl.owner_id
  into v_owner_id
  from public.bowls bowl
  where bowl.id = p_bowl_id
  for update;

  if not found or v_owner_id is distinct from auth.uid() then
    raise exception 'Only the bowl owner can update the draw method.'
      using errcode = '42501';
  end if;

  -- Validated here as well as by the constraint: a bare constraint violation
  -- would surface in the UI as an opaque database error.
  if p_method is null
    or p_method not in ('person_first', 'title_first')
  then
    raise exception 'Invalid draw method.'
      using errcode = 'P0001';
  end if;

  update public.bowls
  set draw_method = p_method
  where id = p_bowl_id;

  return p_method;
end;
$$;

revoke all on function public.save_bowl_draw_method(uuid, text)
from public, anon, authenticated;

grant execute on function public.save_bowl_draw_method(uuid, text)
to authenticated;

comment on function public.save_bowl_draw_method(uuid, text) is
  'Sets the draw method for a bowl owned by the authenticated user.';

commit;

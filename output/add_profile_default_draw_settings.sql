alter table public.profiles
add column if not exists default_draw_settings jsonb not null default '{}'::jsonb;

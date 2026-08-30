begin;
drop function if exists public.begin_title_provider_link_fetch(bigint, text, uuid, uuid, integer);
drop function if exists public.complete_title_provider_link_fetch(bigint, text, jsonb);
drop function if exists public.fail_title_provider_link_fetch(bigint, text, text);
drop function if exists public.prune_title_provider_links();
drop table if exists public.title_provider_links;
drop table if exists public.title_provider_link_usage;
commit;

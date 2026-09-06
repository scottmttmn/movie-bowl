begin;

drop function if exists public.consume_tv_pairing_rate_limit(text, text, integer, integer);
drop table if exists public.tv_pairing_rate_limits;

commit;

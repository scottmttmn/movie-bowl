"""Run against a scratch database, never a hosted one: this writes rows.

Build one with `PGTAP_KEEP=1 ./scripts/pgtap.sh`, which prints the name it kept,
then pass that database's URL here.

Every caller in a race below is a separate connection, released at the same
instant, so the departure lease and quota counters are tested against real
contention rather than one session taking turns.
"""
import argparse
import concurrent.futures
import json
import subprocess
import uuid

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--database-url", required=True)
args = parser.parse_args()
# The guard is the point of the flag. A hosted Supabase URL reaches production,
# and every statement below inserts.
if "supabase.co" in args.database_url or "supabase.com" in args.database_url:
    parser.error("Refusing a hosted Supabase URL. Use a scratch database.")
command = ["psql", args.database_url, "-XAtq", "-v", "ON_ERROR_STOP=1"]
owner, member, bowl = (str(uuid.uuid4()) for _ in range(3))
# Titles no other fixture uses, so the cache rows are this run's alone.
base_title = 880000000 + uuid.uuid4().int % 1000000 * 100


def sql(statement):
    return subprocess.run(command, input=statement, text=True, capture_output=True, check=True, timeout=30).stdout.strip()


def race(calls):
    # Each connection waits for the same wall-clock instant before reserving.
    start = sql("select (clock_timestamp() + interval '2 seconds')::text")

    def one(call):
        user, title, budget = call
        out = sql(
            "set role service_role; "
            f"select pg_sleep_until('{start}'); "
            f"select public.begin_title_departure_fetch({title}, '{bowl}', '{user}', {budget})::text;"
        )
        return json.loads(out.splitlines()[-1])

    with concurrent.futures.ThreadPoolExecutor(max_workers=len(calls)) as pool:
        return list(pool.map(one, calls))


def usage():
    return int(sql(
        "select coalesce(sum(request_count), 0) from public.title_departure_usage "
        "where usage_day >= (now() at time zone 'UTC')::date - 31"
    ))


def mine():
    return int(sql(
        "select coalesce(sum(request_count), 0) from public.title_departure_usage "
        f"where user_id in ('{owner}', '{member}')"
    ))


titles = [base_title + n for n in range(40)]
try:
    sql(
        f"insert into auth.users(id,email) values ('{owner}','lease-owner-{owner}@example.com'), "
        f"('{member}','lease-member-{member}@example.com'); "
        f"insert into public.profiles(id,email,streaming_services) values "
        f"('{owner}','lease-owner-{owner}@example.com',array['Netflix']), "
        f"('{member}','lease-member-{member}@example.com',array['Netflix']); "
        f"insert into public.bowls(id,name,owner_id) values ('{bowl}','Lease race','{owner}'); "
        f"insert into public.bowl_members(bowl_id,user_id) values ('{bowl}','{member}'); "
        "insert into public.bowl_movies(bowl_id,added_by,tmdb_id,title) "
        f"select '{bowl}','{owner}',t,'Lease fixture' from unnest(array{titles}::bigint[]) t;"
    )

    # One title, many viewers at once: exactly one of them may call the vendor.
    results = race([(owner if n % 2 else member, titles[0], 900) for n in range(12)])
    leases = [r for r in results if r.get("should_fetch")]
    assert len(leases) == 1, results
    assert mine() == 1, mine()
    token = sql(f"select fetch_token from public.title_departures where tmdb_id = {titles[0]}")
    assert token == leases[0]["token"], (token, leases)
    print("PASS simultaneous lookups of one title take one lease and one request")

    # Many titles against a nearly spent shared budget: never past the cap.
    budget = usage() + 3
    results = race([(owner if n % 2 else member, titles[1 + n], budget) for n in range(10)])
    assert sum(1 for r in results if r.get("should_fetch")) == 3, results
    assert usage() == budget, (usage(), budget)
    print("PASS simultaneous lookups of different titles stop exactly at the shared budget")

    # One person racing past their daily allowance: never past thirty.
    sql(
        f"delete from public.title_departure_usage where user_id in ('{owner}','{member}'); "
        "insert into public.title_departure_usage(usage_day,user_id,request_count) "
        f"values ((now() at time zone 'UTC')::date, '{owner}', 28);"
    )
    results = race([(owner, titles[11 + n], 900) for n in range(8)])
    assert sum(1 for r in results if r.get("should_fetch")) == 2, results
    assert mine() == 30, mine()
    print("PASS simultaneous lookups by one person stop exactly at the daily limit")
finally:
    sql(
        f"delete from public.title_departures where tmdb_id between {titles[0]} and {titles[-1]}; "
        f"delete from public.title_departure_usage where user_id in ('{owner}','{member}'); "
        f"delete from public.bowls where id = '{bowl}'; "
        f"delete from auth.users where id in ('{owner}','{member}');"
    )

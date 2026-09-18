"""Run against a scratch database, never a hosted one: this writes rows.

Build one with `PGTAP_KEEP=1 ./scripts/pgtap.sh`, which prints the name it kept,
then pass that database's URL here.
"""
import argparse
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
user, bowl_a, bowl_b = (str(uuid.uuid4()) for _ in range(3))


def sql(statement):
    return subprocess.run(command, input=statement, text=True, capture_output=True, check=True, timeout=20).stdout.strip()


def race(first, second):
    # READY is emitted after the first transaction owns its preference lock.
    # The second connection then exercises actual blocking/serialization.
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    process.stdin.write("begin; " + first + "; select 'READY'; select pg_sleep(0.5); commit;\n")
    process.stdin.close()
    ready = False
    for line in process.stdout:
        if line.strip() == "READY":
            ready = True
            break
    if not ready:
        raise AssertionError(process.stderr.read())
    sql("begin; " + second + "; commit;")
    process.wait(timeout=10)
    assert process.returncode == 0, process.stderr.read()


try:
    sql(f"insert into auth.users(id,email) values ('{user}','default-concurrency@example.com'); "
        f"insert into public.profiles(id,email) values ('{user}','default-concurrency@example.com');")
    race(f"insert into public.bowls(id,name,owner_id) values ('{bowl_a}','Alpha','{user}')",
         f"insert into public.bowls(id,name,owner_id) values ('{bowl_b}','Beta','{user}')")
    assert sql(f"select bowl_id from public.user_bowl_defaults where user_id='{user}'") == bowl_a
    print("PASS concurrent first acquisitions preserve the first committed initialization")

    sql(f"update public.user_bowl_defaults set bowl_id=null where user_id='{user}'")
    race(f"select set_config('request.jwt.claim.sub','{user}',true); select public.set_my_default_bowl('{bowl_b}')",
         f"select public._ensure_user_bowl_default('{user}')")
    assert sql(f"select bowl_id from public.user_bowl_defaults where user_id='{user}'") == bowl_b
    print("PASS repair waiting behind an explicit choice preserves that choice")

    race(f"select set_config('request.jwt.claim.sub','{user}',true); select public.set_my_default_bowl('{bowl_b}')",
         f"select set_config('request.jwt.claim.sub','{user}',true); select public.delete_owned_bowl('{bowl_b}')")
    assert sql(f"select public._ensure_user_bowl_default('{user}')") == bowl_a
    print("PASS selection racing deletion resolves to the remaining accessible bowl")
finally:
    sql(f"delete from auth.users where id='{user}'")

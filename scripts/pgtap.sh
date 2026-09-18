#!/usr/bin/env bash
# Runs the pgTAP suites against a scratch database built from this repository,
# then drops it.
#
#   ./scripts/pgtap.sh                    # all suites
#   ./scripts/pgtap.sh supabase/tests/20260904120000_*.sql
#
# The database is supabase/baseline/ followed by every file in
# supabase/migrations/ in order, which is the whole schema. Nothing here reads
# the hosted project, and nothing writes to it: pgTAP writes rows.
#
# You need a PostgreSQL you can reach as a superuser, with pgTAP and pg_prove
# installed beside it:
#
#   Debian/Ubuntu   sudo apt-get install pgtap
#   macOS           brew install postgresql@16 pgtap
#
# Point DATABASE_URL at it when it is not the local default below. That URL's
# own database is only connected to in order to create and drop the scratch
# one; no suite runs in it.
#
# PGTAP_KEEP=1 leaves the scratch database behind and prints its name, for
# poking at a failure by hand or for the fixture scripts that need a database
# built this way.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ADMIN_URL="${DATABASE_URL:-postgres://postgres@localhost:5432/postgres}"

if [ "$#" -gt 0 ]; then
  TESTS=("$@")
else
  TESTS=("$REPO"/supabase/tests/*.sql)
fi

# psql and pg_prove agree on libpq's environment and disagree on almost
# everything else, so the URL is turned into that environment once here rather
# than into flags at each call site.
eval "$(python3 - "$ADMIN_URL" <<'PY'
import shlex, sys, urllib.parse

url = urllib.parse.urlparse(sys.argv[1])
for name, value in (
    ("PGHOST", url.hostname or "localhost"),
    ("PGPORT", str(url.port or 5432)),
    ("PGUSER", urllib.parse.unquote(url.username or "")),
    ("PGPASSWORD", urllib.parse.unquote(url.password or "")),
    ("ADMIN_DB", (url.path or "/postgres").lstrip("/") or "postgres"),
):
    if value:
        print(f"export {name}={shlex.quote(value)}")
PY
)"

# A distinct name per run, so a rerun over a crashed one does not collide.
SCRATCH="movie_bowl_pgtap_$$"

admin() { psql -v ON_ERROR_STOP=1 -q -d "$ADMIN_DB" "$@"; }

cleanup() {
  if [ -n "${PGTAP_KEEP:-}" ]; then
    echo "==> kept $SCRATCH (drop it yourself when you are done)"
    return
  fi
  admin -c "drop database if exists $SCRATCH with (force)" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if ! admin -c 'select 1' >/dev/null 2>&1; then
  echo "Could not connect to ${PGUSER:-$(id -un)}@$PGHOST:$PGPORT/$ADMIN_DB." >&2
  echo "Start PostgreSQL, or set DATABASE_URL to a superuser connection." >&2
  exit 2
fi

echo "==> building $SCRATCH"
admin -c "drop database if exists $SCRATCH with (force)" >/dev/null
admin -c "create database $SCRATCH" >/dev/null

# The order is the point. The baseline is the schema as it stood before this
# repository's first migration; the migrations carry it from there to what is
# deployed. Applying them any other way tests a schema nobody runs.
for sql in "$REPO"/supabase/baseline/*.sql "$REPO"/supabase/migrations/*.sql; do
  PGOPTIONS="-c client_min_messages=warning" \
    psql -v ON_ERROR_STOP=1 -q -d "$SCRATCH" -f "$sql" >/dev/null
done

echo "==> running pgTAP"
mkdir -p "$REPO/.pgtap"
set +e
pg_prove --dbname "$SCRATCH" --failures "${TESTS[@]}" 2>&1 | tee "$REPO/.pgtap/last-run.txt"
status=${PIPESTATUS[0]}
set -e

# pg_prove reports "NOTESTS" and exits 0 when it was handed nothing to run, so
# a suite directory that stopped matching would pass silently.
if ! grep -q "Files=[1-9]" "$REPO/.pgtap/last-run.txt"; then
  echo "pg_prove ran no suites. Check the path you passed, or supabase/tests/." >&2
  status=1
fi

# `npm run test:counts -- pgtap` reads this, for the same reason the Vitest and
# Playwright runs write one: a suite that stops being collected does not turn
# anything red, it just makes the number smaller.
python3 - "$REPO/.pgtap/last-run.txt" "$REPO/.pgtap/last-run.json" "$status" <<'PY'
import json, re, sys

text = open(sys.argv[1]).read()
match = re.search(r"Files=(\d+),\s*Tests=(\d+)", text)
json.dump(
    {
        "files": int(match.group(1)) if match else 0,
        "tests": int(match.group(2)) if match else 0,
        "success": sys.argv[3] == "0",
    },
    open(sys.argv[2], "w"),
)
PY

exit "$status"

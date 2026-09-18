#!/usr/bin/env bash
# Runs the pgTAP suites against a disposable local Supabase project seeded from
# the linked project's schema, then removes every trace of it.
#
#   ./scripts/pgtap.sh                    # all suites
#   ./scripts/pgtap.sh supabase/tests/20260904120000_*.sql
#
# Never runs against the hosted database: pgTAP writes rows.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TESTS="${1:-$REPO/supabase/tests}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/movie-bowl-pgtap.XXXXXX")"

# Resolve the CLI once. `npx --yes supabase@<version>` refetches into a separate
# cache and can stall for minutes; a resolved binary path does not.
SUPABASE="$(command -v supabase || true)"
if [ -z "$SUPABASE" ]; then
  SUPABASE="$(ls "$HOME"/.npm/_npx/*/node_modules/@supabase/cli-darwin-*/bin/supabase 2>/dev/null | head -1 || true)"
fi
if [ -z "$SUPABASE" ]; then
  echo "supabase CLI not found. Install it, or run 'npx supabase --version' once to cache it." >&2
  exit 2
fi

cleanup() {
  "$SUPABASE" stop --workdir "$WORK" --no-backup >/dev/null 2>&1 || true
  rm -rf "$WORK"
  echo "cleaned up $WORK"
}
trap cleanup EXIT

( cd "$WORK" && "$SUPABASE" init >/dev/null )
mkdir -p "$WORK/supabase/migrations"

# pg_dump renders the ACL it wants each object to END UP with, assuming the
# target starts from Postgres defaults. A Supabase database does not: it grants
# anon, authenticated and service_role by default privilege, so every object the
# restore creates is born with explicit grants that the dump's
# "REVOKE ALL ... FROM PUBLIC" does not remove -- PUBLIC and anon are different
# grantees. The real migrations revoke "from public, anon, authenticated" by
# name, which is why production is correct and a naive reconstruction is not.
#
# Clearing the defaults first makes the dump's own grants authoritative. The
# dump restores these same defaults at its end, so objects created afterwards
# match production again. Without this the suite reports ~70 phantom privilege
# failures and can never go green.
cat > "$WORK/supabase/migrations/00000000000000_reset_default_privileges.sql" <<'SQL'
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
SQL

echo "==> dumping schema-only baseline from the linked project"
( cd "$REPO" && "$SUPABASE" db dump --schema public \
    -f "$WORK/supabase/migrations/00000000000001_baseline.sql" >/dev/null )

# Anything not yet deployed still has to be applied on top of the baseline. This
# is the only path that carries a migration the hosted project has never seen,
# so when it finds nothing the suite tests the wrong schema and says the new
# function simply does not exist. It did exactly that until a suite finally
# depended on it: every earlier suite was written against a migration that had
# already been pushed, so the step had never had to work.
#
# Read the CLI once and try both shapes it has printed across releases -- JSON
# on the last line, or the table -- then say so rather than continuing in
# silence, and take an explicit version when neither answers.
migration_list="$( (cd "$REPO" && "$SUPABASE" migration list 2>/dev/null) || true )"
pending="$(printf '%s\n' "$migration_list" | tail -1 \
  | python3 -c 'import sys,json; print(" ".join(m["local"] for m in json.load(sys.stdin)["migrations"] if not m["remote"]))' 2>/dev/null || true)"
if [ -z "$pending" ]; then
  # A version in the LOCAL column with nothing beside it in REMOTE. The CLI
  # draws that column with a box-drawing bar, which awk cannot split on a byte
  # at a time, so normalise it to an ASCII pipe first.
  pending="$(printf '%s\n' "$migration_list" | sed 's/│/|/g' \
    | awk -F'|' 'NF >= 2 {
        local_version = $1;
        remote_version = $2;
        gsub(/[^0-9]/, "", local_version);
        gsub(/[^0-9]/, "", remote_version);
        if (length(local_version) == 14 && remote_version == "") print local_version;
      }' || true)"
fi
pending="$pending ${PGTAP_EXTRA_MIGRATIONS:-}"

included=""
for version in $pending; do
  case " $included " in *" $version "*) continue ;; esac
  if cp "$REPO/supabase/migrations/${version}"_*.sql "$WORK/supabase/migrations/" 2>/dev/null; then
    included="$included $version"
    echo "==> including unapplied migration $version"
  else
    echo "==> no migration file for version $version" >&2
  fi
done

if [ -z "$included" ]; then
  echo "==> no unapplied migrations found; the suites run against the deployed schema only." >&2
  echo "==> if one of them covers a migration you have not pushed, name it:" >&2
  echo "==>   PGTAP_EXTRA_MIGRATIONS=20260917220000 ./scripts/pgtap.sh" >&2
fi

echo "==> starting disposable project"
( cd "$WORK" && "$SUPABASE" start --workdir "$WORK" >/dev/null )

echo "==> running pgTAP"
"$SUPABASE" test db "$TESTS" --local --workdir "$WORK"

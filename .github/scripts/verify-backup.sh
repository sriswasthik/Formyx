#!/usr/bin/env bash
# Checks a restored backup against production, and fails the run if it falls short:
#   verify-backup.sh <source counts> <restored counts> <migrations folder> <restored database url>
# - every table holds at least 95% of the rows production had just before the dump (rows can
#   be deleted while it runs, by people or by retention, so an exact match is too strict), and
#   none is empty that production had rows in;
# - the restored database has applied migrations, and each one is in this repository.
set -euo pipefail

source_counts="$1"
restored_counts="$2"
migrations_dir="$3"
restore_url="$4"
failed=0

while read -r table source; do
  restored=$(awk -v t="$table" '$1 == t { print $2 }' "$restored_counts")
  restored=${restored:-0}
  echo "$table: production $source, restored $restored"
  if [ "$source" -gt 0 ] && [ "$restored" -eq 0 ]; then
    echo "::error::$table came back empty"
    failed=1
  elif [ $((restored * 100)) -lt $((source * 95)) ]; then
    echo "::error::$table came back with fewer than 95% of its rows"
    failed=1
  fi
done < "$source_counts"

applied=$(psql "$restore_url" --no-psqlrc --tuples-only --no-align \
  --command "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name" |
  tr -d '\r')
if [ -z "$applied" ]; then
  echo "::error::The restored database has no applied migrations"
  failed=1
fi
while read -r migration; do
  [ -z "$migration" ] && continue
  if [ ! -d "$migrations_dir/$migration" ]; then
    echo "::error::The backup has migration $migration, which this repository does not"
    failed=1
  fi
done <<< "$applied"
echo "Latest migration in the backup: $(echo "$applied" | tail -n 1)"

if [ "$failed" -ne 0 ]; then
  echo "::error::The backup did not restore cleanly. The encrypted dump is still kept as an artifact."
  exit 1
fi
echo "The backup restores cleanly."

#!/usr/bin/env bash
# Prints "<table> <rows>" for the tables a backup must bring back, from the database at $1.
set -euo pipefail

url="$1"
for table in users workspaces memberships forms submissions subscriptions payments; do
  # tr: psql on Windows ends lines with \r; harmless on Linux.
  count=$(psql "$url" --no-psqlrc --tuples-only --no-align \
    --command "SELECT count(*) FROM public.\"$table\"" | tr -d '\r')
  echo "$table $count"
done

#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "$0")/.." && pwd)"
raw_dir="$root_dir/external-raw"
mkdir -p "$raw_dir"
retrieved_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
query='repo:counterfact/api-simulator is:issue created:<2026-09-04'
encoded_query='repo%3Acounterfact%2Fapi-simulator%20is%3Aissue%20created%3A%3C2026-09-04'
pages_file="$raw_dir/issues-search-pages.json"
printf '[]' > "$pages_file"
page=1
total_count='null'
while :; do
  temporary="$raw_dir/.issues-search-page-$page.json"
  gh api "/search/issues?q=${encoded_query}&per_page=100&page=${page}" > "$temporary"
  count="$(jq '.items | length' "$temporary")"
  total_count="$(jq '.total_count' "$temporary")"
  if [ "$count" -eq 0 ]; then
    rm "$temporary"
    break
  fi
  jq --slurpfile next "$temporary" '. + [$next[0]]' "$pages_file" > "$pages_file.next"
  mv "$pages_file.next" "$pages_file"
  rm "$temporary"
  page=$((page + 1))
done
jq -n \
  --arg retrieved_at "$retrieved_at" \
  --arg query "$query" \
  --argjson pages "$(jq 'length' "$pages_file")" \
  --argjson records "$(jq '[.[] | .items[]] | length' "$pages_file")" \
  --argjson total_count "$total_count" \
  --argjson terminal_empty_page "$page" \
  --arg sha "$(shasum -a 256 "$pages_file" | awk '{print $1}')" \
  '{retrieved_at: $retrieved_at, query: $query, pages: $pages, records: $records, total_count: $total_count, terminal_empty_page: $terminal_empty_page, sha256: $sha}' \
  > "$raw_dir/issues-search-metadata.json"

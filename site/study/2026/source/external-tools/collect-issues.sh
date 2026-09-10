#!/usr/bin/env bash
set -euo pipefail

# Fetch every public repository issue, including pull-request-shaped issue
# records. GitHub's issues endpoint is the census source; later normalization
# excludes PR records from the issue population while retaining the page count.
root_dir="$(cd "$(dirname "$0")/.." && pwd)"
raw_dir="$root_dir/external-raw"
mkdir -p "$raw_dir"

retrieved_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
query='/repos/counterfact/api-simulator/issues?state=all&sort=created&direction=asc&per_page=100'

# GitHub returned cursor-style Link headers for this endpoint but gh 2.81 did
# not follow them here. Explicit numbered pages preserve the full traversal and
# let us record the observed terminal empty page rather than assuming success
# means completeness.
pages_file="$raw_dir/issues-pages.json"
printf '[]' > "$pages_file"
page=1
while :; do
  temporary="$raw_dir/.issues-page-$page.json"
  gh api "${query}&page=${page}" > "$temporary"
  count="$(jq 'length' "$temporary")"
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
  --argjson pages "$(jq 'length' "$raw_dir/issues-pages.json")" \
  --argjson records "$(jq '[.[][]] | length' "$raw_dir/issues-pages.json")" \
  --arg sha "$(shasum -a 256 "$raw_dir/issues-pages.json" | awk '{print $1}')" \
  --argjson terminal_empty_page "$page" \
  '{retrieved_at: $retrieved_at, query: $query, pages: $pages, records: $records, terminal_empty_page: $terminal_empty_page, sha256: $sha}' \
  > "$raw_dir/issues-metadata.json"

# The issue response already contains each body. Fetch all comments for every
# actual issue that advertises comments; PR comments belong to the PR census.
jq -r '.[][] | select(.pull_request == null and .comments > 0) | .number' \
  "$raw_dir/issues-pages.json" > "$raw_dir/issues-with-comments.txt"

comment_pages="$raw_dir/issue-comments-pages.json"
if [ ! -f "$comment_pages" ]; then
  printf '{}' > "$comment_pages"
fi
while IFS= read -r issue_number; do
  if jq -e --arg number "$issue_number" 'has($number)' "$comment_pages" > /dev/null; then
    continue
  fi
  temporary="$raw_dir/.issue-$issue_number-comments.json"
  for attempt in 1 2 3; do
    if gh api --paginate --slurp \
      "/repos/counterfact/api-simulator/issues/$issue_number/comments?per_page=100" \
      > "$temporary"; then
      break
    fi
    if [ "$attempt" -eq 3 ]; then
      exit 1
    fi
    sleep "$attempt"
  done
  jq --arg number "$issue_number" --slurpfile pages "$temporary" \
    '. + {($number): $pages[0]}' "$comment_pages" > "$comment_pages.next"
  mv "$comment_pages.next" "$comment_pages"
  rm "$temporary"
done < "$raw_dir/issues-with-comments.txt"

jq -n \
  --arg retrieved_at "$retrieved_at" \
  --argjson issues "$(wc -l < "$raw_dir/issues-with-comments.txt" | tr -d ' ')" \
  --argjson pages "$(jq '[.[] | length] | add' "$comment_pages")" \
  --argjson comments "$(jq '[.[][]] | length' "$comment_pages")" \
  --arg sha "$(shasum -a 256 "$comment_pages" | awk '{print $1}')" \
  '{retrieved_at: $retrieved_at, issues_with_comments: $issues, pages: $pages, comments: $comments, sha256: $sha}' \
  > "$raw_dir/issue-comments-metadata.json"

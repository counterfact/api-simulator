#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "$0")/.." && pwd)"
raw_dir="$root_dir/external-raw"
mkdir -p "$raw_dir"
retrieved_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
source_file="$raw_dir/issues-search-pages.json"
numbers_file="$raw_dir/relevant-issue-numbers.txt"

# Preserve comments for external reports in the observation window and for
# earlier external reports that were not closed before the window opened.
jq -r '[.[] | .items[]]
  | .[]
  | select(.comments > 0)
  | select(.user.type == "User")
  | select(.author_association != "MEMBER" and .author_association != "COLLABORATOR")
  | select(.created_at < "2026-09-04T00:00:00Z")
  | select(.created_at >= "2024-09-01T00:00:00Z" or .closed_at == null or .closed_at >= "2024-09-01T00:00:00Z")
  | .number' "$source_file" > "$numbers_file"

pages_file="$raw_dir/relevant-issue-comments-pages.json"
printf '{}' > "$pages_file"
while IFS= read -r issue_number; do
  temporary="$raw_dir/.relevant-$issue_number-comments.json"
  gh api --paginate --slurp \
    "/repos/counterfact/api-simulator/issues/$issue_number/comments?per_page=100" \
    > "$temporary"
  jq --arg number "$issue_number" --slurpfile pages "$temporary" \
    '. + {($number): $pages[0]}' "$pages_file" > "$pages_file.next"
  mv "$pages_file.next" "$pages_file"
  rm "$temporary"
done < "$numbers_file"

jq -n \
  --arg retrieved_at "$retrieved_at" \
  --argjson issues "$(wc -l < "$numbers_file" | tr -d ' ')" \
  --argjson comments "$(jq '[.[][]] | length' "$pages_file")" \
  --arg sha "$(shasum -a 256 "$pages_file" | awk '{print $1}')" \
  '{retrieved_at: $retrieved_at, issues: $issues, comments: $comments, sha256: $sha}' \
  > "$raw_dir/relevant-issue-comments-metadata.json"

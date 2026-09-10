#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "$0")/.." && pwd)"
raw_dir="$root_dir/external-raw"
review="$root_dir/external-tools/internal-issue-review.json"
out="$raw_dir/internal-candidate-comments-pages.json"
numbers="$raw_dir/internal-candidate-issue-numbers.txt"

jq -r '.records[] | select(.disposition | test("product_behavior_candidate")) | .number' "$review" > "$numbers"
printf '{}' > "$out"
while IFS= read -r issue_number; do
  temporary="$raw_dir/.internal-$issue_number-comments.json"
  gh api --paginate --slurp \
    "/repos/counterfact/api-simulator/issues/$issue_number/comments?per_page=100" \
    > "$temporary"
  jq --arg number "$issue_number" --slurpfile pages "$temporary" \
    '. + {($number): $pages[0]}' "$out" > "$out.next"
  mv "$out.next" "$out"
  rm "$temporary"
done < "$numbers"
jq -n \
  --arg retrieved_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson issues "$(wc -l < "$numbers" | tr -d ' ')" \
  --argjson comments "$(jq '[.[][]] | length' "$out")" \
  --arg sha "$(shasum -a 256 "$out" | awk '{print $1}')" \
  '{retrieved_at: $retrieved_at, issues: $issues, comments: $comments, sha256: $sha}' \
  > "$raw_dir/internal-candidate-comments-metadata.json"

#!/bin/sh
set -eu
mkdir -p site/study/2026/source/internal-tools/pr-details
while IFS= read -r number; do
  gh api "repos/counterfact/api-simulator/pulls/${number}/comments?per_page=100" > "site/study/2026/source/internal-tools/pr-details/${number}-review-comments.json"
  gh api "repos/counterfact/api-simulator/pulls/${number}/reviews?per_page=100" > "site/study/2026/source/internal-tools/pr-details/${number}-reviews.json"
  gh api "repos/counterfact/api-simulator/issues/${number}/comments?per_page=100" > "site/study/2026/source/internal-tools/pr-details/${number}-issue-comments.json"
  gh api "repos/counterfact/api-simulator/pulls/${number}/files?per_page=100" > "site/study/2026/source/internal-tools/pr-details/${number}-files.json"
done < site/study/2026/source/internal-tools/candidate-pr-numbers.txt
shasum -a 256 site/study/2026/source/internal-tools/pr-details/* > site/study/2026/source/internal-tools/pr-details.sha256

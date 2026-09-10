import { readFile, writeFile } from 'node:fs/promises';

const sourceRoot = new URL('..', import.meta.url);
const pages = JSON.parse(await readFile(new URL('external-raw/issues-search-pages.json', sourceRoot), 'utf8'));
const internal = JSON.parse(await readFile(new URL('internal.json', sourceRoot), 'utf8'));
const comments = JSON.parse(await readFile(new URL('external-raw/internal-candidate-comments-pages.json', sourceRoot), 'utf8'));
const start = '2024-09-01T00:00:00Z';
const end = '2026-09-04T00:00:00Z';
const issueRecords = pages.flatMap(page => page.items);
const prNumbers = new Set(internal.screening_ledger?.map(record => record.number) ?? []);
const productTitle = /^(bug:|.*\b(is broken|crash(?:es|ed)?|fails?|wrong|ignored|not working|does not work|error attempting|type errors|invalid .* returns)\b)/i;
const inScope = issue => issue.created_at >= start && issue.created_at < end;
const carryIn = issue => issue.created_at < start && (issue.closed_at === null || issue.closed_at >= start);
const externalHuman = issue => issue.user?.type === 'User' && issue.author_association !== 'MEMBER' && issue.author_association !== 'COLLABORATOR';
const candidates = issueRecords
  .filter(issue => !externalHuman(issue) && (inScope(issue) || carryIn(issue)))
  .filter(issue => productTitle.test(issue.title));
const earliestCandidateByTitle = new Map();
for (const issue of [...candidates].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
  const key = issue.title.toLowerCase();
  if (!earliestCandidateByTitle.has(key)) earliestCandidateByTitle.set(key, issue.number);
}

const records = issueRecords
  .filter(issue => !externalHuman(issue) && (inScope(issue) || carryIn(issue)))
  .map(issue => {
    const productCandidate = productTitle.test(issue.title);
    const automated = issue.user?.type === 'Bot';
    const duplicatePr = prNumbers.has(issue.number);
    const canonicalNumber = productCandidate ? earliestCandidateByTitle.get(issue.title.toLowerCase()) : null;
    let disposition;
    let reason;
    if (productCandidate && canonicalNumber !== issue.number) {
      disposition = 'duplicate_to_earlier_internal_issue_candidate';
      reason = `Same title as earlier internal issue #${canonicalNumber}; retained as a duplicate candidate rather than counted as an independent defect.`;
    } else if (duplicatePr) {
      disposition = 'possible_duplicate_to_screened_pr';
      reason = 'The same number appears in the PR screen; the PR record is the repair/change evidence and this issue remains a discovery record.';
    } else if (productCandidate && automated) {
      disposition = 'automated_or_agent_product_behavior_candidate';
      reason = 'The issue body/title describes faulty behavior and was created by an automation account; attribution is automation, not inferred human discovery.';
    } else if (productCandidate) {
      disposition = 'internal_human_product_behavior_candidate_discovery_unknown';
      reason = 'The body/title describes faulty behavior, but member authorship alone does not establish whether discovery was human, automated, or agent-assisted.';
    } else {
      disposition = automated ? 'automated_or_agent_nondefect_or_process_record' : 'internal_issue_not_independently_confirmed_in_bounded_review';
      reason = 'The available title and body do not independently establish faulty shipped product behavior in this bounded review; it remains retained rather than silently excluded from source.';
    }
    return {
      id: `github-issue-${issue.number}`,
      number: issue.number,
      url: issue.html_url,
      title: issue.title,
      createdAt: issue.created_at,
      reporter: issue.user?.login ?? null,
      reporterType: issue.user?.type ?? null,
      reporterAssociation: issue.author_association ?? null,
      bodyPresent: issue.body !== null,
      advertisedCommentCount: issue.comments,
      commentEvidenceStatus: productCandidate
        ? 'retrieved_for_candidate_no_substantive_comment_text'
        : issue.comments > 0 ? 'not_retrieved_in_bounded_internal-issue-pass' : 'no_comments_advertised',
      commentsSnapshot: productCandidate ? {
        file: 'external-raw/internal-candidate-comments-pages.json',
        count: (comments[String(issue.number)] ?? []).flat().length,
      } : null,
      inObservationWindow: inScope(issue),
      carryInCandidate: carryIn(issue),
      disposition,
      reason,
      releaseStatus: 'unknown',
      firstAffectedPublishedAt: null,
      fixedPublishedAt: null,
      chronologyConfidence: 'unresolved',
    };
  });
const counts = records.reduce((result, record) => {
  result.screened += 1;
  result.byDisposition[record.disposition] = (result.byDisposition[record.disposition] ?? 0) + 1;
  return result;
}, { screened: 0, byDisposition: {} });
await writeFile(
  new URL('external-tools/internal-issue-review.json', sourceRoot),
  `${JSON.stringify({
    schemaVersion: 1,
    source: 'external-raw/issues-search-pages.json',
    observationWindow: { startInclusive: start, endExclusive: end },
    limitation: 'This bounded partition retains every non-external actual issue in scope. Search preserves bodies. Comments were retrieved for title-screened product candidates; comments for the remaining partition remain explicit source gaps.',
    counts,
    records,
  }, null, 2)}\n`,
);

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = '/private/tmp/counterfact-quality-case-study-raw-internal';
const compactRoot = 'site/study/2026/source/internal-tools';
const intervalStart = '2024-09-01T00:00:00Z';
const intervalEnd = '2026-09-04T00:00:00Z';
const retrievedAt = '2026-09-09T13:48:00Z';
const selected = new Set([2365, 2362, 2335, 2316, 2266, 2263, 2260, 2258, 2252, 2250, 2102, 1972, 1970, 1935, 1920, 1804, 1795, 1740, 1684, 1683, 1682, 1665, 1651, 1624, 1622, 1621, 1620, 1614, 1612, 1609, 1591, 1581, 1571, 1569, 1567, 1540, 1524, 1516, 1507, 1470, 1395, 1389, 1386, 1384, 1296, 1240, 1161, 1139, 1099, 1081, 1074, 1062, 1060]);
const confirmed = new Map([
  [2365, 'OpenAPI watch input classification and overlay hot reload were repaired.'],
  [2266, 'Wide-route random-response typing was repaired.'],
  [2263, 'A missing closing brace in app startup code was repaired.'],
  [1972, 'Path-item-level parameters were missing from generated types and runtime handling.'],
  [1970, 'Schema-typed OpenAPI parameters were incorrectly handled at runtime.'],
  [1935, 'Object query parameters were not exploded under the OpenAPI default.'],
  [1920, 'Invalid context syntax/imports could crash startup.'],
  [1795, 'A response with no body produced a type error.'],
  [1740, 'JSON-to-XML text content did not escape XML special characters.'],
  [1684, 'Tools.accepts failed when Accept-header comma items had leading spaces.'],
  [1683, 'Tools.accepts performed case-sensitive Accept-header lookup.'],
  [1682, 'Dispatcher proxy always threw when a request body was present.'],
  [1624, 'A route-file syntax error crashed the server.'],
  [1622, 'Reserved-word operation IDs produced TypeScript syntax errors.'],
  [1621, 'Response content with no schema caused a TypeError.'],
  [1620, 'Routes containing colons produced an invalid import path.'],
  [1614, 'Deleting a route file could crash Counterfact.'],
  [1612, 'Access-Control-Allow-Methods did not reflect registered route methods.'],
  [1609, 'RawHttpClient omitted JSON Content-Type for object request bodies.'],
  [1591, 'REPL tab completion was broken by a custom completer.'],
  [1569, 'Content-type matching used an incorrect key rule.'],
  [1567, 'Middleware behavior was broken.'],
  [1540, 'A path with no registered method did not return the intended HTTP 405.'],
  [1524, 'Root middleware was not executed for routes.'],
  [1516, 'Unsanitized operation IDs broke generated type output.'],
  [1507, 'Required-property type generation was incorrect.'],
  [1395, 'Proxy headers were mangled.'],
  [1389, 'Proxying to SSL did not work.'],
  [1386, 'A Windows path containing a colon failed.'],
  [1384, 'Proxying GET requests failed.'],
  [1161, 'The header type declaration was incorrect.'],
  [1099, '$ref was not consistently followed.'],
  [1074, 'Directories with multiple wildcard children were unsupported.'],
  [1062, 'index.ts was not mapped to the root route.'],
  [1060, 'A root-level consumes declaration did not supply the request-body type.'],
]);
const parse = async p => JSON.parse(await readFile(p, 'utf8'));
const normalize = s => (s ?? '').replaceAll(/\r\n?/g, '\n').replaceAll('\u0000', '');
const inInterval = p => (p.created_at >= intervalStart && p.created_at < intervalEnd) || (p.merged_at && p.merged_at >= intervalStart && p.merged_at < intervalEnd);
const isDependency = p => /(?:^|[(: ])(?:deps?|dependency|renovate)\b/i.test(`${p.title}\n${p.body ?? ''}`) || /renovate\[bot\]/i.test(p.user?.login ?? '');
const isRelease = p => /^Version Packages$/i.test(p.title) || /changesets release/i.test(p.body ?? '');
const compactPR = p => ({ number:p.number, url:p.html_url, title:p.title, created_at:p.created_at, closed_at:p.closed_at, merged_at:p.merged_at, state:p.state, author:p.user?.login ?? null, body:normalize(p.body), base_sha:p.base?.sha ?? null, head_sha:p.head?.sha ?? null });
const all = await parse(`${root}/pulls-all.json`);
const interval = all.filter(inInterval);
const detail = {};
for (const n of selected) {
  const maybe = async suffix => { try { return await parse(`${root}/pr-details/${n}-${suffix}.json`); } catch { return []; } };
  const [issueComments, reviews, reviewComments, files] = await Promise.all([maybe('issue-comments'), maybe('reviews'), maybe('review-comments'), maybe('files')]);
  detail[n] = {
    issue_comments: issueComments.map(x => ({url:x.html_url, created_at:x.created_at, author:x.user?.login ?? null, body:normalize(x.body)})),
    reviews: reviews.map(x => ({id:x.id, url:x.html_url, submitted_at:x.submitted_at, state:x.state, author:x.user?.login ?? null, body:normalize(x.body)})),
    review_comments: reviewComments.map(x => ({url:x.html_url, created_at:x.created_at, author:x.user?.login ?? null, path:x.path, body:normalize(x.body)})),
    files: files.map(x => ({filename:x.filename,status:x.status,additions:x.additions,deletions:x.deletions,changes:x.changes,patch:normalize(x.patch)})),
  };
}
const screen = interval.map(p => {
  const base = {pr:p.number, url:p.html_url, created_at:p.created_at, merged_at:p.merged_at, title:p.title};
  if (isDependency(p)) return {...base, disposition:'excluded_dependency_or_upstream_remediation', rationale:'Normalized title/body or Renovate identity identifies a dependency update; it is not counted as a Counterfact product-defect report.'};
  if (isRelease(p)) return {...base, disposition:'excluded_release_administration', rationale:'Changesets release administration is not a discovered faulty product behavior.'};
  if (selected.has(p.number)) return {...base, disposition:confirmed.has(p.number) ? 'detailed_confirmed_faulty_behavior' : 'detailed_not_confirmed_or_pre_release', rationale:confirmed.has(p.number) ? 'Detailed PR body and changed-file metadata state a concrete faulty behavior and repair.' : 'Detailed evidence did not establish an already-released product defect; retained as pre-release/process/uncertain.'};
  return {...base, disposition:'not_confirmed_after_normalized_body_screen', rationale:'Title and normalized body were screened. This record was not selected for detail because it contains no direct concrete statement of observed Counterfact faulty behavior after dependency and release exclusions. This is a rule-screened disposition, not a claim of individual manual adjudication.'};
});
const mainline = (await readFile(`${compactRoot}/mainline-commits-interval.tsv`, 'utf8')).trim().split('\n').filter(Boolean).map(line => { const [sha,date,subject] = line.split('\t'); const linked = /(?:#|pull request #)(\d+)/i.test(subject); return {sha,date,subject,disposition: linked || /deps?\)/i.test(subject) ? 'not_issue_less_product_repair' : 'unresolved_direct_mainline_candidate', rationale:linked ? 'Subject identifies a PR; handled through the PR census.' : 'No linked PR/issue in subject; no direct product-repair confirmation from subject alone.'}; });
const sourceRecords = interval.filter(p => selected.has(p.number)).map(p => ({...compactPR(p), detail:detail[p.number]}));
const findings = sourceRecords.filter(p => confirmed.has(p.number)).map(p => ({
  defect_id:`pr-${p.number}`, status:'confirmed_faulty_behavior', behavior:confirmed.get(p.number), finding_pr:p.number, finding_url:p.url,
  discovery_channel:'unknown', discovery_rationale:'The public PR supplies repair evidence but does not identify who discovered the behavior. PR author/reviewer identity is deliberately not used as discovery evidence.',
  release_status:'unknown', release_rationale:'Merge is not a published correction. Publication requires delivery-census release/workflow evidence.',
  chronology_confidence:'repair_chronology_high_origin_unknown', origin:'unknown; this PR demonstrates repair, not introduction', deduplication_key:`behavior-repair-pr-${p.number}`, linked_issue_numbers:(normalize(p.body).match(/#\d+/g) ?? []).map(x => Number(x.slice(1))),
  source_pr:p,
}));
const hashes = Object.fromEntries(await Promise.all([['pulls-all.json',`${root}/pulls-all.json`],['mainline-commits-interval.tsv',`${compactRoot}/mainline-commits-interval.tsv`],['pr-details.sha256',`${compactRoot}/pr-details.sha256`]].map(async ([name,path]) => [name,createHash('sha256').update(await readFile(path)).digest('hex')])));
const output = {schema_version:1, scope:'internal PR and direct-mainline evidence only', observation_interval:{start:intervalStart,end_exclusive:intervalEnd}, observation_ref:'77f0bc6fd2c3bc935d2eb2da80190369d91f7084', retrieval:{retrieved_at:retrievedAt, repository:'counterfact/api-simulator', endpoint:'GET /repos/counterfact/api-simulator/pulls?state=all&per_page=100 (paginated)', all_state_pr_count:all.length, interval_opened_or_merged_count:interval.length, source_hashes:hashes, external_issue_snapshot_consumed:'../external-raw/issues-pages.json'}, methods:{normalization:'CRLF normalized to LF; NUL stripped; public API records contain no credentials.', screen:'Every interval PR has a ledger disposition. The non-candidate disposition is a normalized-title/body rule screen and is explicitly not manual adjudication.', release:'Unknown unless separately linked to a delivery-census publication record; fixing-PR merge date is not used as release evidence.', discovery:'Unknown unless public text explicitly attributes discovery; author identity alone is not evidence.'}, screening_ledger:screen, detailed_source_records:sourceRecords, confirmed_findings:findings, direct_mainline_screen:mainline, unresolved:[...sourceRecords.filter(p => !confirmed.has(p.number)).map(p => ({pr:p.number,reason:'Detailed candidate retained without enough public evidence for confirmed faulty behavior, or likely pre-release/process work.'})),...mainline.filter(x => x.disposition === 'unresolved_direct_mainline_candidate')], counts:{confirmed_findings:findings.length,detailed_candidates:sourceRecords.length,screened_prs:screen.length}};
await writeFile('site/study/2026/source/internal.json', `${JSON.stringify(output,null,2)}\n`);

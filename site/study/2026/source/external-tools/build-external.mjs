import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const sourceRoot = new URL('..', import.meta.url);
const readJson = async relative =>
  JSON.parse(await readFile(new URL(relative, sourceRoot), 'utf8'));

const [searchPages, searchMetadata, relevantComments, commentsMetadata, evidence, npm] =
  await Promise.all([
    readJson('external-raw/issues-search-pages.json'),
    readJson('external-raw/issues-search-metadata.json'),
    readJson('external-raw/relevant-issue-comments-pages.json'),
    readJson('external-raw/relevant-issue-comments-metadata.json'),
    readJson('../../../src/data/quality-audit-evidence.json'),
    readJson('delivery-tools/npm-counterfact.json'),
  ]);

const observationStart = '2024-09-01T00:00:00Z';
const observationEnd = '2026-09-04T00:00:00Z';
const cases = new Map(
  evidence.productCases
    .map(record => [record.issue, record]),
);
const adjudications = new Map([
  [1056, ['confirmed_product_behavior_release_status_unknown', 'The issue body reports version 1.0.1 and PR #1062 explicitly repairs it, but the available exact-file affected bound is release 1.0.2, published after the report. Released-at-report status remains unresolved.']],
  [1057, ['excluded_documentation_or_product_direction', 'The report exposed outdated quick-start documentation and option confusion; it is not counted as faulty shipped product behavior.']],
  [1058, ['confirmed_product_behavior_release_status_unknown', 'Maintainer acknowledged the malformed local viewer URL and committed to fix it; no first public correction release was demonstrated here.']],
  [1083, ['confirmed_product_behavior_release_status_unknown', 'Maintainer accepted the swagger-cli escaped-path compatibility failure and later stated it was fixed in 1.1.7; the affected-release bound is unresolved.']],
  [1086, ['excluded_supported_workaround_or_enhancement', 'Discussion established a working require.resolve-based workaround and considered a future JSON-loading utility; it does not demonstrate a faulty shipped behavior.']],
  [1105, ['confirmed_product_behavior_release_status_unknown', 'The report demonstrates failed resolution of an operation-level referenced parameter. Issue #1971 concerns inline path-item parameters, a different root cause; the two reports are not deduplicated. Release and correction chronology remain unresolved.']],
  [1170, ['excluded_feature_request', 'The historical candidate ledger classifies this as a request for a new global default-header capability.']],
  [1185, ['excluded_feature_request', 'The historical candidate ledger classifies this as an explicit json-schema-faker feature request.']],
  [920, ['excluded_feature_request', 'The report requests an official Docker image and configurable cache path; its body describes desired deployment capabilities rather than a demonstrated defect.']],
  [1356, ['excluded_invalid_input', 'The historical candidate ledger records invalid OpenAPI input and reporter self-closure without a product fix.']],
  [1424, ['excluded_unsupported_multi_run_output_collision', 'Comments establish that multiple separate Counterfact runs targeted one output directory; this is not a demonstrated defect in one supported generation run.']],
  [2348, ['process_incident', 'The historical candidate ledger identifies a release-provenance incident rather than faulty product behavior.']],
]);
const customChronology = new Map([
  [1056, {
    firstAffectedRelease: '1.0.2',
    firstAffectedPublishedAt: '2024-10-02T18:10:53.202Z',
    fixedRelease: '1.1.0',
    fixedPublishedAt: '2024-10-03T01:15:53.274Z',
    chronologyConfidence: 'high',
  }],
]);
const records = searchPages.flatMap(page => page.items);

const isExternalHuman = issue =>
  issue.user?.type === 'User' &&
  issue.author_association !== 'MEMBER' &&
  issue.author_association !== 'COLLABORATOR';
const isInScope = issue =>
  issue.created_at >= observationStart && issue.created_at < observationEnd;
const isCarryInCandidate = issue =>
  issue.created_at < observationStart &&
  (issue.closed_at === null || issue.closed_at >= observationStart);

const normalized = records.map(issue => {
  const externalHuman = isExternalHuman(issue);
  const inScope = isInScope(issue);
  const carryInCandidate = isCarryInCandidate(issue);
  const productCase = cases.get(issue.number);
  const isStudyPopulation = externalHuman && (inScope || carryInCandidate);
  let disposition;
  let dispositionReason;
  if (!externalHuman) {
    disposition = issue.user?.type === 'Bot'
      ? 'excluded_automated_or_bot_record'
      : 'excluded_internal_or_collaborator_record';
    dispositionReason = 'The reporter is not an external human under the census rule.';
  } else if (!inScope && !carryInCandidate) {
    disposition = 'excluded_pre_window_closed_record';
    dispositionReason = 'The report was closed before the observation interval opened.';
  } else if (productCase) {
    disposition = 'confirmed_released_defect';
    dispositionReason = 'The fixed experiment population and historical evidence identify this as a product defect with a published affected release.';
  } else if (isStudyPopulation && adjudications.has(issue.number)) {
    [disposition, dispositionReason] = adjudications.get(issue.number);
  } else if (isStudyPopulation) {
    disposition = 'external_report_unresolved_adjudication';
    dispositionReason = 'The public report is retained, but this bounded source pass did not demonstrate an affected published release and a correction chronology.';
  } else {
    disposition = 'excluded_after_observation_window';
    dispositionReason = 'The report was created after the observation interval.';
  }
  const custom = customChronology.get(issue.number);
  const fixedRelease = productCase?.fixedRelease ?? custom?.fixedRelease ?? null;
  const fixedPublishedAt = productCase
    ? (fixedRelease ? (npm.time[fixedRelease] ?? null) : null)
    : custom?.fixedPublishedAt ?? null;
  const comments = relevantComments[String(issue.number)] ?? null;
  return {
    id: `github-issue-${issue.number}`,
    source: {
      provider: 'github-rest-search-issues',
      immutableId: issue.node_id,
      number: issue.number,
      url: issue.html_url,
      retrievedFrom: 'external-raw/issues-search-pages.json',
      bodyPresent: issue.body !== null,
      commentsSnapshot: comments === null ? null : {
        file: 'external-raw/relevant-issue-comments-pages.json',
        count: comments.flat().length,
      },
    },
    report: {
      title: issue.title,
      createdAt: issue.created_at,
      closedAt: issue.closed_at,
      state: issue.state,
      reporter: issue.user?.login ?? null,
      reporterAssociation: issue.author_association ?? null,
      reporterType: issue.user?.type ?? null,
    },
    screening: {
      externalHuman,
      inObservationWindow: inScope,
      carryInCandidate,
      disposition,
      dispositionReason,
    },
    classification: {
      discoveryChannel: productCase || custom ? 'external_human' : externalHuman ? 'external_human_unadjudicated' : 'not_external_human',
      productBehavior: productCase || custom || disposition.startsWith('confirmed_product_behavior') ? 'confirmed_faulty_product_behavior' : disposition === 'process_incident' ? 'process_incident' : 'unresolved',
      releaseStatusAtReport: productCase ? 'already_released' : 'unknown',
      chronologyConfidence: productCase?.chronologyConfidence?.toLowerCase() ?? custom?.chronologyConfidence ?? 'unresolved',
      originClassification: productCase || custom ? 'earliest_confirmed_affected_release_bound' : 'unresolved',
    },
    chronology: {
      canonicalDefectId: null,
      canonicalFirstReportedAt: null,
      firstAffectedRelease: productCase?.firstAffectedRelease ?? custom?.firstAffectedRelease ?? null,
      firstAffectedPublishedAt: productCase?.firstAffectedPublishedAt ?? custom?.firstAffectedPublishedAt ?? null,
      fixedRelease,
      fixedPublishedAt,
      correctionFirstPubliclyReleased: fixedPublishedAt !== null,
      sourceGapStatus: issue.number === 1056
        ? 'reported_version_not_yet_exact_file_verified'
        : productCase || custom
        ? fixedPublishedAt === null ? 'missing_npm_publication_timestamp' : 'none'
        : disposition.startsWith('confirmed_product_behavior') ? 'affected_and_correction_release_chronology_unresolved'
        : isStudyPopulation ? 'release_and_fix_chronology_unresolved' : 'not_applicable',
    },
  };
});

const counts = normalized.reduce((accumulator, record) => {
  accumulator.screened += 1;
  accumulator.byDisposition[record.screening.disposition] =
    (accumulator.byDisposition[record.screening.disposition] ?? 0) + 1;
  if (record.screening.externalHuman && (record.screening.inObservationWindow || record.screening.carryInCandidate)) {
    accumulator.externalHumanStudyPopulation += 1;
  }
  if (record.screening.disposition === 'confirmed_released_defect') {
    accumulator.confirmedReleasedDefects += 1;
  }
  return accumulator;
}, { screened: 0, externalHumanStudyPopulation: 0, confirmedReleasedDefects: 0, byDisposition: {} });

const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  observationWindow: { startInclusive: observationStart, endExclusive: observationEnd },
  sourceMetadata: {
    issueSearch: searchMetadata,
    relevantComments: commentsMetadata,
    endpointCrossCheck: {
      endpointFile: 'external-raw/issues-pages.json',
      status: 'discrepant_not_authoritative_for_actual_issue_completeness',
      detail: 'The explicit issues-endpoint traversal returned 237 actual issues, while search returned 395 with total_count 395. Search is used for this normalized actual-issue census.',
    },
  },
  populationRules: {
    actualIssues: 'GitHub search `is:issue` results created before the observation end.',
    externalHuman: 'Reporter is a GitHub User whose association is neither MEMBER nor COLLABORATOR; authorship is not used to infer whether a defect was discovered by automation or an agent.',
    carryIn: 'Earlier external reports are retained only when their public close timestamp is absent or falls on/after the observation start.',
  },
  counts,
  records: normalized,
};
output.sha256 = createHash('sha256').update(JSON.stringify(output)).digest('hex');
await writeFile(new URL('../external.json', import.meta.url), `${JSON.stringify(output, null, 2)}\n`);

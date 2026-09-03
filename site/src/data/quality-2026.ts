export type AuditCategory =
  "2026 regression" | "Defect in a 2026 feature" | "Pre-existing in 2025";

export interface AuditCase {
  issue: number;
  title: string;
  shortTitle: string;
  reporter: string;
  reportedOn: string;
  reportedVersion: string;
  area: "Generator" | "Runtime" | "Packaging";
  category: AuditCategory;
  confidence: "High" | "Medium" | "Low";
  fixPr: number;
  fixedRelease: string;
  fixedOn: string;
  responseDays: number;
  originCommit: string;
  originDate: string;
  firstAffectedRelease: string;
  originSummary: string;
  failure: string;
  finding: string;
  historyEvidence: string;
  releaseEvidence: string;
  nuance?: string;
}

export interface AuditException {
  issue: number;
}

export const auditCases: AuditCase[] = [
  {
    issue: 1506,
    title:
      "Optional properties become required when their nested schemas contain required properties",
    shortTitle: "Nested schemas made optional properties required",
    reporter: "nkincy",
    reportedOn: "February 25, 2026",
    reportedVersion: "Not specified",
    area: "Generator",
    category: "Pre-existing in 2025",
    confidence: "High",
    fixPr: 1507,
    fixedRelease: "2.0.0",
    fixedOn: "February 26, 2026",
    responseDays: 1,
    originCommit: "2af86557341ccdc270fa2387ca05c807bac9d22a",
    originDate: "September 10, 2022",
    firstAffectedRelease: "0.8.0",
    originSummary:
      "The schema encoder began deciding optionality from the child schema’s own required array instead of the parent object’s required list.",
    failure:
      "A property omitted from its parent schema’s required list was emitted without a TypeScript optional marker when that property’s nested object had required children.",
    finding:
      "The responsible condition entered the generator in 2022 and is present in releases well before the 2025 boundary. No 2026 change created the behavior.",
    historyEvidence:
      "Rename-aware history traces the faulty required-property check to the 2022 schema-type encoder implementation. The fix changes that decision to use the parent object’s required list and adds the reporter’s nested-object shape as a test.",
    releaseEvidence:
      "The origin commit is contained in 0.8.0; the accepted fix shipped in 2.0.0 one day after the report.",
  },
  {
    issue: 1515,
    title: "Root middleware is not executed",
    shortTitle: "Root middleware did not run",
    reporter: "vglaeser",
    reportedOn: "March 2, 2026",
    reportedVersion: "1.5.0",
    area: "Runtime",
    category: "Pre-existing in 2025",
    confidence: "High",
    fixPr: 1524,
    fixedRelease: "2.2.0",
    fixedOn: "March 19, 2026",
    responseDays: 17,
    originCommit: "49c4baf08a7543910fc6d97ba92378da75dff3a4",
    originDate: "February 15, 2025",
    firstAffectedRelease: "1.3.0",
    originSummary:
      "A registry change represented the root path as an empty string while root middleware remained registered under a slash.",
    failure:
      "Middleware placed at the route root was skipped, although the same middleware ran when placed under a subroute.",
    finding:
      "The empty-string-versus-slash mismatch was introduced in February 2025 and released in 1.3.0. It remained present through the version named by the reporter.",
    historyEvidence:
      "The reporter’s diagnosis matches the registry history: recursion reached the top-level directory as an empty string, so it never matched middleware stored at '/'. The fix normalizes the lookup and includes a root-level middleware test.",
    releaseEvidence:
      "The faulty commit first appears in 1.3.0. The correction shipped in 2.2.0, 17 calendar days after the report—the only case in the audit that took more than five days to reach a release.",
  },
  {
    issue: 1617,
    title: "Reserved-keyword operationId values generate invalid TypeScript",
    shortTitle: "Reserved operation IDs broke generated TypeScript",
    reporter: "dissemond-bitside",
    reportedOn: "April 2, 2026",
    reportedVersion: "2.4.0",
    area: "Generator",
    category: "Defect in a 2026 feature",
    confidence: "High",
    fixPr: 1622,
    fixedRelease: "2.5.0",
    fixedOn: "April 3, 2026",
    responseDays: 1,
    originCommit: "e0696850a6b666d191f1265d798609aca94ca285",
    originDate: "February 23, 2026",
    firstAffectedRelease: "2.0.0",
    originSummary:
      "The new operationId-based type-export feature used identifiers such as 'delete' verbatim in generated imports and type declarations.",
    failure:
      "An OpenAPI operation whose operationId was a TypeScript reserved word produced source that could not be parsed.",
    finding:
      "The applicable capability—operation-specific exports named from operationId—first shipped in 2026 and contained the defect in its initial release. There was no earlier working version of that feature to regress from.",
    historyEvidence:
      "The failure begins with the operationId export implementation merged through contributor-authored PR #1502. The repair aliases unsafe generated names while preserving the public operation identifier and adds reserved-word coverage.",
    releaseEvidence:
      "The feature and defect first shipped together in 2.0.0. The fix shipped in 2.5.0 the day after the report.",
    nuance:
      "This is the audit’s only bug attributable to code introduced in 2026. Calling it a feature defect is more precise than calling it a regression: the newly introduced behavior never had a working released state. The contribution passed project review, so authorship identifies provenance, not exclusive responsibility.",
  },
  {
    issue: 1618,
    title: "A response without a schema breaks generated type definitions",
    shortTitle: "Schema-less responses broke type generation",
    reporter: "dissemond-bitside",
    reportedOn: "April 2, 2026",
    reportedVersion: "2.4.0",
    area: "Generator",
    category: "Pre-existing in 2025",
    confidence: "High",
    fixPr: 1621,
    fixedRelease: "2.5.0",
    fixedOn: "April 3, 2026",
    responseDays: 1,
    originCommit: "cf49cad1e335f2e7843b904285e4f5d7f72382cb",
    originDate: "October 20, 2022",
    firstAffectedRelease: "0.13.0",
    originSummary:
      "A response-content refactor assumed that every media type supplied a schema and dereferenced the missing value.",
    failure:
      "A valid response content entry with examples but no schema caused the generator to emit only an error comment instead of a useful operation type.",
    finding:
      "The unsafe dereference dates to 2022. In the audit’s year-based taxonomy, this old regression is still pre-existing in 2025.",
    historyEvidence:
      "Source history identifies the 2022 response-type refactor that introduced the unconditional schema access. The fix falls back to unknown and tests generation from content without a schema.",
    releaseEvidence:
      "The faulty implementation appears in 0.13.0; the accepted fix shipped in 2.5.0 one day after the report.",
  },
  {
    issue: 1619,
    title: "Routes containing colons generate incorrect type-import paths",
    shortTitle: "Colon routes produced the wrong import path",
    reporter: "dissemond-bitside",
    reportedOn: "April 2, 2026",
    reportedVersion: "2.4.0",
    area: "Generator",
    category: "Pre-existing in 2025",
    confidence: "High",
    fixPr: 1620,
    fixedRelease: "2.5.0",
    fixedOn: "April 3, 2026",
    responseDays: 1,
    originCommit: "8f0d2d2091ebb3741e66db1a43b251ea4717a6c5",
    originDate: "September 3, 2025",
    firstAffectedRelease: "1.4.5",
    originSummary:
      "A Windows-path compatibility change sanitized the generated filename but did not apply the same transformation to the route file’s type import.",
    failure:
      "For a path such as /stuff:action, the generated type filename used a Unicode ratio character while the import retained a literal colon, leaving the handler argument typed as any.",
    finding:
      "This was a genuine regression, but it occurred in September 2025 rather than 2026.",
    historyEvidence:
      "The introducing change and the later fix are symmetrical: one transformed the output filename; the other made the generated import use the same safe-path function. The fix includes the colon-route reproduction.",
    releaseEvidence:
      "The mismatch first shipped in 1.4.5. It was corrected in 2.5.0 one day after the report.",
  },
  {
    issue: 1842,
    title: "Non-operation Path Item fields cause a generator TypeError",
    shortTitle: "Path Item metadata crashed the generator",
    reporter: "dissemond-bitside",
    reportedOn: "April 13, 2026",
    reportedVersion: "2.7.0",
    area: "Generator",
    category: "Pre-existing in 2025",
    confidence: "High",
    fixPr: 1843,
    fixedRelease: "2.8.1",
    fixedOn: "April 14, 2026",
    responseDays: 1,
    originCommit: "748424dfe5b46e852ec756bbabab1b2315c86479",
    originDate: "July 8, 2022",
    firstAffectedRelease: "0.5.0",
    originSummary:
      "The original path traversal treated every Path Item key as an HTTP operation instead of filtering metadata fields such as summary and description.",
    failure:
      "Standards-defined Path Item metadata was passed into operation generation, producing a TypeError when the generator searched a string for operationId.",
    finding:
      "The loop’s assumption existed from the early generator implementation in 2022 and remained unchanged at the end of 2025.",
    historyEvidence:
      "Historical source shows an unfiltered Object.entries traversal from 2022. The fix limits generation to supported HTTP methods and adds summary, description, servers, and parameters as regression fixtures.",
    releaseEvidence:
      "The responsible traversal is present by 0.5.0. The fix shipped in 2.8.1 the next day.",
  },
  {
    issue: 1933,
    title: "Object-valued query parameters do not use OpenAPI’s exploded form",
    shortTitle: "Exploded object query parameters were not assembled",
    reporter: "dissemond-bitside",
    reportedOn: "April 21, 2026",
    reportedVersion: "2.9.0",
    area: "Runtime",
    category: "Pre-existing in 2025",
    confidence: "High",
    fixPr: 1935,
    fixedRelease: "2.10.0",
    fixedOn: "April 25, 2026",
    responseDays: 4,
    originCommit: "cf377e4a9d45d0e98ab4721ea73852dcdc98340f",
    originDate: "July 17, 2023",
    firstAffectedRelease: "0.26.0",
    originSummary:
      "Runtime query handling exposed only the web framework’s flat query object and never assembled OpenAPI form-exploded object parameters under their declared name.",
    failure:
      "A request such as ?page=0&size=100 did not populate $.query.pageable and, once request validation existed, was rejected as missing the required pageable parameter.",
    finding:
      "Request validation made the mismatch more visible in 2026, but it did not create the underlying deserialization omission. The same exploded input could not have produced the declared object in 2025.",
    historyEvidence:
      "The flat query assignment is present in the 2023 dispatcher conversion and persists through the 2025 boundary. The fix adds OpenAPI style/explode-aware assembly to both validation and handler input.",
    releaseEvidence:
      "The responsible runtime shape is present by 0.26.0. Correct exploded-object support shipped in 2.10.0 four days after the report.",
    nuance:
      "This is the clearest latent-defect case. A new validator changed the symptom from incorrectly shaped handler data to a visible 400 response, but the supported OpenAPI serialization could not be consumed correctly before the validator existed either. Under the audit rules, increased visibility is not a new regression.",
  },
  {
    issue: 1971,
    title: "Path-level parameters are ignored",
    shortTitle: "Path-level parameters were ignored",
    reporter: "dissemond-bitside",
    reportedOn: "April 30, 2026",
    reportedVersion: "2.10.0",
    area: "Generator",
    category: "Pre-existing in 2025",
    confidence: "High",
    fixPr: 1972,
    fixedRelease: "2.11.0",
    fixedOn: "May 5, 2026",
    responseDays: 5,
    originCommit: "193bc9b0a35abd6be199a58a25a5376c64c59dc4",
    originDate: "July 12, 2022",
    firstAffectedRelease: "0.5.0",
    originSummary:
      "Parameter collection read only operation-level arrays and never merged parameters declared on the enclosing Path Item.",
    failure:
      "A path parameter declared once at path level was absent from generated handler types and unavailable to runtime parameter handling.",
    finding:
      "The omission is visible in the earliest parameter-generation implementation from 2022 and remained present through 2025.",
    historyEvidence:
      "Historical source consistently reads operation.parameters without incorporating pathItem.parameters. The fix merges both scopes with the OpenAPI-required operation-level override semantics and covers generator and runtime behavior.",
    releaseEvidence:
      "The omission exists by 0.5.0. The correction shipped in 2.11.0 five days after the report.",
  },
  {
    issue: 2075,
    title: "Published package runs an obsolete patch-package postinstall hook",
    shortTitle: "The package ran an obsolete postinstall hook",
    reporter: "iki",
    reportedOn: "May 15, 2026",
    reportedVersion: "Not specified; 2.11.0 was current",
    area: "Packaging",
    category: "Pre-existing in 2025",
    confidence: "High",
    fixPr: 2076,
    fixedRelease: "2.12.0",
    fixedOn: "May 16, 2026",
    responseDays: 1,
    originCommit: "c4dda369fb51fcfa072a49b5a23dc9143b57c9e8",
    originDate: "April 10, 2024",
    firstAffectedRelease: "0.39.0",
    originSummary:
      "A maintenance change accidentally restored patch-package as a production dependency and postinstall script after the package no longer shipped patches.",
    failure:
      "Installing Counterfact invoked an unnecessary lifecycle script, creating avoidable friction for package managers with strict build-script policies and an unnecessary supply-chain concern.",
    finding:
      "Published package manifests show the hook from 0.39.0 onward, including 2025 releases; no 2026 change introduced it.",
    historyEvidence:
      "Package history traces the reintroduced script to a 2024 lint-maintenance commit. Inspection of published manifests corroborates that affected packages had the hook but no patches directory. The fix removes the dependency, script, and obsolete CI step.",
    releaseEvidence:
      "The hook first shipped in 0.39.0. Its removal reached 2.12.0 one day after the report.",
  },
];

export const auditExceptions: AuditException[] = [{ issue: 2348 }];

export const totalCases = auditCases.length;
export const totalRecords = totalCases + auditExceptions.length;

const categoryDefinitions: Array<{
  label: AuditCategory;
  tone: "neutral" | "feature" | "legacy";
}> = [
  { label: "2026 regression", tone: "neutral" },
  { label: "Defect in a 2026 feature", tone: "feature" },
  { label: "Pre-existing in 2025", tone: "legacy" },
];

export const categoryCounts = categoryDefinitions.map(({ label, tone }) => {
  const count = auditCases.filter((item) => item.category === label).length;

  return {
    label,
    count,
    percent: totalCases === 0 ? 0 : Number(((count / totalCases) * 100).toFixed(1)),
    tone,
  };
});

export const deliveryMetrics = [
  {
    label: "Merged pull requests",
    before: "226",
    after: "625",
    change: "2.8×",
    note: "January 1–September 3, year over year; includes dependency automation.",
  },
  {
    label: "Published releases",
    before: "9",
    after: "28",
    change: "3.1×",
    note: "January 1–September 3, based on npm publication timestamps.",
  },
  {
    label: "Test files",
    before: "35",
    after: "72",
    change: "+106%",
    note: "Static repository count at 1.4.7 and at the September 3 main branch.",
  },
  {
    label: "Explicit test declarations",
    before: "240",
    after: "904",
    change: "+277%",
    note: "Static count of it/test declarations; parameterized cases can execute more tests.",
  },
] as const;

export const featureTimeline = [
  {
    release: "1.5.0",
    date: "January 22",
    title: "An HTTP client inside the REPL",
    detail:
      "Developers could send requests to the simulated API without leaving the interactive session, alongside delay controls for latency testing.",
    href: "https://github.com/counterfact/api-simulator/releases/tag/v1.5.0",
  },
  {
    release: "2.2.0",
    date: "March 19",
    title: "An Admin API and agent skill",
    detail:
      "Counterfact exposed a control surface intended for tooling and coding-agent workflows, while preserving the human-facing REPL.",
    href: "https://github.com/counterfact/api-simulator/releases/tag/v2.2.0",
  },
  {
    release: "2.6.0",
    date: "April 6",
    title: "Request validation and a fluent request builder",
    detail:
      "Incoming requests could be checked against the OpenAPI contract, and route() added typed discovery, construction, autocomplete, and execution inside the REPL.",
    href: "https://github.com/counterfact/api-simulator/releases/tag/v2.6.0",
  },
  {
    release: "2.7.0–2.8.1",
    date: "April 10–14",
    title: "Composable scenarios and startup state",
    detail:
      "Named scenario functions made state transitions reusable; startup scenarios could seed a useful simulated world automatically when the server began.",
    href: "https://github.com/counterfact/api-simulator/releases/tag/v2.8.1",
  },
  {
    release: "2.9.0",
    date: "April 17",
    title: "Multiple APIs in one process",
    detail:
      "ApiRunner isolated generation and runtime state per specification and enabled grouped APIs to share one Counterfact server and REPL.",
    href: "https://github.com/counterfact/api-simulator/releases/tag/v2.9.0",
  },
  {
    release: "2.11.0",
    date: "May 5",
    title: "First-class API versioning",
    detail:
      "Version-aware generated types, derived prefixes, and $.minVersion() let handlers be shared safely across versions of an API.",
    href: "https://github.com/counterfact/api-simulator/releases/tag/v2.11.0",
  },
  {
    release: "2.12.0–2.14.0",
    date: "May 16–30",
    title: "OpenAPI 3.2 and Overlay support",
    detail:
      "QUERY, querystring parameters, streaming and server-sent events expanded protocol coverage; repeatable overlays made it possible to adapt a source document without editing it.",
    href: "https://github.com/counterfact/api-simulator/releases/tag/v2.14.0",
  },
  {
    release: "2.15.0–2.16.2",
    date: "August 1–19",
    title: "A shared store and modular public packages",
    detail:
      "A typed, hot-reload-safe store became available to routes and tooling, while focused OpenAPI, generator, runtime, client, and REPL packages opened Counterfact to embedding and reuse.",
    href: "https://github.com/counterfact/api-simulator/blob/main/packages/counterfact/CHANGELOG.md",
  },
] as const;

export const issueUrl = (issue: number) =>
  `https://github.com/counterfact/api-simulator/issues/${issue}`;

export const prUrl = (pr: number) =>
  `https://github.com/counterfact/api-simulator/pull/${pr}`;

export const commitUrl = (commit: string) =>
  `https://github.com/counterfact/api-simulator/commit/${commit}`;

export const releaseUrl = (version: string) =>
  `https://github.com/counterfact/api-simulator/releases/tag/v${version}`;

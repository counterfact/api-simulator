# Documentation and site changes

Paths and commands below are relative to the repository root.

- Distinguish maintained guides from dated reports before changing drift
  mappings. Keep historical counts, conclusions, and prompts scoped to a dated,
  commit-pinned record; those records should not watch ongoing implementation
  churn. Keep current contracts and contributor guides tied to their relevant
  source, configuration, and tests, and record a review only after checking
  those relationships and the document's claims.

- When tightening a drift threshold, inspect the newly flagged documents and
  their source relationships in the same change. Correct stale guidance and
  record verified reviews for accurate documents; evaluate CI enforcement
  separately from the reminder's sensitivity.

- Write user docs as direct instructions with concrete examples. Introduce OpenAPI with a brief mention of its former name, Swagger, then use “spec” naturally. Prefer “your code” or “a class you write” over “authored behavior.” Explain limitations where they affect the task; avoid repeated disclaimers, abstract process language, and unsupported marketing claims. Choose headings for the subject rather than repeating a fixed template on every guide.

- Keep `catchmydrift.config.json` document-specific: connect each selected document
  to the implementation, configuration, and tests it describes; use package-wide
  groups only for package or product overviews. Navigation and agent-guidance
  documents may relate to their referenced Markdown rather than unrelated code.
  After changing mappings, validate the installed schema, check for unmatched
  patterns or overlapping watches, and audit both missing relevant files and
  unrelated associations. Run `yarn check:drift`; exit 1 requests document review,
  while exit 2 indicates a configuration or operational failure. Never mark
  documents reviewed solely to silence drift or add CI enforcement without
  assessing the existing document-review backlog.
  When watched documents move, retarget their watch rules and related groups,
  compare their contents and related tracked files with the recorded assessment,
  and use the official review command for verified moved documents. Remove only
  their obsolete state keys; a rename alone does not establish a new review.

- `catchmydrift@0.1.0` review state is an unversioned map of watched paths to reachable full commit SHAs. When migrating legacy snapshot records, recover the historical commit that established each record and verify its recorded related-file blobs before retaining that baseline. Do not substitute tokens, blob hashes, or the current HEAD for an unverified review. Run the checker after migration and report outstanding drift separately from state/configuration failures.

- Execute substantial documentation recipes against the exact published version or commit they instruct readers to use. A source package version can match npm while exposing unreleased APIs; verify public method availability and mark source-only recipes with a reproducible checkout setup. Verify externally linked contracts at their pinned URL, and exercise both the failing and repaired steps of typecheck examples.

- Validate copyable handler examples against generated imports and the actual HTTP method's inputs, not only TypeScript syntax. For linked onboarding lessons, make the running-process, project-directory, and contract handoff explicit; an independently runnable command may still fail when followed immediately after the preceding lesson.

- User documentation ships in the npm package as well as the site. Keep the package `files` allowlist and `test/package/fixtures/pack-files.json` aligned with new pages; inspect inventory changes and run the packed-consumer check after adding documentation paths.

- Keep setup and discovery rules in `packages/counterfact/docs/api/cli.md` and preserve the direct OpenAPI quick start. Handler examples should define a local `Route` alias from `Routes` and annotate methods with `Route["GET"]` (or the corresponding method), matching generated route files.

- The documentation has a feature-based manual and a separate API reference. Keep `site/src/data/navigation.json`, the Markdown manual/reference indexes, and the home-page feature count aligned when adding chapters. Reuse canonical Markdown pages rather than duplicating existing guides, preserve published documentation URLs through the site redirect map when retiring redundant Markdown sources, and check rendered anchors as well as page destinations after restructuring.

- When rebuilding documentation navigation, compare removed content with the previous site as well as checking URLs. Preserve privacy disclosures, project resources, task indexes, and externally configured client examples; verify retained guides have incoming links from the new navigation. A successful link check cannot detect removed information or orphaned pages.

- Documentation is also rendered as site pages. Link repository-only examples
  outside the published docs tree through GitHub source URLs, and validate the
  rendered site with `npm run check-links` instead of relying on filesystem paths.
  For examples introduced by an unmerged PR, use a verified commit-pinned source
  URL; a `main` URL returns 404 until merge. Check external example destinations
  separately because the site link checker skips external URLs.

- Astro static-build tests must keep temporary output on the checkout filesystem: Astro stages assets under the working directory and renames them into the output, so system temporary directories on a different volume cause `EXDEV`. Continue using `usingTemporaryFiles()` and restore any temporary-directory environment override in `finally`.

- The Astro site uses `compressHTML: true` to preserve HTML whitespace around inline prose across source line breaks. Keep that setting explicit when upgrading Astro, and run `cd site && npm run test:whitespace` for rendering or formatting changes. Check generated text before applying CSS spacing: punctuation and intentional in-word links must remain adjacent.

- Keep single-line command snippets in a focusable horizontal scroll region, with copy controls outside that region. A scrolling flex item needs `min-width: 0` so long text cannot widen the whole page. Emitted CSS/HTML checks establish this contract; they do not replace browser checks of scrolling, keyboard access, or viewport overflow.

- Documentation pages can be direct entry points. Introduce Counterfact-specific terms before using them, linking to `packages/counterfact/docs/manual/concepts.md` for shared definitions. State example prerequisites before snippets, distinguish generated helpers from authored context methods, and explain group/version/prefix and handler/constructor/scenario argument boundaries consistently. Extend current canonical pages rather than restoring retired guides.

- When reconciling changes across the documentation reorganization, keep the Manual/API chapter structure and retired-page redirects. Move API contracts and migration guidance into the matching `api/` chapter and practical examples into `manual/`; do not restore deleted reference or pattern pages to preserve an older edit.

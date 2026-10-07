import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "astro";
import { parse } from "parse5";
import { usingTemporaryFiles } from "using-temporary-files";

const siteRoot = new URL("../", import.meta.url);

function elements(node, predicate) {
  return [
    ...(predicate(node) ? [node] : []),
    ...(node.childNodes ?? []).flatMap((child) => elements(child, predicate)),
  ];
}

function textContent(node) {
  return node.nodeName === "#text"
    ? node.value
    : (node.childNodes ?? []).map(textContent).join("");
}

function proseText(node) {
  return textContent(node)
    .replace(/[\t\n\r ]+/g, " ")
    .trim();
}

function paragraphs(html) {
  return elements(parse(html), (node) => node.tagName === "p").map(proseText);
}

test("the site build preserves authored inline whitespace", async (t) => {
  await usingTemporaryFiles(async ($) => {
    // Build fixtures with the site's actual config and compiler, without
    // publishing test routes or overriding the whitespace setting under test.
    await build({
      root: siteRoot,
      srcDir: fileURLToPath(
        new URL("test-fixtures/inline-whitespace/", siteRoot),
      ),
      outDir: $.path("fixtures"),
      cacheDir: $.path("fixture-cache"),
      publicDir: $.path("empty-public"),
      logLevel: "silent",
    });

    const fixture = parse(await $.read("fixtures/index.html"));
    const byId = (id) => {
      const matches = elements(fixture, (node) =>
        node.attrs?.some((attr) => attr.name === "id" && attr.value === id),
      );
      assert.equal(matches.length, 1, `fixture #${id} exists`);
      return matches[0];
    };

    await t.test("line breaks separate inline links and components", () => {
      assert.deepEqual(
        ["multiline", "component", "neighbors", "same-line", "explicit"].map(
          (id) => proseText(byId(id)),
        ),
        Array(5).fill("Read the docs for help."),
      );
    });
    await t.test(
      "punctuation and intentional in-word links stay adjacent",
      () => {
        assert.equal(
          proseText(byId("punctuation")),
          "Read (the docs), then try npx counterfact.",
        );
        assert.equal(
          proseText(byId("component-punctuation")),
          "Read (the docs), then try npx counterfact.",
        );
        assert.equal(proseText(byId("joined")), "counterfact");
        assert.equal(textContent(byId("code")), "line one\n  line two\n");
      },
    );
    await t.test(
      "Markdown retains spaces and intentional adjacency",
      async () => {
        assert.deepEqual(
          paragraphs(await $.read("fixtures/markdown/index.html")),
          [
            "Read the docs for help.",
            "Read (the docs), then try npx counterfact.",
            "counterfact",
          ],
        );
      },
    );

    await build({
      root: siteRoot,
      outDir: $.path("site"),
      cacheDir: $.path("site-cache"),
      logLevel: "silent",
    });

    await t.test(
      "the homepage preserves inline links in the quick start",
      async () => {
        const text = paragraphs(await $.read("site/index.html"));
        assert.ok(
          text.includes(
            "Try http://localhost:3100/pet/1 or open Swagger UI. Generated sample responses are a starting point; customize the behavior your frontend needs.",
          ),
        );
        assert.ok(
          text.includes(
            "Use your own OpenAPI document in place of the example URL. For a repeatable project or CI workflow, install a pinned version and commit the lockfile.",
          ),
        );
      },
    );
    await t.test(
      "canonical Markdown docs keep inline code separated",
      async () => {
        assert.ok(
          paragraphs(
            await $.read("site/docs/getting-started/index.html"),
          ).includes(
            "Counterfact writes editable route files and generated TypeScript types to api/, then starts a local server at http://localhost:3100.",
          ),
        );
      },
    );
    await t.test(
      "the quality appendix separates the formerly joined link",
      async () => {
        assert.ok(
          paragraphs(
            await $.read("site/quality/2026/cases/index.html"),
          ).includes(
            "The detailed external-report ledger shows the screening decisions for these cases. The public-record census provides the broader candidate record.",
          ),
        );
      },
    );
  });
});

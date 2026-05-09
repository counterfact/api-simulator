import { defineConfig } from "astro/config";
import { visit } from "unist-util-visit";
import path from "node:path";
import { fileURLToPath } from "node:url";

const docsRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../docs",
);

/**
 * Rehype plugin that rewrites local `.md` hrefs to absolute site URLs so that
 * cross-document links written as `[text](./other.md)` (valid on GitHub)
 * resolve correctly on the published site regardless of trailing-slash
 * behaviour.
 *
 * Because Astro's static output serves every page inside a directory
 * (`getting-started/index.html` → URL `/docs/getting-started/`), a relative
 * link like `./reference` would resolve one level too deep.  Converting to
 * absolute paths avoids this entirely.
 *
 * The vfile path is used to determine the document's directory inside the
 * docs tree, which becomes the resolution base:
 *
 *   docs/getting-started.md  → base /docs
 *   docs/patterns/foo.md     → base /docs/patterns
 *
 * Examples (file: docs/getting-started.md):
 *   ./patterns/index.md  → /docs/patterns
 *   ./reference.md       → /docs/reference
 *   ./faq.md#section     → /docs/faq#section
 *
 * Examples (file: docs/patterns/agentic-sandbox.md):
 *   ./simulate-failures.md → /docs/patterns/simulate-failures
 *   ../reference.md        → /docs/reference
 */
function rehypeStripMdLinks() {
  return (tree, file) => {
    // Determine the URL-space directory for this document so we can resolve
    // relative hrefs into absolute /docs/... paths.
    let docUrlDir = "/docs";
    if (file?.path) {
      const rel = path.relative(docsRoot, file.path);
      if (!rel.startsWith("..")) {
        const dir = path.dirname(rel);
        if (dir !== ".") {
          docUrlDir = `/docs/${dir.split(path.sep).join("/")}`;
        }
      }
    }

    visit(tree, "element", (node) => {
      if (
        node.tagName !== "a" ||
        typeof node.properties?.href !== "string"
      )
        return;

      const href = node.properties.href;

      // Leave absolute URLs, fragment-only, mailto: and tel: links alone.
      if (
        href.includes("://") ||
        href.startsWith("/") ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:")
      )
        return;

      // Only process hrefs that contain a .md extension.
      const match = href.match(/^(.*?)\.md(\?[^#]*)?(#.*)?$/);
      if (!match) return;

      const [, mdBase, query = "", anchor = ""] = match;

      // Resolve the relative .md path to an absolute /docs/... path.
      const absPath = path.posix.resolve(docUrlDir, `${mdBase}.md`);

      // Strip the extension; index files map to their parent directory.
      let cleanUrl;
      if (absPath.endsWith("/index.md")) {
        cleanUrl = absPath.slice(0, -"/index.md".length);
      } else {
        cleanUrl = absPath.slice(0, -".md".length);
      }

      node.properties.href = cleanUrl + query + anchor;
    });
  };
}

// https://astro.build/config
export default defineConfig({
  site: "https://counterfact.dev",
  output: "static",
  markdown: {
    rehypePlugins: [rehypeStripMdLinks],
  },
});

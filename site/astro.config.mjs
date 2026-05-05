import { defineConfig } from "astro/config";
import { visit } from "unist-util-visit";

/**
 * Rehype plugin that rewrites local `.md` hrefs so that cross-document links
 * written as `[text](./other.md)` (valid on GitHub) resolve correctly on the
 * published site.
 *
 * Two cases are handled:
 *  - `./foo/index.md`  → `./foo/`   (index files map to directory URLs)
 *  - `./foo/bar.md`    → `./foo/bar` (regular files just strip the extension)
 *
 * Query strings and anchors are preserved in both cases.
 */
function rehypeStripMdLinks() {
  return (tree) => {
    visit(tree, "element", (node) => {
      if (
        node.tagName === "a" &&
        typeof node.properties?.href === "string" &&
        !node.properties.href.includes("://") &&
        !node.properties.href.startsWith("mailto:") &&
        !node.properties.href.startsWith("tel:")
      ) {
        node.properties.href = node.properties.href.replace(
          /(\/index)?\.md(\?[^#]*)?(#.*)?$/,
          (_, trailingIndex, query, anchor) =>
            `${trailingIndex ? "/" : ""}${query ?? ""}${anchor ?? ""}`,
        );
      }
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

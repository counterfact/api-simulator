import { visit } from "unist-util-visit";

/** Render GitHub's standalone blockquote alert markers without changing prose. */
export default function remarkGithubAlerts() {
  return (tree) => {
    visit(tree, "blockquote", (node) => {
      const paragraph = node.children[0];
      const first = paragraph?.children?.[0];
      if (paragraph?.type !== "paragraph" || first?.type !== "text") return;

      // The marker must occupy the first line; inline mentions stay literal.
      const match = first.value.match(
        /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][\t ]*(?:\r?\n|$)/,
      );
      if (!match) return;

      const type = match[1].toLowerCase();
      first.value = first.value.slice(match[0].length);
      if (!first.value) paragraph.children.shift();
      if (!paragraph.children.length) node.children.shift();

      node.data = {
        ...node.data,
        hName: "div",
        hProperties: {
          className: ["markdown-alert", `markdown-alert-${type}`],
        },
      };
      node.children.unshift({
        type: "paragraph",
        data: { hProperties: { className: ["markdown-alert-title"] } },
        children: [
          { type: "text", value: type[0].toUpperCase() + type.slice(1) },
        ],
      });
    });
  };
}

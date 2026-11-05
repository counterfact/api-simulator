import evidence from "../../../data/quality-audit-evidence-v3.json";

export const prerender = true;

export function GET() {
  return new Response(`${JSON.stringify(evidence, null, 2)}\n`, {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

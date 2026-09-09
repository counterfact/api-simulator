import { auditEvidence } from "../../../data/quality-2026";

export const prerender = true;

export function GET() {
  return new Response(`${JSON.stringify(auditEvidence, null, 2)}\n`, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

import type { NextRequest } from "next/server";
import { lookupCertificate, requestAddress } from "@/lib/cert-register";

// The website's question to the register (plan part 10.4; D20 option A): POST the number AND the code →
// { valid: false } or { valid: true, … Реш. 56's data } — never the code, never which part was wrong; the
// same limit as the portal's page. Open to the website's address only (ptsbg.eu).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["https://ptsbg.eu", "https://www.ptsbg.eu"]);
const cors = (origin: string | null): Record<string, string> => (origin && ALLOWED.has(origin)
  ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin" }
  : { Vary: "Origin" });

export function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: cors(req.headers.get("origin")) });
}

export async function POST(req: NextRequest) {
  const headers = { ...cors(req.headers.get("origin")), "Cache-Control": "no-store" };
  // JSON only (a text/plain POST from any page needs no preflight — 10.4 review), and small
  if (!/^application\/json\b/i.test(req.headers.get("content-type") ?? "")) return Response.json({ valid: false, error: "application/json only" }, { status: 415, headers });
  const raw = await req.text().catch(() => "");
  if (raw.length > 1024) return Response.json({ valid: false, error: "too large" }, { status: 413, headers });
  let body: { number?: unknown; code?: unknown } = {};
  try { body = JSON.parse(raw); } catch { /* a broken body is an incomplete query */ }
  const r = await lookupCertificate({ number: body?.number, code: body?.code }, requestAddress(req.headers));
  if (r.state === "valid") return Response.json(r.answer, { headers });
  if (r.state === "limited") return Response.json({ valid: false, limited: true }, { status: 429, headers });
  if (r.state === "failed") return Response.json({ valid: false, error: "unavailable" }, { status: 503, headers });
  return Response.json({ valid: false }, { headers });
}

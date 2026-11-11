import { latestPublication } from "@/lib/website-feed";
import { listStartedSchemeIds } from "@/lib/store";
import { servedFeed } from "@/lib/website-feed-model";

// The website's feed, public (plan part 10.2): the LAST PUBLISHED version — what a person published with
// «Публикувай за сайта» — never the live data; a scheme no longer started (taken back to draft, archived)
// drops out at once (Реш. 147) — so never cached (10.2 review). Read by the website (any origin may read
// it: public facts only, no credentials).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE = { "Access-Control-Allow-Origin": "*", "X-Content-Type-Options": "nosniff" };
const FRESH = { ...BASE, "Cache-Control": "no-cache, max-age=0, must-revalidate" };
const NONE = { ...BASE, "Cache-Control": "no-store" };

export async function GET() {
  try {
    const p = await latestPublication();
    if (!p) return Response.json({ error: "not published" }, { status: 404, headers: NONE });
    // only which schemes are started now — never their documents (10.2 review)
    const started = new Set(await listStartedSchemeIds());
    return Response.json(servedFeed(p.feed, started), { headers: FRESH });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503, headers: NONE });
  }
}

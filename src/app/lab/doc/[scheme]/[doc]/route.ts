import type { NextRequest } from "next/server";
import { getLabSession } from "@/lib/lab-auth";
import { listParticipationsForLab } from "@/lib/participants";
import { getScheme } from "@/lib/store";
import { getDoc } from "@/lib/documents";
import { stripBodyMarkers, withSkin } from "@/lib/doc-shell";
import { resolveSkinAsync } from "@/skins";
import type { DocOptions } from "@/lib/types";

// Lab-scoped document view. A laboratory can fetch ONLY:
//   • documents for a scheme it actually participates in (verified by lab_id), and
//   • its OWN certificate (scoped to its own code — never another lab's).
// Returns print-ready HTML (the lab can save as PDF from the browser). Whitelisted
// to certificate + final report; everything else is forbidden.
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["certificate", "report"]);

export async function GET(req: NextRequest, ctx: { params: Promise<{ scheme: string; doc: string }> }) {
  const ls = await getLabSession();
  if (!ls) return new Response("Unauthorized", { status: 401 });

  const { scheme: schemeId, doc } = await ctx.params;
  if (!ALLOWED.has(doc)) return new Response("Forbidden", { status: 403 });

  // the lab must own a participation in this scheme
  const mine = (await listParticipationsForLab(ls.lab.id)).find((p) => p.schemeId === schemeId);
  if (!mine) return new Response("Forbidden", { status: 403 });

  const scheme = await getScheme(schemeId);
  const def = getDoc(doc);
  if (!scheme || !def || !def.render) return new Response("Not found", { status: 404 });

  const lang = req.nextUrl.searchParams.get("lang") === "en" ? "en" : "bg";

  // certificate → scoped to THIS lab's code only
  let opts: DocOptions | undefined;
  if (doc === "certificate") {
    const cert = scheme.certificates?.[mine.code];
    opts = { participant: { code: mine.code, labName: mine.labName, certNo: cert?.no, certDate: cert?.date } };
  }

  const skin = await resolveSkinAsync(scheme);
  const html = stripBodyMarkers(withSkin(skin, () => def.render!(scheme, lang, opts)));
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy":
        "default-src 'none'; img-src 'self' data: https:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; frame-ancestors 'self'",
      "x-content-type-options": "nosniff",
    },
  });
}

import type { NextRequest } from "next/server";
import { getScheme } from "@/lib/store";
import { getDoc } from "@/lib/documents";
import { listParticipants } from "@/lib/participants";
import { stripBodyMarkers, withSkin } from "@/lib/doc-shell";
import { withFormCtx } from "@/lib/form-fields";
import { resolveSkinAsync, getSkinAsync } from "@/skins";
import type { DocOptions } from "@/lib/types";

// Serves a generated document's standalone HTML (any document type).
// Used by the on-screen preview iframe AND by Playwright for the PDF.
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; doc: string }> }
) {
  const { id, doc } = await ctx.params;
  const scheme = await getScheme(id);
  const def = getDoc(doc);
  if (!scheme || !def || !def.render) return new Response("Not found", { status: 404 });

  const lang = req.nextUrl.searchParams.get("lang") === "bg" ? "bg" : "en";

  // Per-document participant context.
  let opts: DocOptions | undefined;
  if (def.key === "registered" || def.key === "registered-coded") {
    // The participant lists (PTS-L 4.4-1 / 4.4-2) need the full list.
    const ps = await listParticipants(id);
    opts = {
      participants: ps.map((p) => ({
        code: p.code, labName: p.labName, country: p.country, contact: p.contact,
        email: p.email, phone: p.phone, deliveryAddress: p.deliveryAddress, participations: p.participations,
      })),
    };
  } else {
    // Certificate: resolve ?p against THIS scheme's participants only — an
    // unknown/foreign code falls back to a blank certificate, never rendering
    // arbitrary input.
    const code = req.nextUrl.searchParams.get("p");
    if (code) {
      const p = (await listParticipants(id)).find((x) => x.code === code);
      if (p) {
        const cert = scheme.certificates?.[code];
        opts = { participant: { code: p.code, labName: p.labName, certNo: cert?.no, certDate: cert?.date } };
      }
    }
  }

  // ?skin=<id> previews a specific skin (used by the skins gallery); else the scheme's own
  const skinParam = req.nextUrl.searchParams.get("skin");
  const skin = skinParam ? await getSkinAsync(skinParam) : await resolveSkinAsync(scheme);
  const fieldValues = scheme.formData?.[doc] ?? {};
  const html = stripBodyMarkers(
    withSkin(skin, () => withFormCtx({ fill: false, values: fieldValues }, () => def.render!(scheme, lang, opts)))
  );

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Strict CSP: documents are pure markup + fonts/images — no scripts. Blocks
      // any injected/pasted <script>, allows Google Fonts + self/data/https images
      // (logo, cover image), and forbids framing by other origins.
      "content-security-policy":
        "default-src 'none'; img-src 'self' data: https:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; frame-ancestors 'self'",
      "x-content-type-options": "nosniff",
    },
  });
}

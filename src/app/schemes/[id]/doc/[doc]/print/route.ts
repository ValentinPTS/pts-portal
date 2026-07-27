import type { NextRequest } from "next/server";
import { getScheme } from "@/lib/store";
import { getDoc } from "@/lib/documents";
import { listParticipants } from "@/lib/participants";
import { stripBodyMarkers, withSkin } from "@/lib/doc-shell";
import { withFormCtx } from "@/lib/form-fields";
import { resolveSkinAsync, getSkinAsync } from "@/skins";
import { canRevealNamesNow, requireStaff } from "@/lib/roles";
import type { DocOptions } from "@/lib/types";

// Serves a generated document's standalone HTML (any document type).
// Used by the on-screen preview iframe AND by Playwright for the PDF.
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; doc: string }> }
) {
  // Is this our own headless renderer? Established FIRST, because it decides both
  // who may read this route and whether a forwarded name-reveal flag is trustworthy.
  const internalToken = process.env.INTERNAL_TOKEN;
  const isInternal = !!internalToken && req.headers.get("x-internal-token") === internalToken;

  // Read gate. This route serves a whole confidential document, so it needs its own
  // guard rather than relying on the proxy: the proxy deliberately fails OPEN when
  // the Supabase anon key is missing/misconfigured (see proxy.ts) so a single bad env
  // var would otherwise publish every document. The headless PDF renderer carries no
  // session, so it is admitted by the internal token instead.
  if (!isInternal) await requireStaff();

  const { id, doc } = await ctx.params;
  const scheme = await getScheme(id);
  const def = getDoc(doc);
  if (!scheme || !def || !def.render) return new Response("Not found", { status: 404 });

  const lang = req.nextUrl.searchParams.get("lang") === "bg" ? "bg" : "en";

  // Name-reveal decision (§4.2): only a manager may see real lab names/identities.
  // /api/pdf forwards the caller's already-checked reveal permission as a header,
  // trusted ONLY alongside the valid internal token (proving it came from our server).
  // A direct browser navigation has no token → we fall back to the viewer's own
  // session role, so an auditor/staff can never coax a named document out of this route.
  const reveal = isInternal
    ? req.headers.get("x-reveal") === "1"
    : await canRevealNamesNow();

  // Per-document participant context.
  let opts: DocOptions | undefined;
  if (def.key === "registered" || def.key === "registered-coded" || def.key === "results-coded") {
    // The participant lists (F 7.2.1-4 / -5 / -6) need the full list, masked per role.
    const ps = await listParticipants(id);
    opts = {
      revealNames: reveal,
      participants: ps.map((p) => ({
        code: p.code, labName: p.labName, country: p.country, contact: p.contact,
        email: p.email, phone: p.phone, deliveryAddress: p.deliveryAddress, participations: p.participations,
        courier: p.courier, sampleCode: p.sampleCode, characteristics: p.characteristics,
      })),
    };
  } else {
    // Certificate: resolve ?p against THIS scheme's participants only — an
    // unknown/foreign code falls back to a blank certificate, never rendering
    // arbitrary input. The real lab NAME is attached only when the viewer may reveal
    // names (a manager); otherwise it renders as the blank template (no identity),
    // so an auditor/staff can't harvest identities via a certificate PDF.
    const code = req.nextUrl.searchParams.get("p");
    if (code && reveal) {
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

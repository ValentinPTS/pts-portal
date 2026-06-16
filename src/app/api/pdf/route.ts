import type { NextRequest } from "next/server";
import type { Browser } from "playwright";
import { getScheme } from "@/lib/store";
import { getDoc } from "@/lib/documents";
import { requireOwner } from "@/lib/auth";

// Generates any document's PDF with Playwright (loads the generic /doc/[doc]/print
// route), adding A4 page numbers in the footer. Node runtime (Playwright needs Node).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reuse ONE Chromium across requests instead of launching per request (launch is
// ~hundreds of ms + memory). Each request gets its own isolated context/page. If
// the cached browser ever disconnects (crash/idle), we relaunch on the next call.
let browserPromise: Promise<Browser> | null = null;
async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    try {
      const existing = await browserPromise;
      if (existing.isConnected()) return existing;
    } catch {
      // previous launch failed — fall through and relaunch
    }
  }
  const { chromium } = await import("playwright");
  browserPromise = chromium.launch();
  try {
    return await browserPromise;
  } catch (e) {
    browserPromise = null; // don't cache a failed launch
    throw e;
  }
}

export async function POST(req: NextRequest) {
  await requireOwner(); // no-op until AUTH_ENABLED=true; then owners-only
  let body: { id?: string; doc?: string; lang?: string; participant?: string; composed?: boolean };
  try {
    body = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  const scheme = await getScheme(id); // validates id
  const def = getDoc(typeof body.doc === "string" ? body.doc : "");
  if (!scheme || !def || !def.render) return new Response("Not found", { status: 404 });
  const lang = body.lang === "bg" ? "bg" : "en"; // whitelist

  const origin = req.nextUrl.origin;
  // forward the participant code (if any) — the print route validates it against
  // this scheme before using it.
  const part = typeof body.participant === "string" && body.participant ? `&p=${encodeURIComponent(body.participant)}` : "";
  // internal render token so the headless browser's same-origin navigation is not
  // blocked by the owner-area gate in proxy.ts (set INTERNAL_TOKEN in prod with auth on).
  const internal = process.env.INTERNAL_TOKEN ? `&_internal=${encodeURIComponent(process.env.INTERNAL_TOKEN)}` : "";
  // composed = the owner-built (builder) version; else the auto-generated template
  const url = (body.composed
    ? `${origin}/schemes/${encodeURIComponent(id)}/build/${encodeURIComponent(def.key)}/print?lang=${lang}`
    : `${origin}/schemes/${encodeURIComponent(id)}/doc/${encodeURIComponent(def.key)}/print?lang=${lang}${part}`) + internal;

  const browser = await getBrowser();
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    // wait for web fonts (string eval runs in the browser context, no DOM types needed here)
    await page.evaluate("document.fonts ? document.fonts.ready : Promise.resolve()").catch(() => {});
    const footer = `<div style="width:100%;font-family:sans-serif;font-size:8px;color:#6b6b6b;text-align:center;padding:0 14mm;">${scheme.revision} · ${def.formNumber} · ${scheme.revisionDate} &nbsp;·&nbsp; <span class="pageNumber"></span> / <span class="totalPages"></span></div>`;
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", bottom: "18mm", left: "14mm", right: "14mm" },
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate: footer,
    });
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="${id}_${def.key}_${lang}.pdf"`,
      },
    });
  } finally {
    await context.close(); // close the per-request context; keep the browser warm
  }
}

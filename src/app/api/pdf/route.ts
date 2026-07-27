import type { NextRequest } from "next/server";
import type { Browser } from "playwright-core";
import { getScheme } from "@/lib/store";
import { getDoc } from "@/lib/documents";
import { requireStaff, canRevealNamesNow } from "@/lib/roles";

// Generates any document's PDF with Playwright (loads the generic /doc/[doc]/print
// route), adding A4 page numbers in the footer. Node runtime (Playwright needs Node).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Launching Chromium + rendering a multi-page document takes well over the default
// serverless timeout on a cold start. 60s is the Vercel ceiling on Hobby/Pro-default.
export const maxDuration = 60;

// Serverless (Vercel/Lambda) can't run Playwright's own Chromium: the browser binary
// lives in a ~/.cache download that is never traced into the function bundle, and the
// full build is far past the 250MB limit. There we launch @sparticuz/chromium — a
// Chromium compiled for Lambda, shipped brotli-compressed inside node_modules and
// unpacked to /tmp on first use — driven by playwright-core. Locally we keep the full
// `playwright` package (a devDependency) exactly as before, so dev is unchanged.
const IS_SERVERLESS = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

async function launchBrowser(): Promise<Browser> {
  if (IS_SERVERLESS) {
    const sparticuz = (await import("@sparticuz/chromium")).default;
    const { chromium } = await import("playwright-core");
    return chromium.launch({
      args: sparticuz.args,
      executablePath: await sparticuz.executablePath(),
      headless: true,
    });
  }
  // local dev / self-hosted: Playwright's own managed Chromium
  const { chromium } = await import("playwright");
  return chromium.launch() as unknown as Promise<Browser>;
}

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
  browserPromise = launchBrowser();
  try {
    return await browserPromise;
  } catch (e) {
    browserPromise = null; // don't cache a failed launch
    throw e;
  }
}

export async function POST(req: NextRequest) {
  await requireStaff(); // any internal role may render/print (read); writes blocked elsewhere
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
  // The owner-area bypass token + THIS caller's name-reveal permission (§4.2) travel
  // as HTTP HEADERS on the SERVER-SIDE fetch below — never in the URL, where a secret
  // would be captured verbatim in access logs / APM traces (see proxy.ts, which reads
  // the header). Keeping them on a server-to-server call also means the token is never
  // handed to the browser process at all.
  const internalToken = process.env.INTERNAL_TOKEN ?? "";
  const reveal = (await canRevealNamesNow()) ? "1" : "";
  // composed = the owner-built (builder) version; else the auto-generated template
  const url = body.composed
    ? `${origin}/schemes/${encodeURIComponent(id)}/build/${encodeURIComponent(def.key)}/print?lang=${lang}`
    : `${origin}/schemes/${encodeURIComponent(id)}/doc/${encodeURIComponent(def.key)}/print?lang=${lang}${part}`;

  // Fetch the rendered document OURSELVES and hand the markup to the page, rather
  // than pointing the browser at the URL. page.goto() against our own render routes
  // aborts the navigation outright (net::ERR_ABORTED, no response) even though the
  // very same URL returns 200 to curl and to a normal browser — so the export used to
  // sit until the timeout and 500. This also removes a whole class of serverless
  // trouble: no second function invocation for the nested request, nothing for
  // deployment protection to block, and the secret stays server-side.
  let html: string;
  try {
    const res = await fetch(url, {
      headers: internalToken ? { "x-internal-token": internalToken, "x-reveal": reveal } : undefined,
      cache: "no-store",
    });
    if (!res.ok) return new Response(`Render failed (${res.status})`, { status: 502 });
    html = await res.text();
  } catch {
    return new Response("Render failed", { status: 502 });
  }
  // The markup carries site-relative asset URLs (/brand/logo.png). Without a document
  // URL to resolve against they'd break, so anchor them to this origin. `brand` is
  // exempt from the proxy gate, so the logo needs no credentials.
  html = html.replace(/<head(\s[^>]*)?>/i, (m) => `${m}<base href="${origin}/">`);

  const browser = await getBrowser();
  const context = await browser.newContext();
  try {
    // Bound every CROSS-ORIGIN subresource. The documents load their typefaces from
    // Google Fonts with a render-blocking <link>, and Chromium holds `load` until that
    // stylesheet resolves — so slow, filtered or unreachable font hosting could stall
    // the export for the full timeout. Fetching it ourselves with a short timeout and
    // aborting on failure makes the worst case a document in fallback faces, never a
    // failed export.
    await context.route("**/*", async (route) => {
      if (route.request().url().startsWith(origin)) {
        await route.continue();
        return;
      }
      try {
        await route.fulfill({ response: await route.fetch({ timeout: 4000 }) });
      } catch {
        await route.abort().catch(() => {});
      }
    });
    const page = await context.newPage();
    // Bounded rendering: a document that stalls must never hang the shared browser
    // indefinitely (it would starve concurrent PDF requests).
    page.setDefaultTimeout(20000);
    await page.setContent(html, { waitUntil: "load", timeout: 20000 });
    await page
      .evaluate(
        `document.fonts
          ? Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 5000))])
          : Promise.resolve()`
      )
      .catch(() => {});
    // Footer: document metadata on the left, the page number centred on the page
    // (a table keeps the centre cell at the true page centre regardless of the left
    // text). `.pageNumber`/`.totalPages` are filled in by Chromium per page.
    const meta = `${scheme.revision} · ${def.formNumber} · ${scheme.revisionDate}`;
    const pageLbl = `<span class="pageNumber"></span>`; // just the number (1, 2, 3 …)
    const footer = `<table style="width:100%;border-collapse:collapse;font-family:'Segoe UI',Arial,sans-serif;font-size:8px;color:#6b6b6b;"><tr>` +
      `<td style="width:34%;text-align:left;padding-left:14mm;white-space:nowrap;">${meta}</td>` +
      `<td style="width:32%;text-align:center;font-weight:700;color:#3e3e3e;">${pageLbl}</td>` +
      `<td style="width:34%;padding-right:14mm;"></td>` +
      `</tr></table>`;
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

import type { NextRequest } from "next/server";
import { mayNow, mayViewDoc } from "@/lib/access";
import { actorNow } from "@/lib/identities";
import type { Browser } from "playwright-core";
import { getScheme } from "@/lib/store";
import { getDoc, isRestrictedDoc } from "@/lib/documents";
import { footerLine } from "@/lib/doc-css";
import { isTestEnvironment } from "@/lib/environment";
import { requireStaff } from "@/lib/roles";
import { logActivity } from "@/lib/activity";
import { docImgSrc, imageUrlAllowed } from "@/lib/image-hosts";

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
  if (!(await mayNow("codes.view", id))) return new Response("Forbidden", { status: 403 }); // this scheme's, by the role model (2.4)
  if (isRestrictedDoc(def.key) && !(await mayNow("names.view", id))) return new Response("Forbidden — only a manager may open this list (ISO/IEC 17043 §4.2).", { status: 403 });
  if (!(await mayViewDoc(def.key, id))) return new Response("Forbidden — the Order is for the staff it assigns roles to (Реш. 149).", { status: 403 }); // Реш. 149, 2.6
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
  const reveal = (await mayNow("names.view", id)) ? "1" : "";
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
      // …and who is asking, for the identity store's record of the opening (2.3)
      // without the token (the developer's computer) the print route must see the SAME
      // person — their cookies, or it would take the request for the open build and
      // show names to anyone (2.9)
      headers: internalToken ? { "x-internal-token": internalToken, "x-reveal": reveal, "x-actor": await actorNow() } : { cookie: req.headers.get("cookie") ?? "" },
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
  // …and the print route's own policy again (the security sweep, SI-3): a page set from a string has
  // no HTTP headers — its «default-src 'none'» was lost, so a document's script would run here and a
  // CSS url() or a picture would be fetched from anywhere. No script; pictures only from the portal's
  // own places.
  const policy = `default-src 'none'; img-src ${origin} ${docImgSrc()}; style-src 'unsafe-inline' ${origin}; font-src ${origin}; base-uri ${origin}`;
  html = html.replace(/<head(\s[^>]*)?>/i, (m) => `${m}<meta http-equiv="Content-Security-Policy" content="${policy}"><base href="${origin}/">`);

  const browser = await getBrowser();
  const context = await browser.newContext();
  try {
    // Bound every CROSS-ORIGIN subresource. The typefaces are the portal's own
    // (/fonts, exempt from the proxy gate like /brand), so what can still come from
    // elsewhere is a picture from the portal's storage — and Chromium holds `load`
    // until it resolves, so a slow or unreachable host could stall the export for the
    // full timeout. Fetching it ourselves with a short timeout and aborting on failure
    // makes the worst case a document missing that picture, never a failed export.
    await context.route("**/*", async (route) => {
      if (route.request().url().startsWith(origin)) {
        // The page is set from a string, so its origin is opaque ("null") and Chromium
        // fetches the portal's font files cross-origin, in CORS mode: without an
        // Access-Control-Allow-Origin they are refused and the PDF falls back to
        // Arial/Georgia. Allow them here, in this renderer only — the portal's own
        // pages load the fonts same-origin and need nothing, and the files stay
        // closed to other sites.
        if (route.request().resourceType() === "font") {
          try {
            const res = await route.fetch({ timeout: 4000 });
            await route.fulfill({ response: res, headers: { ...res.headers(), "access-control-allow-origin": "*" } });
          } catch {
            await route.abort().catch(() => {});
          }
          return;
        }
        await route.continue();
        return;
      }
      // only a picture from the portal's own places (1.12) — never any other address, from the server (SI-3)
      if (!imageUrlAllowed(route.request().url())) {
        await route.abort().catch(() => {});
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
    // an issued document without a form number (the certificate, Q23) leaves that slot out
    const meta = (isTestEnvironment() ? "ТЕСТОВА СРЕДА / TEST · " : "") + footerLine(scheme.revision, def.formNumber, scheme.revisionDate);
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
    // every download is in the journal (part 1.9)
    await logActivity("file.downloaded", { schemeId: id, subject: `pdf:${def.key}`, summary: `A PDF made and downloaded (${def.key}, ${lang})` });
    if (reveal && (def.key === "results-coded" || (def.key === "certificate" && part))) {
      const code = typeof body.participant === "string" ? body.participant : undefined;
      await logActivity("names.viewed", { schemeId: id, targetCode: def.key === "certificate" ? code : undefined, subject: `pdf:${def.key}`, summary: `Laboratory names with their codes — in a PDF (${def.key})` });
    }
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

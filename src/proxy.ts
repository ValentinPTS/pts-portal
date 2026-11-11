import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getDb } from "./lib/supabase";
import { isSharedMailbox } from "./lib/provider-people";
import { entityUserByAuth } from "./lib/entity-users";

// Next 16 "proxy" (formerly middleware; Node.js runtime). Refreshes the Supabase
// session cookie and gates access by ROLE:
//   • owner area (everything except /lab, /apply, /login, static, api) → INTERNAL
//     users only (founders in OWNER_EMAILS, or an active staff_users row:
//     manager/staff/auditor). It's a READ gate — owner pages have no per-page guard.
//   • /lab/*  → labs (page-level requireLab confirms)
// Mutations still self-guard inside each action (requireWriter / requireManager /
// requireLab) — the proxy alone is NOT sufficient (see the Next "proxy" docs), and
// it's what keeps an auditor read-only.
//
// We read AUTH_ENABLED + OWNER_EMAILS straight from env here (the proxy must not
// import next/headers). While auth is off, this is a pass-through.
const AUTH_ENABLED = process.env.AUTH_ENABLED === "true";
// 2FA required for the owner area by default; REQUIRE_2FA=false relaxes it (test).
const REQUIRE_2FA = process.env.REQUIRE_2FA !== "false";

function ownerEmails(): string[] {
  return (process.env.OWNER_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}
function isOwner(email: string | undefined | null): boolean {
  const e = (email ?? "").toLowerCase();
  return !!e && !isSharedMailbox(e) && ownerEmails().includes(e);
}

// Is this signed-in user allowed to READ the owner area? Founders always; otherwise
// an active staff_users row (manager/staff/auditor). Uses the service-role client
// (RLS-bypassing) for the lookup. Resilient: if the table doesn't exist yet (the
// roles migration not applied) or the lookup fails, fall back to founders-only.
async function isInternalUser(email: string | undefined | null): Promise<boolean> {
  if (isOwner(email)) return true;
  const e = (email ?? "").toLowerCase();
  if (!e || isSharedMailbox(e)) return false; // never a person or a role (Реш. 139)
  const db = getDb();
  if (!db) return false;
  try {
    const { data, error } = await db.from("staff_users").select("status").eq("email", e).maybeSingle();
    if (error) return false;
    return !!data && data.status === "active";
  } catch {
    return false;
  }
}

// Is this signed-in user an ACTIVE laboratory account? Used only to decide where to
// send a non-internal user: a real lab → its portal; anything else (a login with no
// role yet) → back to /login with a clear "not authorized" message, instead of an
// invisible bounce loop to /lab/login.
async function isActiveLab(email: string | undefined | null): Promise<boolean> {
  const e = (email ?? "").toLowerCase();
  if (!e || isSharedMailbox(e)) return false;
  const db = getDb();
  if (!db) return false;
  try {
    const { data, error } = await db.from("labs").select("status").eq("email", e).maybeSingle();
    if (error) return false;
    return !!data && data.status === "active";
  } catch {
    return false;
  }
}

// …or a participant's user of a legal entity (4.4), by its sign-in account (linked at the
// invitation) — the laboratory's own opening, on record (0034). Only to send it to its
// side; the page's own gate decides what it may see.
async function isParticipantUser(authUserId: string | undefined): Promise<boolean> {
  if (!getDb() || !authUserId) return false;
  const u = await entityUserByAuth(authUserId, `auth:${authUserId}`).catch(() => null);
  return !!u && u.state !== "inactive";
}

// The parts the matcher below leaves out — asked again here on the NORMALISED path (the
// security sweep): Next matches the matcher against the path as sent (and decoded), with its
// «..» segments still in, but serves the page they resolve to — «/certificate/%2e%2e/dashboard»
// was left out as «certificate» and served the dashboard. So a path with a dot segment (or a
// backslash) is matched too (the second matcher), and what is public is decided here, on
// request.nextUrl.pathname (a WHATWG URL: its dot segments resolved).
const PUBLIC_PATH = /^\/(?:_next\/static\/|_next\/image(?:\/|$)|favicon\.ico$|brand\/|fonts\/|apply(?:\/|$)|register(?:\/|$)|catalogue(?:\/|$)|certificate(?:\/|$)|feed\/|api(?:\/|$))/;

// A portal page is never a picture, a script, a style, a font or a frame's object: a browser says
// what it fetches for (Sec-Fetch-Dest), and a page asked for as one of those is refused before it
// runs — a document's «<img src="…/schemes/S/export">» (or a site on the same domain) made every
// viewer's browser run the export in that viewer's name, on record (the security sweep, round 3 —
// R3S-2). A navigation, a frame and the app's own fetches («document», «iframe», «empty») pass.
const NOT_A_PAGE = new Set(["image", "script", "style", "font", "audio", "video", "track", "worker", "sharedworker", "serviceworker", "manifest", "object", "embed", "paintworklet", "audioworklet", "xslt"]);

// …nor a request a page makes on its own with no answer to read: a link's ping, a prefetch, an attribution
// report («attributionsrc» — round 4, R4S-2) — «empty» and «no-cors», or flagged for attribution. The
// app's own fetches and actions are «cors»; a navigation is «navigate».
function notAPage(request: NextRequest): boolean {
  const dest = (request.headers.get("sec-fetch-dest") ?? "").toLowerCase();
  if (NOT_A_PAGE.has(dest)) return true;
  if (request.headers.has("attribution-reporting-eligible")) return true;
  return dest === "empty" && (request.headers.get("sec-fetch-mode") ?? "").toLowerCase() === "no-cors";
}

export async function proxy(request: NextRequest) {
  const publicPath = PUBLIC_PATH.test(request.nextUrl.pathname);
  if (!publicPath && notAPage(request)) return new NextResponse(null, { status: 403 });
  if (!AUTH_ENABLED) return NextResponse.next(); // scaffolded off → app stays open
  if (publicPath) return NextResponse.next();

  // Internal render bypass: the PDF generator (server-side headless browser) fetches
  // owner render routes with a secret token so it isn't blocked by the gate. The token
  // rides in an HTTP HEADER (not the URL) so it never lands in an access log; /api/pdf
  // scopes it to same-origin requests, so it's never sent to third parties.
  const internal = process.env.INTERNAL_TOKEN;
  if (internal && request.headers.get("x-internal-token") === internal) {
    return NextResponse.next({ request });
  }

  const response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    "";
  // misconfigured (no anon key) → don't lock everyone out at the edge; the
  // in-action requireOwner()/requireLab() still protect mutations.
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(toSet) {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // account e-mail links and their pages (part 1.5): an invited or resetting person
  // has no session yet — or a fresh one before any role or 2FA — so no area gate,
  // and no session refresh here (the page's own action sets the session)
  const authPath = request.nextUrl.pathname;
  if (authPath === "/auth" || authPath.startsWith("/auth/")) return response;

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  // An unconfirmed e-mail counts as signed out — the same rule as getSessionUser
  // and sign-in (part 0.5), so the proxy and the pages never disagree.
  const user = authUser?.email_confirmed_at ? authUser : null;

  const path = request.nextUrl.pathname;
  const isLogin = path === "/login" || path.startsWith("/login/");
  const isLabLogin = path === "/lab/login" || path.startsWith("/lab/login/");
  const isLabArea = path === "/lab" || path.startsWith("/lab/");

  if (!user) {
    if (isLogin || isLabLogin) return response; // login pages reachable signed-out
    const to = request.nextUrl.clone();
    to.pathname = isLabArea ? "/lab/login" : "/login";
    to.search = `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(to);
  }

  // Signed in: the OWNER area (everything that isn't the lab area or a login page)
  // is INTERNAL-users-only AND requires completed 2FA. A signed-in user who isn't
  // internal (a lab) is sent to its portal; an internal user who hasn't passed 2FA
  // is sent to /account to enrol/verify — so the admin area can't even be READ at
  // aal1. (apply/api/static/brand/fonts are excluded by the matcher below.)
  const ownerArea = !isLabArea && !isLogin && !isLabLogin;
  if (ownerArea) {
    if (!(await isInternalUser(user.email))) {
      const to = request.nextUrl.clone();
      // A real lab → its portal; a signed-in account with NO role yet → back to the
      // owner login with a clear "not authorized" message (no silent /lab bounce).
      if ((await isActiveLab(user.email)) || (await isParticipantUser(user.id))) { to.pathname = "/lab"; to.search = ""; }
      else { to.pathname = "/login"; to.search = "?denied=1"; }
      return NextResponse.redirect(to);
    }
    // /account is exempt (that's where 2FA is enrolled — gating it would loop).
    const isAccount = path === "/account" || path.startsWith("/account/");
    if (REQUIRE_2FA && !isAccount) {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel !== "aal2") {
        const to = request.nextUrl.clone();
        to.pathname = "/account";
        to.search = "?enroll=1";
        return NextResponse.redirect(to);
      }
    }
  }

  return response;
}

export const config = {
  // run on everything except static assets, public brand images, the documents'
  // fonts (/fonts/ — a lab's document and the PDF renderer load them with no owner
  // session), the public application flow (/apply = scheme заявка, /register = the
  // registration, 9.1 — /register and below only: «/registrations» is PTS's section and
  // goes through here), the public catalogue (/catalogue, 10.1 — started schemes only), the certificate lookup (/certificate, 10.4), the website's feed (/feed/,
  // 10.2 — the last publication), and API
  // routes (which self-guard). Role checks live above
  // (owner area vs lab) and in requireOwner()/requireLab() for mutations.
  // The second: any path with a dot segment or a backslash, whatever it starts with — the
  // proxy then decides on the path it resolves to (PUBLIC_PATH above; the security sweep).
  // Each left-out part whole («brand/», «apply» then «/» or the end): a prefix alone would also have left
  // out a later «/applications» or «/brandbook» — no gate at all (round 4, R4S-9).
  matcher: [
    "/((?!_next/static/|_next/image(?:/|$)|favicon\\.ico$|brand/|fonts/|apply(?:/|$)|register(?:/|$)|catalogue(?:/|$)|certificate(?:/|$)|feed/|api(?:/|$)).*)",
    "/(.*(?:\\.\\.|%2[eE]|\\\\|%5[cC]).*)",
  ],
};

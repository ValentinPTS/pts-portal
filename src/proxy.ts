import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Next 16 "proxy" (formerly middleware). Refreshes the Supabase session cookie and
// gates access by ROLE:
//   • owner area (everything except /lab, /apply, /login, static, api) → owners only
//   • /lab/*  → labs (page-level requireLab confirms)
// Mutations still self-guard with requireOwner()/requireLab() inside each action —
// this proxy is the READ gate (owner pages have no per-page guard).
//
// We read AUTH_ENABLED + OWNER_EMAILS straight from env here (the proxy must not
// import next/headers). While auth is off, this is a pass-through.
const AUTH_ENABLED = process.env.AUTH_ENABLED === "true";

function ownerEmails(): string[] {
  return (process.env.OWNER_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}
function isOwner(email: string | undefined | null): boolean {
  const e = (email ?? "").toLowerCase();
  return !!e && ownerEmails().includes(e);
}

export async function proxy(request: NextRequest) {
  if (!AUTH_ENABLED) return NextResponse.next(); // scaffolded off → app stays open

  // Internal render bypass: the PDF generator (server-side headless browser) fetches
  // owner render routes with a secret query token so it isn't blocked by the gate.
  // Same-origin navigation only — the token is never sent to third parties.
  const internal = process.env.INTERNAL_TOKEN;
  if (internal && request.nextUrl.searchParams.get("_internal") === internal) {
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

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
  // is owners-only. A signed-in non-owner (a lab) is sent to its portal — it can
  // never READ owner pages or document/print routes. (apply/api/static/brand are
  // excluded by the matcher below.)
  const ownerArea = !isLabArea && !isLogin && !isLabLogin;
  if (ownerArea && !isOwner(user.email)) {
    const to = request.nextUrl.clone();
    to.pathname = "/lab";
    to.search = "";
    return NextResponse.redirect(to);
  }

  return response;
}

export const config = {
  // run on everything except static assets, public brand images, the public
  // application flow, and API routes (which self-guard). Role checks live above
  // (owner area vs lab) and in requireOwner()/requireLab() for mutations.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand|apply|api).*)"],
};

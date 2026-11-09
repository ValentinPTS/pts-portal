// Where a document's pictures may come from (plan part 1.12). A picture is fetched by
// whoever opens the document — a laboratory's browser included — so a picture from
// any host would hand its viewers' IP addresses to that host. Allowed: the portal
// itself (/brand/…, inline data:), its own file storage (Supabase's public
// skin-assets — the cover, the editor's pictures), and PTS's own site (ptsbg.eu).
// The sanitizer, the skin logo and the documents' Content-Security-Policy all read
// this one rule. Pure: env only.

type Env = Record<string, string | undefined>;

/** The origin of the portal's database / storage, or "" (no database configured). */
export function storageOrigin(env: Env = process.env): string {
  try { return env.NEXT_PUBLIC_SUPABASE_URL ? new URL(env.NEXT_PUBLIC_SUPABASE_URL).origin : ""; } catch { return ""; }
}

const OWN_SITE = /^(?:[a-z0-9-]+\.)*ptsbg\.eu$/;

/** May a picture be loaded from this absolute URL? (relative and data:image are the caller's) */
export function imageUrlAllowed(url: string, env: Env = process.env): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:") return false;
  if (OWN_SITE.test(u.hostname)) return true;
  const own = storageOrigin(env);
  return !!own && u.origin === own && u.pathname.startsWith("/storage/v1/object/public/");
}

/** The img-src of a document's Content-Security-Policy. */
export function docImgSrc(env: Env = process.env): string {
  const own = storageOrigin(env);
  return ["'self'", "data:", ...(own ? [own] : []), "https://ptsbg.eu", "https://*.ptsbg.eu"].join(" ");
}

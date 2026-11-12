// The session's cookies: never readable by a page's script, sent only over https on a deployment (the
// security sweep, round 5 — R5SB-4: the library's defaults let any script read the access and refresh
// tokens). No browser-side client reads them; the server (lib/auth) and the proxy do. Its own module: the
// proxy imports it, and must not import next/headers.
export const SESSION_COOKIE = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };

// Account e-mail links (plan part 1.5, finding P4.b). Pure, so the route, the
// actions and the tests share one set of rules.
//
// Every link Supabase or the portal sends — an invitation, a password reset, an
// e-mail confirmation or change — comes to /auth/confirm as
//   /auth/confirm?token_hash=…&type=invite|recovery|email|email_change&next=…
// (the e-mail templates in the Supabase dashboard are set to this form). Opening it
// does nothing by itself: the page asks the person to press «Продължи», and only
// that POST spends the one-time token — so a mail scanner that opens every link
// spends nothing, and no page can sign a visitor in silently (login CSRF).
// Then the session is set on the server and the person goes on: to set a password
// after an invitation or a reset, to a «confirmed» page otherwise.

// sign-ups are off and magic links unused, so neither is accepted
export const OTP_TYPES = ["invite", "recovery", "email", "email_change"] as const;
export type OtpType = (typeof OTP_TYPES)[number];
export const isOtpType = (v: unknown): v is OtpType => typeof v === "string" && (OTP_TYPES as readonly string[]).includes(v);

/** Where a link of this kind leads once it is accepted. */
export function afterLinkDest(type: OtpType): string {
  if (type === "invite") return "/auth/set-password?from=invite";
  if (type === "recovery") return "/auth/set-password?from=recovery";
  return "/auth/confirmed";
}

/** Where a reset link sends the person back to (Supabase's redirectTo). */
export const RESET_RETURN = `/auth/confirm?next=${encodeURIComponent("/auth/set-password?from=recovery")}`;
/** …and an invitation sent by Supabase itself (no portal mailer yet). */
export const INVITE_RETURN = `/auth/confirm?next=${encodeURIComponent("/auth/set-password?from=invite")}`;

/** The portal's own address for links in e-mails: one fixed origin per environment
 *  (NEXT_PUBLIC_SITE_URL), not whatever Host a request carried; the request's own
 *  address only where none is configured (local development). */
export function siteOrigin(host: string, proto: string, env: Record<string, string | undefined> = process.env): string {
  const fixed = (env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/$/, "");
  if (/^https?:\/\/[^/\s]+$/.test(fixed)) return fixed;
  return host ? `${proto === "http" ? "http" : "https"}://${host}` : "";
}

/** Supabase's error codes, in plain words (BG · EN) — never its raw English. */
export function authErrorText(code: string | undefined, fallback = "Нещо се обърка — опитайте пак. · Something went wrong — try again."): string {
  switch (code) {
    case "same_password": return "Новата парола е същата като старата. · The new password is the same as the old one.";
    case "weak_password": return "Паролата е твърде слаба — добавете дължина или разнообразие. · The password is too weak — make it longer or more varied.";
    case "insufficient_aal": return "Първо въведете кода от приложението за удостоверяване. · Enter your authenticator code first.";
    case "otp_expired": return "Връзката е изтекла. · The link has expired.";
    case "invalid_credentials": return "Текущата парола не е вярна. · The current password is not right.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit": return "Твърде много опити — опитайте след малко. · Too many attempts — try again in a while.";
    default: return fallback;
  }
}

/** A `next` from a link or a form: only a path inside this app, never another site
 *  («//x», «/\x», a tab or other control character the URL parser drops — «/\t/x»),
 *  never the link page itself (a loop). Parsed the way a browser parses it, so what
 *  is checked is what is followed. Otherwise the fallback. */
export function safeNext(next: string | null | undefined, fallback: string): string {
  const n = String(next ?? "");
  if (!n.startsWith("/") || /[\x00-\x1F\x7F\\]/.test(n)) return fallback;
  let u: URL;
  try { u = new URL(n, "http://portal.invalid"); } catch { return fallback; }
  if (u.origin !== "http://portal.invalid") return fallback;
  if (u.pathname.startsWith("/auth/confirm")) return fallback;
  return u.pathname + u.search;
}

// A password the portal accepts: long enough to be worth having, and typed the
// same twice. (Supabase may add its own rules; its message is shown as it comes.)
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;
export type PasswordProblem = "short" | "long" | "mismatch" | "is-email";

export function passwordProblem(pw: string, repeat: string, email = ""): PasswordProblem | null {
  if (pw.length < PASSWORD_MIN) return "short";
  if (pw.length > PASSWORD_MAX) return "long";
  if (pw !== repeat) return "mismatch";
  if (email && pw.trim().toLowerCase() === email.trim().toLowerCase()) return "is-email";
  return null;
}

/** The link a portal-sent invitation carries (the token, never a password) — an
 *  invitation's, or (a sign-in account made at an earlier invitation, 4.4) a new
 *  password's, leading to the same «set a password». */
export function inviteLink(origin: string, hashedToken: string, type: "invite" | "recovery" = "invite"): string {
  const q = new URLSearchParams({ token_hash: hashedToken, type, next: "/auth/set-password?from=invite" });
  return `${origin.replace(/\/$/, "")}/auth/confirm?${q.toString()}`;
}

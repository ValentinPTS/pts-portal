// ─────────────────────────────────────────────────────────────────────────────
// Sending e-mail.
//
// One small seam with two adapters, because the provider is not decided yet and
// this must not become the thing that decides it. Both are plain HTTPS calls with
// no SDK, so switching is an env change rather than a dependency.
//
// SILENT BY DEFAULT. With no MAIL_PROVIDER set, sendEmail reports "not configured"
// and sends nothing — a deployment cannot start mailing laboratories because a
// cron happened to run. The outbox keeps the notices either way, so switching the
// transport on later delivers everything raised in the meantime rather than
// starting from zero.
//
// The sender (part 1.7): the domain ptsbg.eu, verified at the provider through DNS
// records that Webface / Creativiso add (DKIM and a bounce subdomain — the existing
// MX and SPF of ptsbg.eu are not touched; docs/participant-portal/ZADANIE-ANTON-BG.md).
// Resend sends ONLY from a verified domain. Until the records exist, the fallback is
// a SINGLE VERIFIED SENDER — one address confirmed by a link e-mailed to it, no DNS
// — which SendGrid offers and Resend does not. Either way MAIL_FROM is required
// rather than derived from a domain.
//
// Env:
//   MAIL_PROVIDER = "resend" | "sendgrid"   (unset or anything else = disabled)
//   MAIL_API_KEY  = the provider's key
//   MAIL_FROM     = the sender, e.g. "PTS Bulgaria <portal@ptsbg.eu>"
//   MAIL_REPLY_TO = where replies go, e.g. office@ptsbg.eu (unset = to the sender).
//                   E-mail stays the official channel for questions (Реш. 116), and a
//                   shared mailbox may receive mail — it is only never a login (Реш. 139).
//   PTS_NOTIFY_EMAIL = where the provider's own notices go
//
// In the TEST environment (PTS_ENVIRONMENT=test, part 1.2) mail goes only to
// @ptsbg.eu — the simulated laboratories' test mailboxes (D21) — never to a real one.
// ─────────────────────────────────────────────────────────────────────────────

import { mailAllowedHere } from "./environment";

export type MailResult = { ok: true } | { ok: false; skipped?: true; error: string };

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

const PROVIDERS = ["resend", "sendgrid"] as const;
type Provider = (typeof PROVIDERS)[number];
// an unknown name is no provider: the key is never posted to another vendor's API
const provider = (): Provider | null => {
  const p = (process.env.MAIL_PROVIDER ?? "").trim().toLowerCase();
  return (PROVIDERS as readonly string[]).includes(p) ? (p as Provider) : null;
};

export function isMailConfigured(): boolean {
  return !!provider() && !!process.env.MAIL_API_KEY && !!process.env.MAIL_FROM;
}

const addressOf = (from: string) => (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();
const replyTo = () => {
  const r = (process.env.MAIL_REPLY_TO ?? "").trim();
  return looksLikeEmail(r) ? r : "";
};

/** What the system check shows (1.7) — never the key, only whether it is set. */
export function mailSetup(env: Record<string, string | undefined> = process.env) {
  const raw = (env.MAIL_PROVIDER ?? "").trim().toLowerCase();
  const from = (env.MAIL_FROM ?? "").trim();
  const address = from ? addressOf(from) : "";
  return {
    // an unknown value is never echoed: it may be a key pasted into the wrong variable
    provider: (PROVIDERS as readonly string[]).includes(raw) ? raw : raw ? "unknown" : "",
    keySet: !!env.MAIL_API_KEY,
    from,
    // the portal's own domain, or a temporary single sender somewhere else
    fromOnPtsbg: /@ptsbg\.eu$/.test(address),
    replyTo: (env.MAIL_REPLY_TO ?? "").trim(),
    replyToValid: looksLikeEmail((env.MAIL_REPLY_TO ?? "").trim()), // else sendEmail leaves it out
    notifyInbox: (env.PTS_NOTIFY_EMAIL ?? "").trim(),
  };
}

/** Where the provider's own notices go. Empty = the owner gets no e-mail yet. */
export function providerInbox(): string {
  return (process.env.PTS_NOTIFY_EMAIL ?? "").trim();
}

// A deliberately strict, boring check. It is not trying to validate every legal
// address — it is making sure a blank or obviously broken value never becomes an
// API call, because a provider rejecting one address can fail a whole batch.
export function looksLikeEmail(v: string): boolean {
  const s = (v ?? "").trim();
  return s.length > 3 && s.length <= 254 && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(s);
}

/**
 * Send one message. NEVER throws: the caller is a background flush, and one bad
 * address must not take the batch down with it. A transport failure is reported
 * so the notice stays undelivered and is retried on the next run.
 */
export async function sendEmail(msg: MailMessage): Promise<MailResult> {
  if (!isMailConfigured()) return { ok: false, skipped: true, error: "mail not configured" };
  if (!looksLikeEmail(msg.to)) return { ok: false, error: `bad recipient: ${msg.to}` };
  // the test environment writes to PTS's own mailboxes only (the address is not logged)
  if (!mailAllowedHere(msg.to)) return { ok: false, skipped: true, error: "test environment: only @ptsbg.eu is mailed" };

  const key = process.env.MAIL_API_KEY!;
  const from = process.env.MAIL_FROM!;
  try {
    const res = provider() === "sendgrid"
      ? await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: msg.to }] }],
            from: from.includes("<")
              ? { email: from.replace(/^.*<|>.*$/g, "") || from, name: from.replace(/\s*<.*$/, "") }
              : { email: from.trim() },
            ...(replyTo() ? { reply_to: { email: replyTo() } } : {}),
            subject: msg.subject,
            content: [{ type: "text/plain", value: msg.text }],
          }),
        })
      : await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
          body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, text: msg.text, ...(replyTo() ? { reply_to: replyTo() } : {}) }),
        });

    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 300);
      return { ok: false, error: `${res.status} ${body}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "send failed" };
  }
}

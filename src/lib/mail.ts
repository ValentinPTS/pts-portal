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
// The provider does not control DNS for ptsbg.eu, so the from-address is expected
// to be a SINGLE VERIFIED SENDER (both providers verify one address by e-mailing a
// link to it — no DNS records involved). That is why MAIL_FROM is required rather
// than derived from a domain.
//
// Env:
//   MAIL_PROVIDER = "resend" | "sendgrid"   (unset = disabled)
//   MAIL_API_KEY  = the provider's key
//   MAIL_FROM     = the verified sender, e.g. "PTS Bulgaria <ptsolutionsbg@gmail.com>"
//   PTS_NOTIFY_EMAIL = where the provider's own notices go
// ─────────────────────────────────────────────────────────────────────────────

export type MailResult = { ok: true } | { ok: false; skipped?: true; error: string };

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

const provider = () => (process.env.MAIL_PROVIDER ?? "").trim().toLowerCase();

export function isMailConfigured(): boolean {
  return !!provider() && !!process.env.MAIL_API_KEY && !!process.env.MAIL_FROM;
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

  const key = process.env.MAIL_API_KEY!;
  const from = process.env.MAIL_FROM!;
  try {
    const res = provider() === "sendgrid"
      ? await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: msg.to }] }],
            from: { email: from.replace(/^.*<|>.*$/g, "") || from, name: from.replace(/\s*<.*$/, "") },
            subject: msg.subject,
            content: [{ type: "text/plain", value: msg.text }],
          }),
        })
      : await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
          body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, text: msg.text }),
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

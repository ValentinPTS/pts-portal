import type { Notification } from "./types";
import { listUndelivered, markDelivered } from "./notifications";
import { getLab } from "./labs";
import { sendEmail, isMailConfigured, providerInbox, looksLikeEmail } from "./mail";

// ─────────────────────────────────────────────────────────────────────────────
// Draining the outbox.
//
// notify() only ever RECORDED a notice; this is the half that delivers it. It
// reads what has no emailedAt, sends it, and stamps it — so a notice raised before
// mail was switched on is delivered the first time this runs, rather than lost.
//
// Deliberately AT-LEAST-ONCE. A row is stamped only after the provider accepts it,
// so a crash between the two can repeat one e-mail. That is the right way round: a
// laboratory receiving a notice twice is a small annoyance, a laboratory never
// hearing that its results are due is the failure this whole thing exists to
// prevent. One bad address never fails the batch — it is left unstamped and
// retried, and reported so somebody can look at it.
//
// §4.2 is already settled upstream: the text was written name-free and fixed at
// write time, so the e-mail body is the stored text verbatim. This file must never
// add a laboratory name to it.
// ─────────────────────────────────────────────────────────────────────────────

export interface DeliveryReport {
  configured: boolean;
  considered: number;
  sent: number;
  failed: number;
  skipped: number; // no e-mail address to send to
  errors: string[];
}

/** The subject line. Short, and it never carries the code — subjects travel widest. */
export function subjectFor(n: Notification): string {
  return n.audience === "provider"
    ? "PTS Bulgaria — известие / notification"
    : "PTS Bulgaria — известие за вашата лаборатория / notification for your laboratory";
}

/**
 * The body: the notice as it was recorded, in both languages, plus a link.
 * Both languages because a laboratory account carries no language preference and
 * some participants are outside Bulgaria — the documents take the same approach.
 */
export function bodyFor(n: Notification, baseUrl: string): string {
  const link = n.href ? `${baseUrl.replace(/\/+$/, "")}${n.href}` : "";
  return [
    n.bg,
    "",
    n.en,
    ...(link ? ["", link] : []),
    "",
    "—",
    "PTS Bulgaria",
  ].join("\n");
}

/**
 * Who this notice goes to. Returns "" when there is nobody to send it to, which is
 * a skip rather than an error: a lab may have no account yet, and the provider's
 * inbox may simply not be configured.
 */
export async function recipientFor(n: Notification): Promise<string> {
  if (n.audience === "provider") return providerInbox();
  if (!n.labId) return "";
  const lab = await getLab(n.labId);
  // An inactive account still gets told — deactivation is an access decision, not
  // a reason to go quiet on a round the laboratory is already in.
  return lab?.email ?? "";
}

/**
 * Deliver what is pending. Safe to call repeatedly and safe to call with no
 * transport configured, in which case it reports that and touches nothing.
 */
export async function deliverPending(limit = 50, baseUrl = ""): Promise<DeliveryReport> {
  const report: DeliveryReport = {
    configured: isMailConfigured(), considered: 0, sent: 0, failed: 0, skipped: 0, errors: [],
  };
  if (!report.configured) return report;

  const pending = await listUndelivered(limit);
  report.considered = pending.length;

  for (const n of pending) {
    const to = await recipientFor(n);
    if (!looksLikeEmail(to)) {
      // Nobody to send to. Stamp it anyway: leaving it pending would make this
      // notice reappear in every future run for ever, and it is still readable in
      // the portal — the delivery attempt is what is being closed off, not the notice.
      report.skipped++;
      await markDelivered(n.id);
      continue;
    }
    const res = await sendEmail({ to, subject: subjectFor(n), text: bodyFor(n, baseUrl) });
    if (res.ok) {
      report.sent++;
      await markDelivered(n.id);
    } else {
      report.failed++;
      // The id, never the address — this report ends up in logs.
      if (report.errors.length < 10) report.errors.push(`${n.id}: ${res.error}`);
    }
  }
  return report;
}

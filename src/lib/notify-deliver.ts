import type { Notification } from "./types";
import { listUndelivered, markDelivered, BACKFILL_RELEASE } from "./notifications";
import { getLab } from "./labs";
import { sendEmail, isMailConfigured, providerInbox, looksLikeEmail } from "./mail";
import { mailAllowedHere, testSubject } from "./environment";
import { sendToLab, sentAddresses, failuresByAddress, type MessageClass, type Approval } from "./sent-messages";
import { noticeRecipients } from "./participation-snapshots";

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

/** A laboratory notice the transport refused this many times is given up (part 1.8):
 *  it stays readable in the portal, and its failed attempts stay on record. */
export const MAX_ATTEMPTS = 3;

export interface DeliveryReport {
  configured: boolean;
  considered: number;
  sent: number;
  failed: number;
  skipped: number; // no e-mail address to send to
  errors: string[];
}

/** The base of the links in the e-mails — the cron's and the page that shows them alike. VERCEL_URL has no scheme. */
export function mailBaseUrl(env: Record<string, string | undefined> = process.env): string {
  return env.NEXT_PUBLIC_SITE_URL || (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : "");
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

/** The class of a laboratory notice (part 1.8): a reminder, the chain notice (D19), or the provider's own. */
export function classFor(n: Notification): MessageClass {
  if (n.kind === "results.due") return "reminder";
  if (n.kind === "device.moved") return "chain";
  return "provider";
}

/**
 * The approval a laboratory notice carries: the person who pressed «Изпрати», or
 * the reminder template's approved version. None for one never released by either
 * (held, withheld, or the 0016 backlog shown in the portal only).
 */
export function approvalFor(n: Notification): Approval | null {
  if (n.audience !== "lab" || !n.releasedAt || n.withheldAt || !n.releasedBy || n.releasedBy === BACKFILL_RELEASE) return null;
  if (n.releasedBy.startsWith("template:")) return n.kind === "results.due" ? { by: n.releasedBy, ref: `notice:${n.id}` } : null;
  return { by: n.releasedBy, ref: `notice:${n.id}` };
}

/**
 * Who this notice goes to, each person (4.6, N28): for a participation linked by its
 * frozen copy (4.5), its entity's active users who receive the notices — and only they
 * (none yet: `waiting`, the notice is kept for when there is one — review); else the
 * one address recipientFor gives. Throws when the identity store cannot say — the
 * notice then waits for the next run.
 */
export async function recipientsOf(n: Notification): Promise<{ waiting: boolean; people: { to: string; entityId?: string }[] }> {
  if (n.audience === "lab" && n.schemeId && n.code) {
    const r = await noticeRecipients(n.schemeId, n.code, "system:notify");
    if (r.hasCopy) {
      const people = r.people.filter((p) => looksLikeEmail(p.email)).map((p) => ({ to: p.email, entityId: p.entityId }));
      return { waiting: people.length === 0, people };
    }
  }
  const to = await recipientFor(n);
  return { waiting: false, people: looksLikeEmail(to) ? [{ to }] : [] };
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

  // a wider look than the limit: notices waiting for their first recipient (4.6) are
  // kept pending, and must not crowd out the ones that can go (review)
  const pending = await listUndelivered(limit * 4);
  report.considered = pending.length;

  for (const n of pending) {
    // one notice's failure never abandons the rest of the batch (1.1): count it, go on
    try {
      const { waiting, people } = await recipientsOf(n);
      if (waiting) {
        // linked by its copy, but nobody of its entity takes the notices yet (invited,
        // or every one said no): kept for when someone does — not stamped (review)
        report.skipped++;
        continue;
      }
      if (!people.length) {
        // Nobody to send to. Stamp it anyway: leaving it pending would make this
        // notice reappear in every future run for ever, and it is still readable in
        // the portal — the delivery attempt is what is being closed off, not the notice.
        report.skipped++;
        await markDelivered(n.id);
        continue;
      }
      // The test environment mails only PTS's own test mailboxes (1.2): any other
      // address is closed off like a missing one — it stays readable in the portal.
      const allowed = people.filter((r) => mailAllowedHere(r.to));
      if (!allowed.length) {
        report.skipped++;
        await markDelivered(n.id);
        continue;
      }
      const subject = testSubject(subjectFor(n)), text = bodyFor(n, baseUrl);
      if (n.audience !== "lab") {
        // to PTS's own inbox: not a participant
        const res = await sendEmail({ to: allowed[0].to, subject, text });
        if (res.ok) { report.sent++; await markDelivered(n.id); }
        else { report.failed++; if (report.errors.length < 10) report.errors.push(`${n.id}: ${res.error}`); }
        continue;
      }
      // to a laboratory — each of its people (4.6, N28): stored with its approval first,
      // or not at all (part 1.8). Each address on its own: one already reached is not
      // written to again; one that failed MAX_ATTEMPTS times is given up — the others
      // go on (review). The notice is done when every address is reached or given up.
      const ref = `notice:${n.id}`;
      const [reached, failures] = await Promise.all([sentAddresses(ref), failuresByAddress(ref)]);
      let failedNow = 0, gaveUp = 0, sentNow = 0, err = "";
      for (const r of allowed) {
        const addr = r.to.trim().toLowerCase();
        if (reached.has(addr)) continue;
        if ((failures.get(addr) ?? 0) >= MAX_ATTEMPTS) { gaveUp++; continue; }
        const res = await sendToLab({ class: classFor(n), kind: n.kind, labId: n.labId, entityId: r.entityId, schemeId: n.schemeId, code: n.code, to: r.to, subject, body: text }, approvalFor(n));
        if (res.ok) { sentNow++; reached.add(addr); }
        else {
          err = res.error ?? "failed";
          if ((failures.get(addr) ?? 0) + 1 >= MAX_ATTEMPTS) gaveUp++; else failedNow++;
        }
      }
      if (failedNow === 0) {
        // every address reached or given up
        if (sentNow || reached.size) report.sent++; else report.skipped++;
        if (gaveUp && report.errors.length < 10) report.errors.push(`${n.id}: ${gaveUp} address(es) given up after ${MAX_ATTEMPTS} failed attempts`);
        await markDelivered(n.id);
      } else {
        report.failed++;
        // The id, never the address — this report ends up in logs.
        if (report.errors.length < 10) report.errors.push(`${n.id}: ${err}`);
      }
    } catch (e) {
      report.failed++;
      if (report.errors.length < 10) report.errors.push(`${n.id}: ${(e as Error)?.message ?? e}`);
    }
  }
  return report;
}

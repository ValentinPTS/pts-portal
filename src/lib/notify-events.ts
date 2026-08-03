import { notify } from "./notifications";

// ─────────────────────────────────────────────────────────────────────────────
// The notices the app actually raises, one function per moment in the exchange.
//
// The WORDING lives here and nowhere else. Two reasons:
//   1. §4.2 — a notice may carry a participant CODE and never a laboratory name.
//      That rule is only checkable if every message is written in one file, so
//      this module is the one place to audit it.
//   2. The message is stored finished, in both languages (see notifications.ts).
//      Keeping the sentences together makes the two languages easy to keep in
//      step, the way the documents do it.
//
// Each function is fire-and-forget: notify() never throws, so a notice can never
// roll back the real work that triggered it (approving a lab, issuing a report).
//
// Not raised yet, because the feature that would raise them does not exist:
// invoice.ready, docs.sent, items.dispatched, results.due, device.moved. They are
// declared in NotifyKind and get wired up with their own step.
// ─────────────────────────────────────────────────────────────────────────────

/** A laboratory submitted a заявка for a scheme. The provider looks up who. */
export async function notifyApplicationReceived(schemeId: string, schemeNumber: string): Promise<void> {
  await notify({
    kind: "application.received",
    audience: "provider",
    schemeId,
    bg: `Нова заявка за участие в схема ${schemeNumber}.`,
    en: `New application to take part in scheme ${schemeNumber}.`,
    href: `/schemes/${schemeId}/applications`,
  });
}

/**
 * The заявка was approved and the participant code was minted. This is where a
 * laboratory learns its code — a different one in every scheme it joins.
 */
export async function notifyApplicationApproved(
  labId: string | undefined,
  schemeId: string,
  schemeNumber: string,
  code: string,
): Promise<void> {
  if (!labId) return; // no account to show it to — the owner shares the code directly
  await notify({
    kind: "application.approved",
    audience: "lab",
    labId, schemeId, code,
    bg: `Заявката ви за схема ${schemeNumber} е одобрена. Вашият код за тази схема е ${code}.`,
    en: `Your application for scheme ${schemeNumber} has been approved. Your code for this scheme is ${code}.`,
    href: "/lab",
  });
}

export async function notifyApplicationRejected(
  labId: string | undefined,
  schemeId: string,
  schemeNumber: string,
): Promise<void> {
  if (!labId) return;
  await notify({
    kind: "application.rejected",
    audience: "lab",
    labId, schemeId,
    bg: `Заявката ви за схема ${schemeNumber} не беше приета.`,
    en: `Your application for scheme ${schemeNumber} was not accepted.`,
    href: "/lab",
  });
}

/**
 * The provider released a document to the participants. One notice per
 * participation, so a laboratory in two schemes is told twice, each carrying the
 * code it works under in that scheme.
 */
export async function notifyDocsSent(
  labId: string | undefined,
  schemeId: string,
  schemeNumber: string,
  code: string,
  docNameBg: string,
  docNameEn: string,
): Promise<void> {
  if (!labId) return;
  await notify({
    kind: "docs.sent",
    audience: "lab",
    labId, schemeId, code,
    bg: `Нов документ за схема ${schemeNumber}: „${docNameBg}“.`,
    en: `A new document for scheme ${schemeNumber}: “${docNameEn}”.`,
    href: "/lab",
  });
}

/**
 * A proforma invoice was put in one laboratory's slot. Addressed to that lab
 * alone — by its code, never its name, even though the file itself carries the
 * name (the notice travels further than the file does).
 */
export async function notifyInvoiceReady(
  labId: string | undefined,
  schemeId: string,
  schemeNumber: string,
  code: string,
): Promise<void> {
  if (!labId) return;
  await notify({
    kind: "invoice.ready",
    audience: "lab",
    labId, schemeId, code,
    bg: `Проформа фактурата ви за схема ${schemeNumber} е готова за изтегляне.`,
    en: `Your proforma invoice for scheme ${schemeNumber} is ready to download.`,
    href: "/lab",
  });
}

/** The laboratory confirmed the items arrived (it uploaded the signed protocol). */
export async function notifyReceiptConfirmed(schemeId: string, schemeNumber: string, code: string): Promise<void> {
  await notify({
    kind: "receipt.confirmed",
    audience: "provider",
    schemeId, code,
    bg: `${code} потвърди получаването на пробите (${schemeNumber}).`,
    en: `${code} confirmed receipt of the items (${schemeNumber}).`,
    href: `/schemes/${schemeId}/traceability`,
  });
}

/** The laboratory returned its completed results sheet. */
export async function notifyResultsReturned(schemeId: string, schemeNumber: string, code: string): Promise<void> {
  await notify({
    kind: "results.returned",
    audience: "provider",
    schemeId, code,
    bg: `${code} върна попълнения Лист за резултати (${schemeNumber}).`,
    en: `${code} returned its completed results sheet (${schemeNumber}).`,
    href: `/schemes/${schemeId}/traceability`,
  });
}

/** A certificate was issued for one participation. */
export async function notifyReportIssued(
  labId: string | undefined,
  schemeId: string,
  schemeNumber: string,
  code: string,
): Promise<void> {
  if (!labId) return;
  await notify({
    kind: "report.issued",
    audience: "lab",
    labId, schemeId, code,
    bg: `Сертификатът ви за схема ${schemeNumber} е издаден и можете да го изтеглите.`,
    en: `Your certificate for scheme ${schemeNumber} has been issued and is ready to download.`,
    href: "/lab",
  });
}

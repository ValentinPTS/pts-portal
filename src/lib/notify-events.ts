import { isProvisional } from "./coding-model";
import { notify } from "./notifications";
import { participationEntity } from "./participation-snapshots";

/** Someone to tell: a laboratory account (the earlier portal), or (4.6) a participation
 *  linked to its laboratory — its frozen copy (4.5) names the entity whose people are
 *  told. Neither: nobody — the notice is not raised. */
async function anyoneToTell(labId: string | undefined, schemeId: string, code: string): Promise<boolean> {
  if (labId) return true;
  try {
    return !!(await participationEntity(schemeId, code, "system:notify"));
  } catch (e) {
    // the identity store could not say: raise it all the same — a laboratory's notice
    // stays held until a person releases it, and is seen there (4.6 review)
    console.warn("[notify] could not tell whether a participation has a copy — the notice is raised:", (e as Error)?.message ?? e);
    return true;
  }
}

// A participation's code in a notice's words — never a provisional reference (5.3): before
// the coding act an application has none the laboratory knows.
const refBg = (code: string) => (isProvisional(code) ? "" : ` (код ${code})`);
const refEn = (code: string) => (isProvisional(code) ? "" : ` (code ${code})`);

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
  if (!(await anyoneToTell(labId, schemeId, code))) return; // nobody to tell — the owner shares it directly
  await notify({
    kind: "application.approved",
    audience: "lab",
    labId, schemeId, code,
    // before the coding act (5.3) there is no code to give — it comes with its own notice
    bg: isProvisional(code) ? `Заявката ви за схема ${schemeNumber} е приета. Кодът ви се тегли на случаен принцип след затваряне на заявяването и ще го получите отделно.` : `Заявката ви за схема ${schemeNumber} е одобрена. Вашият код за тази схема е ${code}.`,
    en: isProvisional(code) ? `Your application for scheme ${schemeNumber} is accepted. Your code is drawn at random after applications close; you will receive it separately.` : `Your application for scheme ${schemeNumber} has been approved. Your code for this scheme is ${code}.`,
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
  if (!(await anyoneToTell(labId, schemeId, code))) return; // nobody to tell — the owner shares it directly
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
  if (!(await anyoneToTell(labId, schemeId, code))) return; // nobody to tell — the owner shares it directly
  await notify({
    kind: "invoice.ready",
    audience: "lab",
    labId, schemeId, code,
    bg: `Проформа фактурата ви за схема ${schemeNumber} е готова за изтегляне.`,
    en: `Your proforma invoice for scheme ${schemeNumber} is ready to download.`,
    href: "/lab",
  });
}

/**
 * The calibration device is on its way to this laboratory — the stop before it
 * has just handed it on. It names NOBODY: the sender's identity arrives with the
 * package, and the app has no business announcing it in a message that travels
 * further than the box does.
 */
export async function notifyDeviceMoved(
  labId: string | undefined,
  schemeId: string,
  schemeNumber: string,
  code: string,
): Promise<void> {
  if (!(await anyoneToTell(labId, schemeId, code))) return; // nobody to tell — the owner shares it directly
  await notify({
    kind: "device.moved",
    audience: "lab",
    labId, schemeId, code,
    bg: `Уредът за схема ${schemeNumber} е изпратен към вас. Потвърдете получаването, когато пристигне.`,
    en: `The device for scheme ${schemeNumber} is on its way to you. Confirm receipt when it arrives.`,
    href: "/lab",
  });
}

/** A laboratory confirmed the calibration device reached it. → the provider. */
export async function notifyChainReceipt(schemeId: string, schemeNumber: string, code: string): Promise<void> {
  await notify({
    kind: "receipt.confirmed",
    audience: "provider",
    schemeId, code,
    bg: `${code} потвърди, че уредът е пристигнал (${schemeNumber}).`,
    en: `${code} confirmed the device arrived (${schemeNumber}).`,
    href: `/schemes/${schemeId}`,
  });
}

/**
 * A laboratory handed the device on. → the provider. `last` marks the end of the
 * chain, which is the moment he has to watch for: the device is coming back to him
 * and only he can close the round.
 */
export async function notifyChainHandover(
  schemeId: string, schemeNumber: string, code: string, last: boolean,
): Promise<void> {
  await notify({
    kind: "device.moved",
    audience: "provider",
    schemeId, code,
    bg: last
      ? `${code} изпрати уреда — това е последната спирка по веригата (${schemeNumber}). Уредът се връща при вас.`
      : `${code} предаде уреда на следващата лаборатория (${schemeNumber}).`,
    en: last
      ? `${code} sent the device on — that was the last stop in the chain (${schemeNumber}). It is on its way back to you.`
      : `${code} handed the device to the next laboratory (${schemeNumber}).`,
    href: `/schemes/${schemeId}`,
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
  if (!(await anyoneToTell(labId, schemeId, code))) return; // nobody to tell — the owner shares it directly
  await notify({
    kind: "report.issued",
    audience: "lab",
    labId, schemeId, code,
    bg: `Сертификатът ви за схема ${schemeNumber} е издаден и можете да го изтеглите.`,
    en: `Your certificate for scheme ${schemeNumber} has been issued and is ready to download.`,
    href: "/lab",
  });
}

/**
 * The scheme is not held (О9, Реш. 129): every participant is told, and nothing is
 * invoiced. One notice per participation, by its code.
 */
export async function notifySchemeNotHeld(labId: string | undefined, schemeId: string, schemeNumber: string, code: string): Promise<void> {
  if (!(await anyoneToTell(labId, schemeId, code))) return; // nobody to tell — the owner shares it directly
  await notify({
    kind: "scheme.not_held",
    audience: "lab",
    labId, schemeId, code,
    bg: `Схема ${schemeNumber} не се състои. Нищо не се фактурира.`,
    en: `Scheme ${schemeNumber} is not held. Nothing is invoiced.`,
    href: "/lab",
  });
}

/** The final report was issued (part 3.2): every participant may read it now. */
export async function notifyReportPublished(labId: string | undefined, schemeId: string, schemeNumber: string, code: string): Promise<void> {
  if (!(await anyoneToTell(labId, schemeId, code))) return; // nobody to tell — the owner shares it directly
  await notify({
    kind: "report.issued",
    audience: "lab",
    labId, schemeId, code,
    bg: `Окончателният доклад за схема ${schemeNumber} е издаден.`,
    en: `The final report for scheme ${schemeNumber} has been issued.`,
    href: "/lab",
  });
}

/** The scheme was amended by an order (part 3.3; Zadanie §3 — «Заявилите участници се
 *  уведомяват незабавно»). One notice per participation, by its code. */
export async function notifySchemeAmended(labId: string | undefined, schemeId: string, schemeNumber: string, code: string, lineBg: string, lineEn: string): Promise<void> {
  if (!(await anyoneToTell(labId, schemeId, code))) return; // nobody to tell — the owner shares it directly
  await notify({
    kind: "scheme.amended",
    audience: "lab",
    labId, schemeId, code,
    bg: `Схема ${schemeNumber} е изменена: ${lineBg}. Вижте документите и сроковете в портала.`,
    en: `Scheme ${schemeNumber} has been amended: ${lineEn}. See the documents and deadlines in the portal.`,
    href: "/lab",
  });
}

/** The participant's own deadline was extended by an order (part 3.4). By its code. */
export async function notifyDeadlineExtended(labId: string | undefined, schemeId: string, schemeNumber: string, code: string, key: "resultsDue" | "chain", untilText: string, orderNo: string): Promise<void> {
  if (!(await anyoneToTell(labId, schemeId, code))) return; // nobody to tell — the owner shares it directly
  const chain = key === "chain";
  await notify({
    kind: "deadline.extended",
    audience: "lab",
    labId, schemeId, code,
    bg: `Схема ${schemeNumber}: ${chain ? "срокът ви за предаване на уреда" : "срокът ви за резултатите"} е удължен до ${untilText} по Заповед № ${orderNo}.`,
    en: `Scheme ${schemeNumber}: your ${chain ? "deadline to hand the instrument on" : "results deadline"} is extended to ${untilText} by Order No. ${orderNo}.`,
    href: "/lab",
  });
}

/** A participation refused by PTS (5.1, Реш. 14) — its category and reason, by its code.
 *  Held until a person releases it (Реш. 138). */
export async function notifyParticipationRefused(labId: string | undefined, schemeId: string, schemeNumber: string, code: string, category: { bg: string; en: string }, reason: string): Promise<void> {
  if (!(await anyoneToTell(labId, schemeId, code))) return; // nobody to tell — the owner tells them directly
  await notify({
    kind: "participation.refused",
    audience: "lab",
    labId, schemeId, code,
    bg: `Заявката ви за схема ${schemeNumber}${refBg(code)} е отказана: ${category.bg}. Основание: ${reason}`,
    en: `Your application for scheme ${schemeNumber}${refEn(code)} is refused: ${category.en}. Reason: ${reason}`,
    href: "/lab",
  });
}

/** The first announcement (part 5.2; Реш. 24): the scheme runs — its minimum reached.
 *  Every participation in the round is told, by its code. */
export async function notifySchemeAnnounced(labId: string | undefined, schemeId: string, schemeNumber: string, code: string): Promise<void> {
  if (!(await anyoneToTell(labId, schemeId, code))) return; // nobody to tell — the owner tells them directly
  await notify({
    kind: "scheme.announced",
    audience: "lab",
    labId, schemeId, code,
    bg: `Схема ${schemeNumber} ще се проведе${refBg(code)}. Следва второто обявяване: по кои характеристики и окончателният списък на участниците. Проформата идва след него.`,
    en: `Scheme ${schemeNumber} will run${refEn(code)}. The second announcement follows: which characteristics run, and the final list of participants. The proforma comes after it.`,
    href: "/lab",
  });
}

/** The second announcement (part 5.2; Реш. 65): INDIVIDUAL — made from what this
 *  participation applied for: its characteristics that run, those that drop; or, none
 *  running, that it goes no further and nothing is invoiced. */
export async function notifyFinalList(labId: string | undefined, schemeId: string, schemeNumber: string, code: string, on: boolean, runs: { bg: string; en: string }[], dropped: { bg: string; en: string }[]): Promise<void> {
  if (!(await anyoneToTell(labId, schemeId, code))) return; // nobody to tell — the owner tells them directly
  const list = (xs: { bg: string; en: string }[], k: "bg" | "en") => xs.map((x) => x[k]).join("; ");
  await notify({
    kind: "scheme.final_list",
    audience: "lab",
    labId, schemeId, code,
    bg: on
      ? `Схема ${schemeNumber} — второ обявяване: участието ви${refBg(code)} е в окончателния списък.${runs.length ? ` Провеждат се: ${list(runs, "bg")}.` : ""}${dropped.length ? ` Отпадат: ${list(dropped, "bg")}.` : ""} Проформата следва.`
      : `Схема ${schemeNumber} — второ обявяване: нито една от заявените от вас характеристики не се провежда${dropped.length ? ` (отпадат: ${list(dropped, "bg")})` : ""}. Участието ви${refBg(code)} не продължава и нищо не се фактурира.`,
    en: on
      ? `Scheme ${schemeNumber} — second announcement: your participation${refEn(code)} is on the final list.${runs.length ? ` Running: ${list(runs, "en")}.` : ""}${dropped.length ? ` Dropped: ${list(dropped, "en")}.` : ""} The proforma follows.`
      : `Scheme ${schemeNumber} — second announcement: none of the characteristics you applied for runs${dropped.length ? ` (dropped: ${list(dropped, "en")})` : ""}. Your participation${refEn(code)} goes no further and nothing is invoiced.`,
    href: "/lab",
  });
}

/** The coding act (part 5.3; Zadanie «Кодиране»): the participation's code — drawn at
 *  random after applications closed — and its objects. By the NEW code. */
export async function notifyCoded(labId: string | undefined, schemeId: string, schemeNumber: string, code: string, objects: string[]): Promise<void> {
  if (!(await anyoneToTell(labId, schemeId, code))) return; // nobody to tell — the owner tells them directly
  await notify({
    kind: "participation.coded",
    audience: "lab",
    labId, schemeId, code,
    bg: `Схема ${schemeNumber}: кодът на участието ви е ${code}.${objects.length ? ` Обект(и): ${objects.join(", ")}.` : ""} Използвайте го във всички документи и резултати.`,
    en: `Scheme ${schemeNumber}: your participation's code is ${code}.${objects.length ? ` Object(s): ${objects.join(", ")}.` : ""} Use it in every document and result.`,
    href: "/lab",
  });
}

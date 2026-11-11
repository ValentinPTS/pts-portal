import { fmtEur } from "./commercial-model";
import { isProvisional } from "./coding-model";
import { messageText } from "./messages-model";
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

/** A laboratory submitted a заявка for a scheme. The provider looks up who — the earlier wizard's in
 *  «Заявки», the laboratory's own in its portal (9.2) in «Участници», where it already is a participant. */
export async function notifyApplicationReceived(schemeId: string, schemeNumber: string, where: "applications" | "participants" = "applications"): Promise<void> {
  await notify({
    kind: "application.received",
    audience: "provider",
    schemeId,
    bg: `Нова заявка за участие в схема ${schemeNumber}.`,
    en: `New application to take part in scheme ${schemeNumber}.`,
    href: `/schemes/${schemeId}/${where}`,
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
  doc: { slot: "proforma" | "invoice"; number?: string; participantId?: string } = { slot: "proforma" },
): Promise<void> {
  if (!(await anyoneToTell(labId, schemeId, code))) return; // nobody to tell — the owner shares it directly
  const no = doc.number ? ` № ${doc.number}` : "";
  await notify({
    kind: "invoice.ready",
    audience: "lab",
    labId, schemeId, code,
    // the proforma — or, after the payment, the original invoice (5.8; Реш. 35)
    bg: doc.slot === "invoice" ? `Фактурата${no} за схема ${schemeNumber} е качена в портала — на страницата на участието.` : `Проформа фактурата${no} за схема ${schemeNumber} е качена в портала — на страницата на участието.`,
    en: doc.slot === "invoice" ? `The invoice${no.replace("№", "No.")} for scheme ${schemeNumber} is in the portal — on the participation's page.` : `The proforma invoice${no.replace("№", "No.")} for scheme ${schemeNumber} is in the portal — on the participation's page.`,
    // the participation's own page, where both documents and their numbers are (review)
    href: doc.participantId ? `/lab/p/${encodeURIComponent(doc.participantId)}` : "/lab",
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
export async function notifyResultsReturned(schemeId: string, schemeNumber: string, code: string, online?: { version: number }): Promise<void> {
  await notify({
    kind: "results.returned",
    audience: "provider",
    schemeId, code,
    // online (6.4): which version — a later one is a new version, the earlier kept
    bg: online ? `${code} подаде резултатите си онлайн — версия ${online.version} (${schemeNumber}).` : `${code} върна попълнения Лист за резултати (${schemeNumber}).`,
    en: online ? `${code} submitted its results online — version ${online.version} (${schemeNumber}).` : `${code} returned its completed results sheet (${schemeNumber}).`,
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
export async function notifyReportPublished(labId: string | undefined, schemeId: string, schemeNumber: string, code: string, label = "", ilc = false): Promise<void> {
  if (!(await anyoneToTell(labId, schemeId, code))) return; // nobody to tell — the owner shares it directly
  // an ILC's report is its comparison report, never «the final report» of a PT (7.9)
  await notify({
    kind: "report.issued",
    audience: "lab",
    labId, schemeId, code,
    bg: `${ilc ? "Докладът от междулабораторното сравнение" : "Окончателният доклад"}${label ? ` (${label})` : ""} за схема ${schemeNumber} е издаден.`,
    en: `${ilc ? "The ILC comparison report" : "The final report"}${label ? ` (${label})` : ""} for scheme ${schemeNumber} has been issued.`,
    href: "/lab",
  });
}

/** A correction of the issued report (7.4; ISO/IEC 17043 §7.4.3): R2… — to each participation the
 *  report reaches and the correction concerns. By its code; fixed words — never PTS's typed scope,
 *  which may speak of another participation (review). */
export async function notifyReportCorrected(labId: string | undefined, schemeId: string, schemeNumber: string, code: string, label: string, ilc = false): Promise<void> {
  if (!(await anyoneToTell(labId, schemeId, code))) return; // nobody to tell — the owner shares it directly
  await notify({
    kind: "report.issued",
    audience: "lab",
    labId, schemeId, code,
    bg: `Издадена е поправка ${label} ${ilc ? "на доклада от междулабораторното сравнение" : "на окончателния доклад"} за схема ${schemeNumber}. Поправеният доклад е в портала.`,
    en: `Correction ${label} of ${ilc ? "the ILC comparison report" : "the final report"} for scheme ${schemeNumber} has been issued. The corrected report is in the portal.`,
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
export async function notifyFinalList(labId: string | undefined, schemeId: string, schemeNumber: string, code: string, on: boolean, runs: { bg: string; en: string }[], dropped: { bg: string; en: string }[], waiting = false): Promise<void> {
  if (!(await anyoneToTell(labId, schemeId, code))) return; // nobody to tell — the owner tells them directly
  const list = (xs: { bg: string; en: string }[], k: "bg" | "en") => xs.map((x) => x[k]).join("; ");
  // on the waiting list (9.3, Реш. 120): told so — never its place, never the maximum (3.7)
  if (waiting) {
    await notify({
      kind: "scheme.final_list", audience: "lab", labId, schemeId, code,
      bg: `Схема ${schemeNumber} — второ обявяване: схемата е запълнена и участието ви${refBg(code)} е в списъка на изчакващите. Ако се освободи място навреме, ще ви уведомим.`,
      en: `Scheme ${schemeNumber} — second announcement: the scheme is full and your participation${refEn(code)} is on the waiting list. Should a place become free in time, we will tell you.`,
      href: "/lab",
    });
    return;
  }
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

// ── Delivery and receipt (part 5.6) ──────────────────────────────────────────────

const dmy = (day: string) => (/^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}` : day);

/** Its object on its way (spec's notices: «Изпратен обект, с номер на товарителница»), a
 *  replacement, or handed to its own courier (Реш. 154). To the participation, by its code. */
export async function notifyItemsDispatched(labId: string | undefined, schemeId: string, schemeNumber: string, code: string, w: { kind: "dispatch" | "replacement" | "handover"; day: string; waybill?: string; carrier?: string; time?: string }): Promise<void> {
  if (!(await anyoneToTell(labId, schemeId, code))) return; // nobody to tell — the owner tells them directly
  const via = { bg: [w.carrier ? `с ${w.carrier}` : "", w.waybill ? `товарителница ${w.waybill}` : ""].filter(Boolean).join(", "), en: [w.carrier ? `by ${w.carrier}` : "", w.waybill ? `waybill ${w.waybill}` : ""].filter(Boolean).join(", ") };
  const bg = w.kind === "handover"
    ? `Схема ${schemeNumber}${refBg(code)}: обектът е предаден на вашия куриер${w.carrier ? ` (${w.carrier})` : ""} на ${dmy(w.day)}${w.time ? ` в ${w.time} ч.` : ""}. Рискът при превоза е ваш. Когато пристигне, попълнете протокола за получаване в портала.`
    : `Схема ${schemeNumber}${refBg(code)}: ${w.kind === "replacement" ? "заместващ обект ви е изпратен" : "обектът ви е изпратен"} на ${dmy(w.day)}${via.bg ? ` — ${via.bg}` : ""}. Когато пристигне, попълнете протокола за получаване в портала.`;
  const en = w.kind === "handover"
    ? `Scheme ${schemeNumber}${refEn(code)}: the object was handed to your courier${w.carrier ? ` (${w.carrier})` : ""} on ${dmy(w.day)}${w.time ? ` at ${w.time}` : ""}. The risk in transit is yours. When it arrives, fill in the receipt protocol in the portal.`
    : `Scheme ${schemeNumber}${refEn(code)}: ${w.kind === "replacement" ? "a replacement object was sent to you" : "your object was sent"} on ${dmy(w.day)}${via.en ? ` — ${via.en}` : ""}. When it arrives, fill in the receipt protocol in the portal.`;
  await notify({ kind: "items.dispatched", audience: "lab", labId, schemeId, code, bg, en, href: "/lab" });
}

/** The participant's online receipt protocol is in (Ф 7.3.4-1) — fit or not (Реш. 79). To PTS, by code. */
export async function notifyReceiptProtocol(schemeId: string, schemeNumber: string, code: string, suitable: boolean, what: "object" | "device" = "object"): Promise<void> {
  // a calibration DEVICE's protocol (5.11) is on the participant's case file — «Доставки» holds testing objects only
  if (what === "device") {
    await notify({
      kind: "receipt.confirmed",
      audience: "provider",
      schemeId, code,
      bg: suitable ? `${code} подаде протокол за получаване на уреда (${schemeNumber}): уредът е годен.` : `${code} подаде протокол за получаване на уреда (${schemeNumber}): уредът е НЕГОДЕН — вижте участника, преди уредът да продължи по веригата.`,
      en: suitable ? `${code} filed the device's receipt protocol (${schemeNumber}): the device is fit.` : `${code} filed the device's receipt protocol (${schemeNumber}): the device is NOT fit — see the participant before the device travels on.`,
      href: `/schemes/${encodeURIComponent(schemeId)}/participants/${encodeURIComponent(code)}`,
    });
    return;
  }
  await notify({
    kind: "receipt.confirmed",
    audience: "provider",
    schemeId, code,
    bg: suitable ? `${code} подаде протокол за получаване (${schemeNumber}): обектът е годен.` : `${code} подаде протокол за получаване (${schemeNumber}): обектът е НЕГОДЕН — вижте «Доставки».`,
    en: suitable ? `${code} filed its receipt protocol (${schemeNumber}): the object is fit.` : `${code} filed its receipt protocol (${schemeNumber}): the object is NOT fit — see «Deliveries».`,
    href: `/deliveries?scheme=${encodeURIComponent(schemeId)}`,
  });
}

/** «Сигнализирай проблем» — a participant's problem with its object. To PTS, by code. */
export async function notifyDeliveryProblem(schemeId: string, schemeNumber: string, code: string): Promise<void> {
  await notify({
    kind: "delivery.problem",
    audience: "provider",
    schemeId, code,
    bg: `${code} сигнализира проблем с обекта (${schemeNumber}) — вижте «Доставки».`,
    en: `${code} signalled a problem with its object (${schemeNumber}) — see «Deliveries».`,
    href: `/deliveries?scheme=${encodeURIComponent(schemeId)}`,
  });
}

/**
 * A one-way message a person at PTS wrote (part 5.10; Реш. 116) — to one participation (its
 * scheme and code, its people) or to one organisation (its entity, its users). Released by its
 * writer, who saw its exact text (Реш. 138): out in the portal at once, and e-mailed with their
 * approval (1.8). Never throws (notify); returns whether it was recorded.
 */
export async function notifyMessage(target: { schemeId: string; code: string; labId?: string; participantId?: string } | { entityId: string }, text: { bg: string; en: string }, writer: string): Promise<boolean> {
  // (text.en is the Bulgarian when no English was given — the e-mail then carries it once: bodyFor)
  const n = await notify({
    kind: "message",
    audience: "lab",
    ...("entityId" in target
      ? { entityId: target.entityId, href: "/lab/overview" }
      // the participation's own page — where its notices are (5.5)
      : { schemeId: target.schemeId, code: target.code, labId: target.labId, href: target.participantId ? `/lab/p/${encodeURIComponent(target.participantId)}` : "/lab" }),
    bg: messageText(text.bg, "bg"),
    en: messageText(text.en, "en"),
    releasedByWriter: writer,
  });
  return !!n?.releasedAt;
}

/** PTS unlocked a participation's results form after the deadline (part 6.4; Реш. 111) — until a
 *  day, with its reason kept on record. To the laboratory — held for a person, as every lab notice. */
export async function notifyResultsUnlocked(labId: string | undefined, schemeId: string, schemeNumber: string, code: string, participantId: string, until: string): Promise<void> {
  if (!(await anyoneToTell(labId, schemeId, code))) return;
  const day = `${until.slice(8, 10)}.${until.slice(5, 7)}.${until.slice(0, 4)}`;
  await notify({
    kind: "results.unlocked",
    audience: "lab",
    labId, schemeId, code,
    bg: `Формулярът за резултати по схема ${schemeNumber} е отключен от PTS до ${day} включително — можете да подадете резултатите си.`,
    en: `The results form of scheme ${schemeNumber} is unlocked by PTS until ${day} inclusive — you can submit your results.`,
    href: `/lab/p/${encodeURIComponent(participantId)}/results`,
  });
}

/** PTS recorded a value used in the evaluation next to one the laboratory submitted, or withdrew
 *  one (part 6.5) — the version stays as submitted. To the laboratory, without the value: it sees
 *  both on its results page. Held for a person, as every lab notice. */
export async function notifyResultsCorrected(labId: string | undefined, schemeId: string, schemeNumber: string, code: string, participantId: string, version: number): Promise<void> {
  if (!(await anyoneToTell(labId, schemeId, code))) return;
  await notify({
    kind: "results.corrected",
    audience: "lab",
    labId, schemeId, code,
    bg: `PTS записа корекция към подадените ви резултати по схема ${schemeNumber} (версия ${version}) — подаденото се пази; вижте страницата с резултатите.`,
    en: `PTS recorded a correction to your submitted results in scheme ${schemeNumber} (version ${version}) — what you submitted is kept; see the results page.`,
    href: `/lab/p/${encodeURIComponent(participantId)}/results`,
  });
}

/** «Заключи подаването» (part 6.6; Реш. 21, 22, 91): the submission is locked — processing has
 *  started — and no version came from this participation: it is N/R. Told to it personally (never
 *  against its code in the report). Held for a person, as every lab notice. */
export async function notifyResultsLockedNR(labId: string | undefined, schemeId: string, schemeNumber: string, code: string, participantId: string): Promise<void> {
  if (!(await anyoneToTell(labId, schemeId, code))) return;
  await notify({
    kind: "results.locked",
    audience: "lab",
    labId, schemeId, code,
    bg: `Подаването на резултати по схема ${schemeNumber} е заключено — започна обработката. От вас не са получени резултати; участието ви е N/R (не е докладвано).`,
    en: `The submission of results in scheme ${schemeNumber} is locked — processing has started. No results were received from you; your participation is N/R (not reported).`,
    href: `/lab/p/${encodeURIComponent(participantId)}/results`,
  });
}

/** «Върни» from processing (part 6.6): the submission is open again — to those the lock recorded
 *  N/R. Held for a person, as every lab notice. */
export async function notifyResultsReopened(labId: string | undefined, schemeId: string, schemeNumber: string, code: string, participantId: string): Promise<void> {
  if (!(await anyoneToTell(labId, schemeId, code))) return;
  await notify({
    kind: "results.locked",
    audience: "lab",
    labId, schemeId, code,
    bg: `Подаването на резултати по схема ${schemeNumber} е отново отворено — формулярът следва срока за резултати.`,
    en: `The submission of results in scheme ${schemeNumber} is open again — the form follows the results deadline.`,
    href: `/lab/p/${encodeURIComponent(participantId)}/results`,
  });
}

/** The carriers' offers for a delivery outside the EU and the Balkans (part 9.5; Реш. 128) — to the
 *  participation, held for a person to release like every notice to a laboratory (1.8). By its code,
 *  every offer in words (its note too — what the laboratory sees is what was released); no name. Returns
 *  the notice — null when there is no one in the portal to tell. */
export async function notifyCarrierOffers(labId: string | undefined, schemeId: string, schemeNumber: string, code: string, participantId: string, offers: { carrier: string; cents: number; days?: number; note?: string }[]): Promise<import("./types").Notification | null> {
  if (!(await anyoneToTell(labId, schemeId, code))) return null; // nobody to tell — the owner tells them directly
  const list = (k: "bg" | "en") => offers.map((o) => `${o.carrier} — ${fmtEur(o.cents, k)}${o.days ? (k === "bg" ? `, ${o.days} дни` : `, ${o.days} days`) : ""}${o.note ? ` (${o.note})` : ""}`).join("; ");
  return notify({
    kind: "carrier.offers", audience: "lab", labId, schemeId, code,
    bg: `Схема ${schemeNumber} — доставката на обекта ви${refBg(code)} е извън ЕС и Балканите: оферти на превозвачи — ${list("bg")}. Изберете една на страницата на участието.`,
    en: `Scheme ${schemeNumber} — the delivery of your object${refEn(code)} is outside the EU and the Balkans: carriers' offers — ${list("en")}. Choose one on the participation's page.`,
    href: `/lab/p/${participantId}`,
  });
}

/** The laboratory chose its carrier (part 9.5) — to PTS, by the scheme's number and the code. */
export async function notifyCarrierChosen(schemeId: string, schemeNumber: string, code: string): Promise<void> {
  await notify({
    kind: "carrier.chosen", audience: "provider", schemeId, code,
    bg: `Схема ${schemeNumber} — участие ${code} избра превозвач за доставката.`,
    en: `Scheme ${schemeNumber} — participation ${code} chose its carrier.`,
    href: `/schemes/${schemeId}/participants`,
  });
}

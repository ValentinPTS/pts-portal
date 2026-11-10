// The П-sentences that switch at Gate B (plan part 5.8; D16; PTS's answers 7б). Pure.
//
// Until Gate B the documents keep the e-mail path (the pilot runs on e-mail and the current
// forms — Реш. 137); from Gate B the documents and the invoices live in the portal and
// e-mail only tells. The new sentences are prepared here, in both languages, and the
// documents choose by GATE_B — set on the deployment (PTS_GATE_B=on) when Gate B is passed.
// Switching changes the documents' content: each opened scheme's invitation then goes out as
// a new edition (3.0, 3.3).
//
// П4 (the testing invitation, the proforma), П5 (the electronic invoice), П7 (the calibration
// invitation — both): «проформата се качва в портала и е видима там; имейлът остава само
// уведомление» — PTS to approve the words.
// П12 (the testing Instruction) and П17 (the calibration Instruction, and M1's point 10): the
// receipt protocol and the declaration are no longer sent by e-mail — the protocol is filled
// in the portal (5.6), the device's arrival confirmed there (the chain), the declaration signed
// there by a tick (5.9). «Нов текст на Етап 6» (PTS's answers 7б) — prepared here (part 5.11).

/** The П-sentences' set — raised whenever they change (5.8, 5.11, 6.8): a gated document printed
 *  with a newer set is a new edition (editions' fingerprint — 6.8 review). */
export const GATE_TEXTS_VERSION = "6.8";

/** Gate B passed on this deployment? Off until PTS says so. */
export const gateB = (env: Record<string, string | undefined> = process.env): boolean => env.PTS_GATE_B === "on";

export const P4 = {
  bg: "Проформа фактурата се качва в портала за участници, на страницата на участието, и се вижда и сваля оттам от всички потребители на организацията. По електронна поща идва само уведомление.",
  en: "The pro forma invoice is uploaded to the participant portal, on the participation's page, where every user of the organisation sees and downloads it. E-mail brings only a notification.",
};
export const P5 = {
  bg: "След извършване на плащането електронната фактура се качва по същия начин в портала; по електронна поща идва само уведомление.",
  en: "After payment is received, the electronic invoice is uploaded to the portal in the same way; e-mail brings only a notification.",
};
export const P7 = {
  bg: "Първо се издава проформа фактура, след плащане — електронна фактура. И двете се качват в портала за участници, на страницата на участието, и се виждат и свалят оттам от всички потребители на организацията; по електронна поща идва само уведомление.",
  // (never opening with the old sentence's words — the swap stays one-way: 5.11 review)
  en: "First, a pro forma invoice is issued; after payment, an electronic invoice. Both are uploaded to the participant portal, on the participation's page, where every user of the organisation sees and downloads them; e-mail brings only a notification.",
};
// the form numbers in Latin «F», as the Instructions print them; M1's own style below
export const P12 = {
  bg: "Веднага след получаване на обекта попълнете в портала, на страницата на участието, Протокола за получаване на обект на изпитване за пригодност (F 7.3.4-1); там подпишете с отметка и Декларацията за конфиденциалност (F 4.2-2). По имейл не се изпраща нищо от двете.",
  en: "Immediately after receiving the item, fill in the Protocol for PT Item Receipt (F 7.3.4-1) in the portal, on the participation's page; there, also sign the Confidentiality Declaration (F 4.2-2) by a tick. Neither is sent by e-mail.",
};
// the calibration device: its arrival AND its receipt protocol in the portal (the protocol online
// for calibration too since 5.11), still by the next working day as M1 says (review)
export const P17 = {
  bg: "При пристигането на уреда потвърдете получаването му в портала, на страницата на участието («Уредът пристигна при мен»), и попълнете там Протокола за получаване на обект (F 7.3.4-1) — не по-късно от следващия работен ден; там подпишете с отметка и Декларацията за конфиденциалност (F 4.2-2) преди започване на калибрирането. По имейл не се изпраща нищо от двете.",
  en: "When the device arrives, confirm its receipt in the portal, on the participation's page («The device has arrived»), and fill in the Protocol for PT Item Receipt (F 7.3.4-1) there — no later than the next working day; there, also sign the Confidentiality Declaration (F 4.2-2) by a tick before the calibration begins. Neither is sent by e-mail.",
};
/** П17 in M1's own style — its third person, «Ф», the forms in bold (m1-texts point 10). */
export const P17_M1 = {
  bg: "При пристигането на уреда участникът потвърждава получаването му в портала, на страницата на участието («Уредът пристигна при мен»), и попълва там **Протокол за получаване на обект на изпитване за пригодност (Ф 7.3.4-1)** — не по-късно от следващия работен ден; там подписва с отметка и **Декларация за конфиденциалност (Ф 4.2-2)** преди започване на дейностите по калибриране. По имейл не се изпраща нищо от двете.",
  en: "When the device arrives, the participant confirms its receipt in the portal, on the participation's page («The device has arrived»), and fills in the **Protocol for PT item receipt (F 7.3.4-1)** there — no later than the next working day; there, the participant also signs the **Confidentiality declaration (F 4.2-2)** by a tick before the calibration activities begin. Neither is sent by e-mail.",
};

// П10, П11 (the testing Instruction) and П16 (the calibration Instruction) — part 6.8: the results
// are submitted in the portal; the record there replaces the Results Sheet (F 7.2.1-7); after the
// deadline only through PTS's unlock (Реш. 111), never after processing has started (Реш. 21).
// «Нов текст на Етап 7» (PTS's answers 7б) — prepared here, PTS to approve the words.
export const P10 = {
  bg: "Резултатите се въвеждат и подават в портала, на страницата на участието («Резултати»); подаването издава разписка, а подадената версия е записът на резултатите. По имейл не се изпраща лист.",
  en: "The results are entered and submitted in the portal, on the participation's page («Results»); submitting issues a receipt, and the submitted version is the record of the results. No sheet is sent by e-mail.",
};
export const P11 = {
  bg: (deadline: string) => `Всички резултати се подават в портала, на страницата на участието, не по-късно от ${deadline}; записът в портала заменя Листа с резултати (F 7.2.1-7). След срока формулярът се затваря — закъснял резултат се приема само ако PTS отключи формуляра, и никога след началото на обработката.`,
  en: (deadline: string) => `All results are submitted in the portal, on the participation's page, no later than ${deadline}; the record in the portal replaces the Results Sheet (F 7.2.1-7). After the deadline the form closes — a late result comes in only if PTS unlocks the form, and never after processing has started.`,
};
export const P16 = {
  bg: (deadline: string) => `Всички резултати се подават в портала, на страницата на участието, не по-късно от ${deadline}; формулярът изчислява грешките, които потвърждавате при подаването, а записът в портала заменя Листа с резултати (F 7.2.1-7). След срока формулярът се затваря — закъснял резултат се приема само ако PTS отключи формуляра, и никога след началото на обработката.`,
  en: (deadline: string) => `All results are submitted in the portal, on the participation's page, no later than ${deadline}; the form computes the errors, which you confirm on submitting, and the record in the portal replaces the Results Sheet (F 7.2.1-7). After the deadline the form closes — a late result comes in only if PTS unlocks the form, and never after processing has started.`,
};
/** П16 in M1's own style — the calibration Instruction built from M1 (every calibration scheme since
 *  3.10), its point 10: the results in the portal, the record replacing the sheet (6.8 review). */
export const P16_M1 = {
  bg: "Всички резултати от измерванията се подават в портала, на страницата на участието, не по-късно от срока, посочен в т. 10 на **Плана за изпитване за пригодност (Ф 7.2.1-1)**; формулярът изчислява грешките, които участникът потвърждава при подаването, а записът в портала заменя **„Лист с резултати“ (Ф 7.2.1-7)**. След срока формулярът се затваря — закъснял резултат се приема само ако РТ провайдърът отключи формуляра, и никога след началото на обработката.",
  en: "All measurement results are submitted in the portal, on the participation's page, no later than the deadline stated in item 10 of the **Plan for proficiency testing (F 7.2.1-1)**; the form computes the errors, which the participant confirms on submitting, and the record in the portal replaces the **“Results Sheet” (F 7.2.1-7)**. After the deadline the form closes — a late result comes in only if the PT provider unlocks the form, and never after processing has started.",
};
/** What П10, П11, П16 replace, as the Instructions print them today — word for word (6.8). */
export const OLD_RESULTS = {
  P10: { bg: "Изпратете попълнения Лист с резултати по имейл в срока.", en: "Send the completed Results Sheet by e-mail within the deadline." },
  P11: {
    bg: (deadline: string) => `Всички резултати по имейл не по-късно от ${deadline}, чрез Листа с резултати (F 7.2.1-7). Закъснелите резултати обикновено не се включват в окончателния доклад.`,
    en: (deadline: string) => `All results by e-mail no later than ${deadline}, using the Results Sheet (F 7.2.1-7). Late results are normally not included in the final report.`,
  },
  P16: {
    bg: (deadline: string) => `Всички резултати по имейл не по-късно от ${deadline}, чрез Листа с резултати (F 7.2.1-7). Закъснелите резултати може да не бъдат включени в окончателния доклад.`,
    en: (deadline: string) => `All results by e-mail no later than ${deadline}, using the Results Sheet (F 7.2.1-7). Late results may not be included in the final report.`,
  },
};

// ── what each П-sentence replaces, as the templates print it (5.11 review) ──
// The templates print these very constants before Gate B, so a document built from a template
// and saved holds them word for word: after Gate B its print swaps them for the new sentences
// (refreshGateSentences), and the swap makes it a new edition. A saved document whose sentence
// was edited, or M1's, is refused at issue while it still sends by e-mail (stillByEmail).
const FEEDBACK_T = { en: "A Feedback Sheet (F 8.6-2) link is sent within 7 working days after the final report.", bg: "Връзка към Лист за обратна връзка (F 8.6-2) се изпраща до 7 работни дни след окончателния доклад." };
const FEEDBACK_C = { en: "A Feedback Sheet (F 8.6-2) link follows within 7 working days after the final report.", bg: "Връзка към Лист за обратна връзка (F 8.6-2) се изпраща до 7 работни дни след окончателния доклад." };
export const OLD = {
  P4: { en: "A pro forma invoice will be issued and sent to the e-mail address provided in the “Application for Participation” (F 7.2.1-3).", bg: "Проформа фактура се издава и изпраща на електронната поща, посочена в „Заявка за участие“ (Ф 7.2.1-3)." },
  P5: { en: "After payment is received, an electronic invoice will be issued and sent to the same e-mail address.", bg: "След извършване на плащането се издава електронна фактура, която се изпраща на същия електронен адрес." },
  P7: { en: "A pro forma invoice is issued first; after payment, an electronic invoice.", bg: "Първо се издава проформа фактура; след плащане — електронна фактура." },
  P12: { en: `Also submit by e-mail: the Protocol for PT Item Receipt (F 7.3.4-1) immediately after receipt, and the Confidentiality Declaration (F 4.2-2) together with it. ${FEEDBACK_T.en}`, bg: `По имейл изпратете също: Протокол за получаване на обект на изпитване за пригодност (F 7.3.4-1) веднага след получаване на обекта и Декларацията за конфиденциалност (F 4.2-2) заедно с него. ${FEEDBACK_T.bg}` },
  P17: { en: `Also send by e-mail: the Protocol for PT Item Receipt (F 7.3.4-1) and the Confidentiality Declaration (F 4.2-2). ${FEEDBACK_C.en}`, bg: `По имейл изпратете също: Протокола за получаване на обект (F 7.3.4-1) и Декларацията за конфиденциалност (F 4.2-2). ${FEEDBACK_C.bg}` },
};
/** The Instruction's list item from Gate B — the П-sentence, then the feedback sentence as before. */
export const NEW_P12_ITEM = { en: `${P12.en} ${FEEDBACK_T.en}`, bg: `${P12.bg} ${FEEDBACK_T.bg}` };
export const NEW_P17_ITEM = { en: `${P17.en} ${FEEDBACK_C.en}`, bg: `${P17.bg} ${FEEDBACK_C.bg}` };

const SWAPS: [{ bg: string; en: string }, { bg: string; en: string }][] = [[OLD.P4, P4], [OLD.P5, P5], [OLD.P7, P7], [OLD.P12, NEW_P12_ITEM], [OLD.P17, NEW_P17_ITEM], [OLD_RESULTS.P10, P10]];
// П11 and П16 carry the deadline as printed: swapped by their fixed words around it, the deadline kept (6.8)
type ByDeadline = { bg: (d: string) => string; en: (d: string) => string };
const DEADLINE_SWAPS: [ByDeadline, ByDeadline][] = [[OLD_RESULTS.P11, P11], [OLD_RESULTS.P16, P16]];
const MARK = "\u0000";
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const swapByDeadline = (html: string, was: (d: string) => string, now: (d: string) => string): string => {
  const [pre, post] = was(MARK).split(MARK);
  return html.replace(new RegExp(`${esc(pre)}([^<\u0000]{1,120}?)${esc(post)}`, "g"), (_m, d: string) => now(d));
};

/** A saved invitation or Instruction printed after Gate B: its e-mail sentences, word for word as
 *  the template printed them, become the portal's. Before Gate B, untouched. */
export function refreshGateSentences(html: string, env: Record<string, string | undefined> = process.env): string {
  if (!html || !gateB(env)) return html;
  let out = html;
  for (const [was, now] of SWAPS) for (const lang of ["bg", "en"] as const) out = out.split(was[lang]).join(now[lang]);
  for (const [was, now] of DEADLINE_SWAPS) for (const lang of ["bg", "en"] as const) out = swapByDeadline(out, was[lang], now[lang]);
  return out;
}

// the e-mail sentences' tell-tale words — the templates' П4, П5, П12, П17 and M1's П7, П17 —
// in either language: the invoices', the protocol's and the declaration's ONLY. Never a phrase
// another sentence shares (the certificate «sent to the e-mail address indicated in…», the
// schedule's «informed by e-mail»); П7's old template sentence names no e-mail (5.11 review)
const BY_EMAIL = [
  "По имейл изпратете също", "Also submit by e-mail", "Also send by e-mail",
  "Проформа фактура се издава и изпраща на електронната поща", "pro forma invoice will be issued and sent to the e-mail address",
  "електронна фактура, която се изпраща на същия електронен адрес", "electronic invoice will be issued and sent to the same e-mail address",
  "Първоначално се издава проформа фактура, която се изпраща на посочената електронна поща", "pro forma invoice is issued first and sent to the e-mail address",
  "на платилите участници, която изпраща на посочената електронна поща", "participants who have paid and is sent to the e-mail address",
  "изпраща се на РТ провайдъра непосредствено след получаване", "sent to the PT provider immediately after receipt",
  // the results (П10, П11, П16 — 6.8), and M1's own П16 (its point 10 — a saved M1 body is rendered,
  // never swapped word for word: refused at issue until rebuilt, as its П17 — 6.8 review)
  "Изпратете попълнения Лист с резултати по имейл", "Send the completed Results Sheet by e-mail",
  "Всички резултати по имейл не по-късно от", "All results by e-mail no later than",
  "се представят по електронна поща не по-късно", "submitted by e-mail no later than",
];

/** Each swap leaves nothing to swap again — the new sentence never holds the old (5.11 review). */
export const swapsAreOneWay = (): boolean => SWAPS.every(([was, now]) => (["bg", "en"] as const).every((l) => !now[l].includes(was[l])))
  && DEADLINE_SWAPS.every(([was, now]) => (["bg", "en"] as const).every((l) => { const [pre, post] = was[l](MARK).split(MARK); return !now[l]("31.03.2027").includes(pre) && !now[l]("31.03.2027").includes(post); }))
  // …and no new results sentence holds a tell-tale of the e-mail path (else stillByEmail would refuse it)
  && ![P10.bg, P10.en, P11.bg("d"), P11.en("d"), P16.bg("d"), P16.en("d"), P16_M1.bg, P16_M1.en].some((t) => BY_EMAIL.some((x) => t.includes(x)));
/** After Gate B: does this document still send the invoices, the protocol or the declaration by
 *  e-mail? Then it is not issued until its text is brought up to date (5.11 review). */
export function stillByEmail(html: string, env: Record<string, string | undefined> = process.env): boolean {
  return gateB(env) && !!html && BY_EMAIL.some((x) => html.includes(x));
}

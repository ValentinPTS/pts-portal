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

const SWAPS: [{ bg: string; en: string }, { bg: string; en: string }][] = [[OLD.P4, P4], [OLD.P5, P5], [OLD.P7, P7], [OLD.P12, NEW_P12_ITEM], [OLD.P17, NEW_P17_ITEM]];

/** A saved invitation or Instruction printed after Gate B: its e-mail sentences, word for word as
 *  the template printed them, become the portal's. Before Gate B, untouched. */
export function refreshGateSentences(html: string, env: Record<string, string | undefined> = process.env): string {
  if (!html || !gateB(env)) return html;
  let out = html;
  for (const [was, now] of SWAPS) for (const lang of ["bg", "en"] as const) out = out.split(was[lang]).join(now[lang]);
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
];

/** Each swap leaves nothing to swap again — the new sentence never holds the old (5.11 review). */
export const swapsAreOneWay = (): boolean => SWAPS.every(([was, now]) => (["bg", "en"] as const).every((l) => !now[l].includes(was[l])));
/** After Gate B: does this document still send the invoices, the protocol or the declaration by
 *  e-mail? Then it is not issued until its text is brought up to date (5.11 review). */
export function stillByEmail(html: string, env: Record<string, string | undefined> = process.env): boolean {
  return gateB(env) && !!html && BY_EMAIL.some((x) => html.includes(x));
}

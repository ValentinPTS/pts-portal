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
  en: "A pro forma invoice is issued first; after payment, an electronic invoice. Both are uploaded to the participant portal, on the participation's page, where every user of the organisation sees and downloads them; e-mail brings only a notification.",
};

// One-way messages from PTS (plan part 5.10; К11 → Реш. 116; Q1 → Реш. 21, 22, 91). Pure.
//
// «Еднопосочни съобщения в първата версия, в портала и по имейл.» A person at PTS writes the
// message — to ONE participation, to EVERYONE going on in a scheme, or to ONE organisation —
// and it reaches the portal and each of its people by e-mail, released by its writer, who
// sees its exact text (Реш. 138; send control 1.8). There is no reply in the portal: until
// two-way messages, e-mail stays the official channel for questions (Реш. 54) — every
// message says so.

export const MESSAGE_MIN = 3;
export const MESSAGE_MAX = 2000;

export type MessageProblem = "bg" | "long" | "twice";

const clean = (v: unknown) => String(v ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/[ \t]+\n/g, "\n").trim();
const len = (s: string) => [...s].length;

/** The message's two texts: Bulgarian required; English optional — the Bulgarian when empty
 *  (`enGiven` false: the e-mail then carries the text once, review). */
export function readMessage(input: { bg: unknown; en: unknown }): { ok: true; bg: string; en: string; enGiven: boolean } | { ok: false; problem: MessageProblem } {
  const bg = clean(input.bg), en = clean(input.en);
  if (len(bg) < MESSAGE_MIN) return { ok: false, problem: "bg" };
  if (len(bg) > MESSAGE_MAX || len(en) > MESSAGE_MAX) return { ok: false, problem: "long" };
  const enGiven = len(en) >= MESSAGE_MIN;
  return { ok: true, bg, en: enGiven ? en : bg, enGiven };
}

export const MESSAGE_PROBLEM_TEXT: Record<MessageProblem, { bg: string; en: string }> = {
  bg: { bg: "Напишете съобщението на български (поне 3 знака).", en: "Write the message in Bulgarian (3 characters at least)." },
  long: { bg: `Съобщението е твърде дълго (до ${MESSAGE_MAX} знака на език).`, en: `The message is too long (up to ${MESSAGE_MAX} characters per language).` },
  // a second press, a resent form, the same message to the same organisation just now (review)
  twice: { bg: "Това съобщение вече е изпратено — не го пращаме втори път.", en: "This message has been sent already — it is not sent a second time." },
};

/** Every message ends by saying it is one-way — questions go by e-mail (Реш. 54, 116). */
export const MESSAGE_FOOTER = {
  bg: "Това е еднопосочно съобщение от PTS Bulgaria — на него не може да се отговори в портала. За въпроси пишете на office@ptsbg.eu.",
  en: "This is a one-way message from PTS Bulgaria — it cannot be answered in the portal. For questions, write to office@ptsbg.eu.",
};

/** The notice's text: the message, a blank line, the footer. */
export const messageText = (text: string, lang: "bg" | "en") => `${text}\n\n${MESSAGE_FOOTER[lang]}`;

/** A notice's message without its footer — for a history, and for the e-mail that carries a text
 *  given in Bulgarian only once (review). */
export const messageBody = (notice: string, lang: "bg" | "en") => { const tail = `\n\n${MESSAGE_FOOTER[lang]}`; return notice.endsWith(tail) ? notice.slice(0, -tail.length) : notice; };

/** A scheme's record of the messages its people sent (history; the round export) — appended. */
export interface SchemeMessage {
  id: string;
  /** the form's one-time token — a second press of the same form sends nothing (review) */
  nonce?: string;
  at: string;
  /** the writer — a person at PTS */
  by: string;
  /** by the participation's id — its code is read when shown: the coding act re-keys codes (5.3) */
  to: { kind: "all"; count: number; participantIds: string[]; missed?: string[] } | { kind: "participation"; participantId: string };
  bg: string;
  en: string;
}

/** How a message's target reads in its history — the codes as they are now. */
export function messageTargetLabel(to: SchemeMessage["to"], lang: "bg" | "en", codeOf: (participantId: string) => string): string {
  if (to.kind === "all") {
    const missed = (to.missed ?? []).map(codeOf);
    const base = lang === "bg" ? `до всички участия (${to.count})` : `to every participation (${to.count})`;
    return missed.length ? `${base}${lang === "bg" ? ` — не стигна до: ${missed.join(", ")}` : ` — did not reach: ${missed.join(", ")}`}` : base;
  }
  return lang === "bg" ? `до ${codeOf(to.participantId)}` : `to ${codeOf(to.participantId)}`;
}

/** Did this message go to this participation — to it alone, or to everyone with it among them? */
export const messageReached = (m: SchemeMessage, participantId: string): boolean =>
  m.to.kind === "participation" ? m.to.participantId === participantId : m.to.participantIds.includes(participantId) && !(m.to.missed ?? []).includes(participantId);

/** The warning beside the composer: the message goes with the code — no laboratory's name in it (§4.2). */
export const MESSAGE_WARNING = {
  bg: "Съобщението стига до хората на участието по имейл и в портала. Не пишете имена на лаборатории — то се пази при кода.",
  en: "The message reaches the participation's people by e-mail and in the portal. Write no laboratory's name — it is kept with the code.",
};

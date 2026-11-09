// The declaration and the acknowledgements (plan part 5.9; PTS's answers К12, К13 — Реш. 117,
// 118). Pure: no imports from the store, safe for pages, actions and tests alike.
//
// Реш. 118: Ф 4.2-2 is signed by a tick in the portal, «записана с акаунт, дата, час и
// текста на конкретната редакция» — the record names the account, the day and the hour,
// and the edition: its number, its id and the hash of its frozen file (3.0), which IS the
// text signed. A scanned copy only if the participant wishes.
// Реш. 117: any document may «изисква потвърждение» — the acknowledgement recorded with the
// account, the date and the edition's number, and it NEVER blocks the participant's work.
//
import { fmtMoment } from "./scheme-dates";

// Per participation and per edition: any user of the participation may give it, the record
// says who; a new edition asks again, and the earlier record stays.

/** The document signed by its tick — it always asks, no setting needed (Реш. 118). */
export const DECLARATION = "declaration";

export type AckKind = "ack" | "declaration";

export interface Acknowledgement {
  id: string;
  participantId: string;
  docKey: string;
  kind: AckKind;
  /** the edition acknowledged — absent only for a release from before editions (3.0) */
  editionId?: string;
  editionNo?: number;
  /** the declaration: the sha-256 of the frozen edition's file in the language shown — the text signed */
  sha?: string;
  lang?: "bg" | "en";
  /** ISO — the day and the hour, on the round's clock */
  at: string;
  /** the account: the participant user's actor */
  by: string;
}

export interface AckSetting { at: string; by: string }

export interface AckScheme {
  ackRequired?: Record<string, AckSetting>;
  acknowledgements?: Acknowledgement[];
}

export const kindOf = (docKey: string): AckKind => (docKey === DECLARATION ? "declaration" : "ack");

/** Does this document ask the participations to acknowledge it? The declaration always. */
export const ackRequiredFor = (s: AckScheme, docKey: string): boolean => docKey === DECLARATION || !!s.ackRequired?.[docKey];

/** May the setting be changed for this document? Not for the declaration — it always asks. */
export const ackSettable = (docKey: string): boolean => docKey !== DECLARATION;

/** The edition a record stands for — by its id; a release from before editions by «none». */
const editionKey = (editionId?: string) => editionId ?? "";

/** This participation's record for THIS edition of the document, or null. */
export function ackOf(s: AckScheme, participantId: string, docKey: string, editionId?: string): Acknowledgement | null {
  const k = editionKey(editionId);
  return (s.acknowledgements ?? []).find((a) => a.participantId === participantId && a.docKey === docKey && editionKey(a.editionId) === k) ?? null;
}

/** Every record of this participation, the latest first. */
export const acksOfParticipation = (s: AckScheme, participantId: string): Acknowledgement[] =>
  (s.acknowledgements ?? []).filter((a) => a.participantId === participantId).sort((a, b) => b.at.localeCompare(a.at));

export interface ReachingDoc { key: string; editionId?: string; editionNo?: number }

/** The documents reaching this participation that ask for an acknowledgement it has not given
 *  for the edition it holds — what «Начало» lists. Never a block (Реш. 117). */
export function pendingAcks<D extends ReachingDoc>(s: AckScheme, participantId: string, docs: readonly D[]): D[] {
  return docs.filter((d) => ackRequiredFor(s, d.key) && !ackOf(s, participantId, d.key, d.editionId));
}

/** Per document: of the participations it reaches, how many acknowledged the edition each holds. */
export function ackCounts(s: AckScheme, docKey: string, reaching: readonly { participantId: string; editionId?: string }[]): { done: number; of: number } {
  return { done: reaching.filter((r) => !!ackOf(s, r.participantId, docKey, r.editionId)).length, of: reaching.length };
}

export type AckProblem = "tick" | "not-reaching" | "not-asked" | "edition" | "twice" | "state" | "open-first" | "failed";

/** The declaration's tick must be on; an acknowledgement needs nothing more than the press. */
export function readAckForm(docKey: string, tick: unknown): { ok: true } | { ok: false; problem: AckProblem } {
  if (docKey === DECLARATION && !(tick === "on" || tick === "1" || tick === "yes" || tick === true)) return { ok: false, problem: "tick" };
  return { ok: true };
}

export const ACK_PROBLEM_TEXT: Record<AckProblem, { bg: string; en: string }> = {
  tick: { bg: "Отбележете, че сте прочели декларацията и я подписвате.", en: "Tick that you have read the declaration and sign it." },
  "not-reaching": { bg: "Този документ не е предоставен на участието.", en: "This document has not been released to the participation." },
  "not-asked": { bg: "За този документ не се иска потвърждение.", en: "This document asks for no acknowledgement." },
  edition: { bg: "Междувременно е издадена нова редакция — погледнете я и потвърдете нея.", en: "A new edition was issued meanwhile — look at it and acknowledge that one." },
  twice: { bg: "Тази редакция вече е потвърдена за участието.", en: "This edition is already acknowledged for the participation." },
  state: { bg: "Участието не е в ход — няма какво да се потвърждава.", en: "The participation is not going on — there is nothing to acknowledge." },
  // a release from before editions (3.0): its edition is kept on the first opening — what is
  // acknowledged or signed is always a frozen edition, never an unknown text (review)
  "open-first": { bg: "Първо отворете документа — после го потвърдете.", en: "Open the document first — then acknowledge it." },
  failed: { bg: "Не успяхме да запишем текста на редакцията — нищо не е записано. Опитайте отново.", en: "The edition's text could not be recorded — nothing was saved. Try again." },
};

/** The words of the declaration's tick — the edition named, so the record and the screen agree. */
export function declarationWords(lang: "bg" | "en", editionNo: number | undefined, day: string | undefined): string {
  const ed = editionNo ? (lang === "bg" ? `, редакция № ${editionNo}${day ? ` от ${day}` : ""}` : `, edition No. ${editionNo}${day ? ` of ${day}` : ""}`) : "";
  return lang === "bg"
    ? `Прочетох Декларацията за конфиденциалност (Ф 4.2-2)${ed}, и я подписвам от името на участието.`
    : `I have read the Confidentiality Declaration (F 4.2-2)${ed}, and sign it on behalf of the participation.`;
}

/** How a record names itself: «потвърдено на 10.11.2026, 14:05» / «подписана …». */
export function ackDone(lang: "bg" | "en", kind: AckKind, dayTime: string): string {
  if (kind === "declaration") return lang === "bg" ? `Подписана на ${dayTime}` : `Signed on ${dayTime}`;
  return lang === "bg" ? `Потвърдено на ${dayTime}` : `Acknowledged on ${dayTime}`;
}

/** A record's moment as a person in Bulgaria reads it — the day AND the hour on Sofia's clock
 *  (lib/scheme-dates fmtMoment): «10.11.2026, 00:30». Never the UTC day (review). */
export const ackMoment = fmtMoment;

/** Acknowledgements given against documents sent to ONE user (a release at the user level,
 *  5.4) — counted apart: which participation a user's personal release reaches is that user's,
 *  known only when they act (review). */
export function personalAcks(s: AckScheme & { releases?: readonly { docKey: string; level: string; editionId: string; withdrawnAt?: string }[] }, docKey: string): number {
  const personal = new Set((s.releases ?? []).filter((r) => r.docKey === docKey && r.level === "user" && !r.withdrawnAt).map((r) => r.editionId));
  return new Set((s.acknowledgements ?? []).filter((a) => a.docKey === docKey && !!a.editionId && personal.has(a.editionId)).map((a) => a.participantId)).size;
}

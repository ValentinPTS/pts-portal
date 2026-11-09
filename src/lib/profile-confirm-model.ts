// A profile from a PDF application (plan part 4.4, Реш. 145). Pure.
//
// In the transitional period PTS keeps the PDF application and enters the profile
// itself — the legal entity, its laboratories, its users (4.1–4.3), «произход: заявка
// в PDF». The invitation (1.8) goes to the users. A user sets a password; the
// profile's ADMINISTRATOR reviews the data, completes it and confirms it — once, the
// date and who on record. From that date the data is the laboratory's.
//
// What the laboratory completes here — what PTS may not have had from the PDF, or what
// is the laboratory's to keep: the address for correspondence, the МОЛ, the language;
// each laboratory's name as on its certificate, its delivery address, the «мобилен
// офис» mark and its accreditation number; and a user's own name, position and phone.
// What it does NOT change here: the name of the legal entity, its country, ЕИК and VAT
// number — PTS checked those (VIES or a document, and its own tick, 4.1) — nor the
// OFFICIAL E-MAIL: PTS enters it from the PDF application before it invites anyone,
// and the notice of the confirmation goes there (К23) — never to an address the
// confirming person types (4.4 review). A correction goes to PTS, which checks it.
//
// At the confirmation: the notice to the official e-mail (К23) and the link to the
// privacy section M4 (Реш. 152) — on the page, and in the notice.

import { readLaboratory, type Laboratory, type LaboratoryProblem } from "./laboratories-model";
import { ENTITY_LIMITS, type LegalEntity } from "./entities-model";
import { readEntityUser, type EntityUser } from "./entity-users-model";

export type CompletionProblem = "address" | "official-email-required" | "mol" | "language" | "lab" | "own" | "confirm-tick";

export interface Completion {
  entity: Pick<LegalEntity, "correspondenceAddress" | "mol" | "language"> | null;
  laboratories: { id: string; fields: Pick<Laboratory, "name" | "deliveryAddress" | "mobileOffice" | "accreditationNo" | "accreditationBody"> }[];
  own: Pick<EntityUser, "name" | "position" | "phone" | "receivesNotices">;
}

const clean = (v: unknown) => String(v ?? "").replace(/[\u0000-\u001F\u007F-\u009F​-‏﻿�]/g, " ").replace(/\s+/g, " ").trim();
const ticked = (v: unknown) => v === true || v === "on" || v === "1" || v === "true";

/** Read what the laboratory typed. An administrator completes the entity and its
 *  laboratories (only the laboratories of ITS entity — `labIds`); every user their own
 *  name, position and phone. `confirm`: the administrator's tick is then required. */
export function readCompletion(
  input: Record<string, unknown>,
  o: { admin: boolean; labIds: readonly string[]; confirm: boolean },
): { ok: true; value: Completion } | { ok: false; problem: CompletionProblem; lab?: string; labProblem?: LaboratoryProblem } {
  let entity: Completion["entity"] = null;
  const laboratories: Completion["laboratories"] = [];
  if (o.admin) {
    const correspondenceAddress = clean(input.correspondenceAddress);
    if (!correspondenceAddress || [...correspondenceAddress].length > ENTITY_LIMITS.address) return { ok: false, problem: "address" };
    const mol = clean(input.mol);
    if ([...mol].length > ENTITY_LIMITS.mol) return { ok: false, problem: "mol" };
    const language = clean(input.language) || "bg";
    if (language !== "bg" && language !== "en") return { ok: false, problem: "language" };
    entity = { correspondenceAddress, mol, language };
    for (const id of o.labIds) {
      const r = readLaboratory({
        name: input[`lab_${id}_name`], deliveryAddress: input[`lab_${id}_deliveryAddress`],
        mobileOffice: input[`lab_${id}_mobileOffice`], accreditationNo: input[`lab_${id}_accreditationNo`], accreditationBody: input[`lab_${id}_accreditationBody`],
      });
      if (!r.ok) return { ok: false, problem: "lab", lab: id, labProblem: r.problem };
      laboratories.push({ id, fields: r.fields });
    }
  }
  // the user's own: read as 4.3 reads a user (the login, role and two-step are PTS's —
  // not changed here)
  const own = readEntityUser({ email: "own@example.org", name: input.ownName, position: input.ownPosition, phone: input.ownPhone, role: "user", twoFactorRequired: false });
  if (!own.ok) return { ok: false, problem: "own" };
  if (o.confirm && o.admin && !ticked(input.confirmTick)) return { ok: false, problem: "confirm-tick" };
  // receives the notices by e-mail (4.6): the user's own to say
  return { ok: true, value: { entity, laboratories, own: { name: own.fields.name, position: own.fields.position, phone: own.fields.phone, receivesNotices: ticked(input.ownReceivesNotices) } } };
}

export const COMPLETION_PROBLEM_TEXT: Record<CompletionProblem, { bg: string; en: string }> = {
  address: { bg: "адресът за кореспонденция е задължителен, до 300 знака", en: "the address for correspondence is required, 300 characters at most" },
  "official-email-required": { bg: "няма официален e-mail на организацията — PTS го въвежда от заявката; пишете на office@ptsbg.eu", en: "the organisation has no official e-mail — PTS enters it from the application; write to office@ptsbg.eu" },
  mol: { bg: "МОЛ е до 120 знака", en: "the МОЛ is 120 characters at most" },
  language: { bg: "езикът е български или английски", en: "the language is Bulgarian or English" },
  lab: { bg: "данните на една от лабораториите не се разчитат", en: "one of the laboratories' data does not read" },
  own: { bg: "вашето име е задължително; длъжността до 120 знака; телефонът да се разчита", en: "your name is required; the position 120 characters at most; the phone must read" },
  "confirm-tick": { bg: "отбележете, че сте прегледали данните и са верни", en: "tick that you have reviewed the data and it is right" },
};

/** The privacy section M4 (Реш. 152): its address, as PTS publishes it
 *  (NEXT_PUBLIC_PRIVACY_URL — an https address); null until it is set. */
export function privacyUrl(env: Record<string, string | undefined> = process.env): string | null {
  const v = (env.NEXT_PUBLIC_PRIVACY_URL ?? "").trim();
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password ? u.toString() : null;
  } catch {
    return null;
  }
}

/** A date as the notice and the page say it: DD.MM.YYYY, the day in Sofia. */
export const confirmDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sofia", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}.${p.month}.${p.year}`;
};

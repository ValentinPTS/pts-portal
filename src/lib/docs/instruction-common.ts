// What every Instruction for participants (Ф 7.3.5-1) shares (plan part 3.11).
//   - its contacts come from the scheme's TEAM (N19) — never names written into the
//     template: the scheme manager, and for a calibration scheme its technical expert;
//     with nobody in that role, a mark to fill — never the first name on the team;
//   - Реш. 150: «Изпитването не започва без писмени указания» is a general rule in the
//     template. The portal says it as information and never blocks.
// Both are put in again when a saved Instruction is printed (`refreshInstruction`) —
// a body saved in the editor keeps neither the team as it is now nor the sentence
// (3.11 review).
import type { Scheme, Lang } from "../types";
import { esc, pick } from "../doc-css";
import { fillMark, replaceBlocks } from "../fill-mark";

type Member = Scheme["team"][number];
// the role by its own name first («Ръководител на схемата», «PT Scheme Manager»); the
// looser word only when no one carries it — «Технически ръководител», «Quality
// Manager» are not the scheme's manager (review)
const ROLE: Record<"manager" | "technical", RegExp[]> = {
  manager: [/ръководител на (рт )?схемата|scheme manager/i, /^(?!.*(технически|quality|data|deputy|заместник)).*(ръководител|manager)/i],
  technical: [/технически експерт|technical expert/i],
};
export function teamMember(s: Pick<Scheme, "team">, which: "manager" | "technical"): Member | undefined {
  const team = s.team ?? [];
  for (const re of ROLE[which]) { const m = team.find((x) => re.test(x.roleBg) || re.test(x.roleEn)); if (m) return m; }
  return undefined;
}

const PHONE = { T: "0897 50 39 80", C: "00359 897 50 39 80" } as const;
const EMAIL = "office@ptsbg.eu";

/** The Instruction's contacts: the people from the team (a mark for a role nobody
 *  holds), the provider's telephone and e-mail. */
export function instructionContacts(s: Pick<Scheme, "team" | "type">, lang: Lang): string {
  const roles: ("manager" | "technical")[] = s.type === "C" ? ["manager", "technical"] : ["manager"];
  const people = roles.map((r) => {
    const m = teamMember(s, r);
    if (m) return `<div class="person"><div class="nm">${esc(m.name)}</div><div class="ro">${esc(pick(lang, m.roleEn, m.roleBg))}</div></div>`;
    return `<div class="person">${fillMark(lang, r === "manager" ? { bg: "ръководителят на схемата (екипът на схемата)", en: "the scheme manager (the scheme team)" } : { bg: "техническият експерт (екипът на схемата)", en: "the technical expert (the scheme team)" })}</div>`;
  }).join("");
  return `<div class="contacts" data-team-contacts>
    ${people}
    <div class="cline">📞 ${PHONE[s.type === "C" ? "C" : "T"]}</div>
    <div class="cline">✉ ${EMAIL}</div>
  </div>`;
}

/** The scheme's team as a document shows it (the plan's §2, M1's team point) — escaped. */
export function teamBlock(s: Pick<Scheme, "team">, lang: Lang): string {
  return `<div class="team">${(s.team ?? []).map((m) => `<div class="role"><span class="rl">${esc(pick(lang, m.roleEn, m.roleBg))}</span><span class="nm">${esc(m.name)}</span></div>`).join("")}</div>`;
}
/** A saved body's team as the scheme's team is NOW (round 7 verification, R7UP-4: a plan saved in the editor
 *  kept the team it was started with; changing the team in «Редактирай данните» changed only the Instruction).
 *  Anything a person added inside the block (not a person's row) is kept after it. */
export function refreshTeam(html: string, s: Pick<Scheme, "team">, lang: Lang): string {
  if (!html || !/<div\b[^>]*\bclass="team"/.test(html)) return html;
  return replaceBlocks(html, /<div\b[^>]*\bclass="team"[^>]*>/, "div", (old) => {
    const inner = old.replace(/^<div\b[^>]*>/, "").replace(/<\/div>\s*$/, "");
    const rest = replaceBlocks(inner, /<div\b[^>]*\bclass="role"[^>]*>/, "div", () => "").trim();
    return teamBlock(s, lang) + (/<(?:img|table|svg|math)\b/i.test(rest) || rest.replace(/<[^>]+>/g, "").replace(/&nbsp;|\u00A0/g, " ").trim() ? rest : "");
  });
}

/** Реш. 150 — a text for PTS to carry into the template under П 8.3. */
export const WRITTEN_INSTRUCTIONS = {
  testing: {
    bg: "Изпитването не започва без писмени указания: участникът започва изпитването едва след като е получил настоящата Инструкция.",
    en: "Testing does not start without written instructions: the participant starts testing only after receiving these Instructions.",
  },
  calibration: {
    bg: "Калибрирането не започва без писмени указания: участникът започва калибрирането едва след като е получил настоящата Инструкция.",
    en: "Calibration does not start without written instructions: the participant starts calibrating only after receiving these Instructions.",
  },
};
export const writtenInstructions = (type: "T" | "C") => (type === "C" ? WRITTEN_INSTRUCTIONS.calibration : WRITTEN_INSTRUCTIONS.testing);
export function writtenInstructionsNote(lang: Lang, calibration: boolean): string {
  const t = calibration ? WRITTEN_INSTRUCTIONS.calibration : WRITTEN_INSTRUCTIONS.testing;
  return `<div class="body"><div class="note" data-written-instructions><b>${esc(pick(lang, t.en, t.bg))}</b></div></div>`;
}

/** What a person added inside a saved contacts block — everything but its people and its 📞/✉ lines. */
export function addedInContacts(block: string): string {
  const inner = block.replace(/^<div\b[^>]*>/, "").replace(/<\/div>\s*$/, "");
  let kept = replaceBlocks(inner, /<div\b[^>]*\bclass="person"[^>]*>/, "div", () => "");
  kept = replaceBlocks(kept, /<div\b[^>]*\bclass="cline"[^>]*>/, "div", (line) => {
    const words = line.replace(/<[^>]+>/g, "").replace(/&nbsp;|\u00A0/g, " ").trim();
    // the generated line itself is dropped; words typed onto its end are kept, as a paragraph
    const extra = words.replace(/^(?:📞\s*[0-9 ]+|✉\s*\S+@\S+)/u, "").trim();
    return extra ? `<p>${line.replace(/^<div\b[^>]*>/, "").replace(/<\/div>$/, "").replace(/^\s*(?:📞\s*[0-9 ]+|✉\s*[^\s<]+@[^\s<]+)/u, "")}</p>` : "";
  });
  return /<(?:img|table|svg|math)\b/i.test(kept) || kept.replace(/<[^>]+>/g, "").replace(/&nbsp;|\u00A0/g, " ").trim() ? kept.trim() : "";
}

/** A saved Instruction printed: its contacts from the team as it is now, and the
 *  Реш. 150 sentence where the body has none (3.11 review). */
export function refreshInstruction(html: string, s: Pick<Scheme, "team" | "type">, lang: Lang): string {
  if (!html) return html;
  // anything a person added inside the block (a sentence, a picture — the caret at the document's end sat in
  // it) is kept after it: only the people and the two contact lines are the team's (round 6, R6UP-4)
  let out = replaceBlocks(html, /<div\b[^>]*\bclass="contacts"[^>]*>/, "div", (old) => instructionContacts(s, lang) + addedInContacts(old));
  // …and put back when it is gone (a Backspace took it whole — round 7, R7UP-2): under «Контакти», or at the end
  if (!/<div\b[^>]*\bclass="contacts"/.test(out)) {
    const h = /<h[1-6]\b[^>]*>(?:(?!<\/h[1-6]>)[\s\S]){0,200}?(?:Контакти|Contacts)(?:(?!<\/h[1-6]>)[\s\S]){0,80}<\/h[1-6]>(?:\s*<div class="body">)?/i.exec(out);
    out = h ? out.slice(0, h.index + h[0].length) + instructionContacts(s, lang) + out.slice(h.index + h[0].length) : out + instructionContacts(s, lang);
  }
  if (!out.includes("data-written-instructions")) out = writtenInstructionsNote(lang, s.type === "C") + out;
  return out;
}

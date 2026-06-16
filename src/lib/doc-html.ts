import type { Scheme, Lang, Participant, DocOptions } from "./types";
import { esc, pick, wrapDoc, cover, footer } from "./doc-shell";
import { LIBRARY, FIELDS, renderFieldHtml } from "./blocks";
import { docDefaultBody } from "./doc-template";

// The live participant list → the option shape the document renderers expect.
function toOpts(participants: Participant[]): DocOptions {
  return {
    participants: participants.map((p) => ({
      code: p.code, labName: p.labName, country: p.country, contact: p.contact,
      email: p.email, phone: p.phone, deliveryAddress: p.deliveryAddress, participations: p.participations,
    })),
  };
}

// Bridges the faithful document renderers into the HTML the Word-like editor
// edits, and exposes the insert-panel items (fields + snippets).

// The Default-template content as editor HTML, both languages — the faithful
// body of the real document (its cover/head + footer are re-applied on export).
export function defaultDocHtml(s: Scheme, docKey: string, participants: Participant[] = []): { bg: string; en: string } {
  const opts = toOpts(participants);
  return {
    bg: docDefaultBody(s, docKey, "bg", opts),
    en: docDefaultBody(s, docKey, "en", opts),
  };
}

// Wrap the editor's body HTML in the branded document (cover/head page + footer).
export function wrapForPrint(s: Scheme, bodyHtml: string, lang: Lang, titleEn: string, titleBg: string): string {
  const inner = cover(s, lang, titleEn, titleBg, { withImage: true }) + `<div class="body">${bodyHtml}</div>` + footer(s, "draft");
  return wrapDoc(lang, `${s.number} — ${pick(lang, titleEn, titleBg)}`, inner);
}

// Items for the right-hand insert panel — HTML ready to drop at the cursor (both langs).
export function insertableSnippets(): { id: string; name: string; bg: string; en: string }[] {
  return LIBRARY.map((e) => ({ id: e.id, name: e.name, bg: `<p>${esc(e.bg)}</p>`, en: `<p>${esc(e.en)}</p>` }));
}
export function insertableFields(s: Scheme, participants: Participant[] = []): { key: string; label: string; bg: string; en: string }[] {
  return FIELDS.map((f) => ({
    key: f.key,
    label: f.en,
    bg: renderFieldHtml(s, f.key, "bg", participants),
    en: renderFieldHtml(s, f.key, "en", participants),
  }));
}

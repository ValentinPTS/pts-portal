// The edition core (plan part 3.0; Реш. 50; Zadanie §3–4): the rules, pure — no
// imports, safe for pages, actions and tests alike.
//
// «Изпратен документ не се подменя тихо. При промяна се издава нова редакция с номер,
// причина и обхват, записва се коя редакция на кого е предоставена, и всяка редакция
// се замразява като файл.» A document of a scheme therefore has EDITIONS: № 1, 2, 3 …
// each with its date, its change note (why, and what it covers) and the file it was at
// that moment — frozen, never overwritten (migration 0029, lib/editions.ts). What the
// participants hold is an edition; a change reaches them only as the next one.
//
// Release levels, the record of who received which edition, and the download log are
// part 5.4, on top of this.

/** The documents that have no editions: the three lists (Ф 7.2.1-4, -5, -6) and the
 *  certificate. They are records drawn from live data, not documents written and
 *  issued — and three of them name laboratories, which live only in the identity
 *  store (2.3), every opening on record; a frozen copy would be names outside it.
 *  The certificate has its own number and is issued to one laboratory (0.15).
 *  (lib/documents: LIST_DOCS and the certificate — scripts/editions.test.ts.) */
export const EDITIONLESS: ReadonlySet<string> = new Set(["registered", "registered-coded", "results-coded", "certificate"]);
export const hasEditions = (docKey: string): boolean => !EDITIONLESS.has(docKey);

export const MIN_REASON = 5;
export const MAX_NOTE = 1000;
/** Edition 1 needs no reason of its own: it is the first. */
export const FIRST_REASON = "Първа редакция";

const chars = (s: string) => [...s].length; // code points: «я» is one, as a person counts

export type NoteProblem = "reason" | "too-long";

/** The change note of edition `no`: the reason (why) and the scope (what it covers).
 *  From edition 2 on the reason is required — a change is never silent. */
export function checkNote(no: number, reason: unknown, scope: unknown): { ok: true; reason: string; scope: string } | { ok: false; problem: NoteProblem } {
  const r = String(reason ?? "").trim();
  const sc = String(scope ?? "").trim();
  if (chars(r) > MAX_NOTE || chars(sc) > MAX_NOTE) return { ok: false, problem: "too-long" };
  if (no <= 1) return { ok: true, reason: r || FIRST_REASON, scope: sc };
  if (chars(r) < MIN_REASON) return { ok: false, problem: "reason" };
  return { ok: true, reason: r, scope: sc };
}

/** yyyy-mm-dd → dd.mm.yyyy, as PTS's documents write a date. */
export const fmtDay = (day: string): string => (/^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}` : day);

/** «Редакция № 2 от 05.11.2026» — how an edition names itself. */
export function editionLabel(lang: "bg" | "en", no: number, day: string): string {
  return lang === "bg" ? `Редакция № ${no} от ${fmtDay(day)}` : `Edition No. ${no} of ${fmtDay(day)}`;
}

const FOOTER_OPEN = '<div class="docfooter">';

/** The frozen file says which edition it is: the label joins the document's own footer
 *  line (revision · form · date — the FORM's revision in PTS's system, not this) in the
 *  skin's last footer; a document without one gets the label as its footer. The HTML is
 *  otherwise untouched, so the same document stamped with the same edition is the same
 *  bytes — which is how an unchanged document is recognised (lib/editions sameAs). */
export function stampEdition(html: string, lang: "bg" | "en", no: number, day: string, amendment?: string): string {
  // an amended plan or invitation also names its amendment and the edition it replaces
  // (part 3.3; Zadanie §3) — text the portal composed, escaped all the same
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const mark = `<span class="doc-edition">${editionLabel(lang, no, day)}</span>${amendment ? ` · <span class="doc-amendment">${esc(amendment)}</span>` : ""}`;
  const at = html.lastIndexOf(FOOTER_OPEN);
  if (at !== -1) {
    const start = at + FOOTER_OPEN.length;
    const end = html.indexOf("</div>", start);
    if (end !== -1) {
      const line = html.slice(start, end);
      return html.slice(0, start) + (line.trim() ? `${line} · ${mark}` : mark) + html.slice(end);
    }
  }
  const foot = `${FOOTER_OPEN}${mark}</div>`;
  const body = html.toLowerCase().lastIndexOf("</body>");
  return body === -1 ? html + foot : html.slice(0, body) + foot + html.slice(body);
}

/** The next edition's number after the latest one (none: 1). */
export const nextEditionNo = (latest: { no: number } | null | undefined): number => (latest?.no ?? 0) + 1;

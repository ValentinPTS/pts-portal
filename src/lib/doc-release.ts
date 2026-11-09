// ─────────────────────────────────────────────────────────────────────────────
// RELEASING documents to participants.
//
// Uploading a document tells nobody. Sending is a separate, deliberate act: the
// owner presses "Изпрати на участниците" and only then can a laboratory fetch the
// file. That is the clear line the provider asked for — he keeps writing his
// documents in Word and exporting PDF, uploads the PDF here, and decides himself
// when it goes out. Nothing about it is automatic and nothing about it is timed.
//
// PURE module (no next/supabase imports) so the gate is unit-testable.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The documents that may ever be released to participants.
 *
 * Everything absent from this list is internal and can never reach a laboratory,
 * whatever the owner clicks:
 *   • order, stat-project — the provider's own planning papers (his words:
 *     "the stat project nobody sees it and the заповед also nobody sees it"). The plan
 *     was here too until D15 (5.4): the assignment makes it public for a started
 *     scheme, prices included, and readable before applying.
 *   • registered, registered-coded, results-coded — the participant registers.
 *     §4.2: these hold the whole cohort, and one of them maps names to codes.
 *   • application — the заявка is a public form at /apply, not a handout.
 *
 * report and certificate are deliberately NOT here either. They are ISSUED, not
 * sent: the report opens when the round reaches "report", and a certificate opens
 * for the one laboratory it was issued to. Different act, different gate.
 */
export const SENDABLE_DOCS: string[] = [
  "plan",         // План на схемата — public for a started scheme, readable before applying (D15, 5.4)
  "invitation",   // Покана за участие
  "declaration",  // Декларация за конфиденциалност (C — labs sign and return it)
  "protocol",     // Протокол за получаване
  "instruction",  // Инструкция за участниците
  "results",      // Лист за резултати
  "feedback",     // Обратна връзка
];

export const isSendableDoc = (key: string): boolean => SENDABLE_DOCS.includes(key);

// ─────────────────────────────────────────────────────────────────────────────
// Documents the provider sends to ONE laboratory rather than to all of them.
//
// SENDABLE_DOCS above are cohort documents: one file, everybody gets the same
// one. These are the opposite — one file per participation, stored under the
// participant code (scheme.labDocs[code][slot]). Today there is one: the proforma
// invoice, whose amount and payee differ per lab.
//
// Because the file names the laboratory it is addressed to, it is the mirror of
// the lab's own uploads: reading or writing one crosses the code↔identity line,
// so both are manager-only on the provider side (§4.2), and on the lab side the
// slot is resolved from the session's own participation and never from the URL.
//
// There is no separate "send" step here. A cohort document is uploaded once and
// released once, so the two acts are worth separating; a per-lab document is
// already uploaded deliberately, for one named laboratory, one at a time — so
// putting it in the slot IS the act of sending it.
// ─────────────────────────────────────────────────────────────────────────────
export const LAB_DOC_SLOTS = {
  proforma: { bg: "Проформа фактура", en: "Proforma invoice" },
} as const;

export type LabDocSlot = keyof typeof LAB_DOC_SLOTS;

// hasOwnProperty, not `in`: `"toString" in LAB_DOC_SLOTS` is true, and this
// decides whether a string off the wire may address a storage slot.
export const isLabDocSlot = (slot: string): slot is LabDocSlot =>
  Object.prototype.hasOwnProperty.call(LAB_DOC_SLOTS, slot);

// ─────────────────────────────────────────────────────────────────────────────
// The cohort-name guard.
//
// The editor can insert a "Participants" field, which renders a table of CODE +
// LABORATORY NAME. That is right in the provider's own papers and catastrophic in
// a handout: an edited body is stored as already-rendered HTML, so the names are
// baked in and cannot be masked at serve time the way a freshly-rendered document
// can. Released bodies are therefore scanned, and such a table is replaced with a
// visible note before it reaches a laboratory.
//
// Visible, not silent. A provider under ISO 17043 has to know what his
// participants actually received: a laboratory seeing "this table was withheld"
// is honest, a laboratory seeing a document quietly one table shorter than the one
// he believes he sent is not. He is also warned at the moment he releases it.
//
// The signature is deliberately narrow — a header row naming BOTH a code column
// and a laboratory column, with at least one row under it. That is exactly what
// the participants field emits, and it does not match a blank form table that
// merely asks a laboratory to write its own name (those have no code column).
// It cannot catch names somebody typed in by hand as free prose; nothing can.
// ─────────────────────────────────────────────────────────────────────────────

const CODE_HEADER = /<th[^>]*>\s*(?:Код|Code)\s*<\/th>/i;
const NAME_HEADER = /<th[^>]*>\s*(?:Лаборатория|Laboratory)\s*<\/th>/i;
const HAS_ROW = /<tbody[^>]*>\s*<tr/i;

const isCohortNameTable = (table: string): boolean =>
  CODE_HEADER.test(table) && NAME_HEADER.test(table) && HAS_ROW.test(table);

/**
 * Walk the <table> elements of a body and hand each one to `fn`.
 *
 * Nesting is counted, so a table inside a table is never sliced in half, and each
 * table's CONTENTS are processed before the table itself. That order matters: a
 * participants table sitting inside a layout table must take only itself with it —
 * testing outside-in would match the outer table (it contains the inner one's
 * headers) and delete the whole layout with it.
 */
function mapTables(html: string, fn: (table: string) => string): string {
  const lower = html.toLowerCase();
  let out = "";
  let i = 0;
  for (;;) {
    const start = lower.indexOf("<table", i);
    if (start === -1) return out + html.slice(i);
    out += html.slice(i, start);
    let depth = 0;
    let j = start;
    let end = -1;
    for (;;) {
      const open = lower.indexOf("<table", j);
      const close = lower.indexOf("</table", j);
      if (close === -1) break; // unbalanced — leave the rest untouched
      if (open !== -1 && open < close) {
        depth++;
        j = open + 6;
      } else {
        depth--;
        j = close + 7;
        if (depth === 0) {
          const gt = html.indexOf(">", close);
          end = gt === -1 ? html.length : gt + 1;
          break;
        }
      }
    }
    if (end === -1) return out + html.slice(start);
    // innermost first: rebuild this table from its scrubbed contents, then test it
    const table = html.slice(start, end);
    const openEnd = html.indexOf(">", start);
    if (openEnd === -1 || openEnd >= end) return out + html.slice(start);
    const headLen = openEnd + 1 - start;
    const closeStart = table.lastIndexOf("</table");
    const rebuilt = closeStart > headLen
      ? table.slice(0, headLen) + mapTables(table.slice(headLen, closeStart), fn) + table.slice(closeStart)
      : table;
    out += fn(rebuilt);
    i = end;
  }
}

/** Does this saved body carry a participants table? Used to warn at release time. */
export function hasCohortNames(html: string): boolean {
  if (!html || !/<table/i.test(html)) return false;
  let found = false;
  mapTables(html, (t) => {
    if (isCohortNameTable(t)) found = true;
    return t;
  });
  return found;
}

// ── Portal-computed scores in a saved body (Реш. 135, plan part 0.6) ─────────
// The editor's «scores» field bakes the engine's z / ζ / Eₙ tables (with verdicts
// and assigned values), their charts and the "not official" note into a body as
// static HTML. None of it may reach a laboratory. The tables are recognised by a
// score header cell — ζ for testing, Eₙ for calibration — which no form a lab fills
// in carries; the charts by the engine's own class; the note by its class.
const SCORE_HEADER = /<th[^>]*>\s*(?:ζ|E<sub>n<\/sub>|Eₙ)\s*<\/th>/i;
const SCORE_CHART = /<svg class="chart"[\s\S]*?<\/svg>/gi;
const UNOFFICIAL_NOTE = /<p class="unofficial"[^>]*>[\s\S]*?<\/p>/gi;

/** Does this saved body carry portal-computed scores? Used to warn at release time. */
export function hasPortalScores(html: string): boolean {
  if (!html) return false;
  if (/<svg class="chart"/i.test(html) || /<p class="unofficial"/i.test(html)) return true;
  let found = false;
  if (/<table/i.test(html)) mapTables(html, (t) => { if (SCORE_HEADER.test(t)) found = true; return t; });
  return found;
}

/** Replace portal-computed score tables with a visible note; drop their charts. */
export function stripPortalScores(html: string, lang: "bg" | "en"): string {
  if (!html) return html;
  const note = lang === "bg"
    ? "[Оценките, изчислени от портала, не се предоставят на участниците. Официалните оценки са в окончателния доклад.]"
    : "[Scores computed by the portal are not provided to participants. The official scores are in the final report.]";
  const out = html.replace(SCORE_CHART, "").replace(UNOFFICIAL_NOTE, "");
  return /<table/i.test(out) ? mapTables(out, (t) => (SCORE_HEADER.test(t) ? `<p class="muted">${note}</p>` : t)) : out;
}

/** Replace any participants table with a visible note. Safe to call on any body. */
export function stripCohortNames(html: string, lang: "bg" | "en"): string {
  if (!html || !/<table/i.test(html)) return html;
  const note = lang === "bg"
    ? "[Списъкът на участниците е поверителен и не се предоставя на участващите лаборатории.]"
    : "[The participant list is confidential and is not provided to participating laboratories.]";
  return mapTables(html, (t) =>
    isCohortNameTable(t) ? `<p class="muted">${note}</p>` : t,
  );
}

export interface LabFetchContext {
  sent?: Record<string, string>; // scheme.sentToParticipants — docKey → ISO timestamp
  reported: boolean;             // the round reached report/closed
  hasCert: boolean;              // a certificate is issued for THIS participation
  // PTS uploaded the report FILE. The portal's own rendered report carries scores
  // the portal computed, which never reach a participant (Реш. 135, part 0.6) — so
  // a lab gets the report only as the file PTS issued.
  officialReport: boolean;
}

/**
 * May this laboratory fetch this document right now?
 *
 * The whole rule, in one place, for both the dashboard's buttons and the URL —
 * so a link can never outrun what the screen offers. It reads only what the
 * provider explicitly did (released it / reported the round / issued the
 * certificate), never anything inferred from dates or phase state.
 */
export function canLabFetchDoc(docKey: string, ctx: LabFetchContext): boolean {
  if (docKey === "report") return ctx.reported && ctx.officialReport;
  if (docKey === "certificate") return ctx.hasCert;
  return isSendableDoc(docKey) && !!ctx.sent?.[docKey];
}

/** The released documents, in the fixed order above — what a lab's list shows. */
export function releasedDocs(sent?: Record<string, string>): { key: string; at: string }[] {
  if (!sent) return [];
  return SENDABLE_DOCS.filter((k) => !!sent[k]).map((k) => ({ key: k, at: sent[k] }));
}

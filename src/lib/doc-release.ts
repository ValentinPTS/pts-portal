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
 *   • order, plan, stat-project — the provider's own planning papers (his words:
 *     "the stat project nobody sees it and the заповед also nobody sees it")
 *   • registered, registered-coded, results-coded — the participant registers.
 *     §4.2: these hold the whole cohort, and one of them maps names to codes.
 *   • application — the заявка is a public form at /apply, not a handout.
 *
 * report and certificate are deliberately NOT here either. They are ISSUED, not
 * sent: the report opens when the round reaches "report", and a certificate opens
 * for the one laboratory it was issued to. Different act, different gate.
 */
export const SENDABLE_DOCS: string[] = [
  "invitation",   // Покана за участие
  "declaration",  // Декларация за конфиденциалност (C — labs sign and return it)
  "protocol",     // Протокол за получаване
  "instruction",  // Инструкция за участниците
  "results",      // Лист за резултати
  "feedback",     // Обратна връзка
];

export const isSendableDoc = (key: string): boolean => SENDABLE_DOCS.includes(key);

export interface LabFetchContext {
  sent?: Record<string, string>; // scheme.sentToParticipants — docKey → ISO timestamp
  reported: boolean;             // the round reached report/closed
  hasCert: boolean;              // a certificate is issued for THIS participation
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
  if (docKey === "report") return ctx.reported;
  if (docKey === "certificate") return ctx.hasCert;
  return isSendableDoc(docKey) && !!ctx.sent?.[docKey];
}

/** The released documents, in the fixed order above — what a lab's list shows. */
export function releasedDocs(sent?: Record<string, string>): { key: string; at: string }[] {
  if (!sent) return [];
  return SENDABLE_DOCS.filter((k) => !!sent[k]).map((k) => ({ key: k, at: sent[k] }));
}

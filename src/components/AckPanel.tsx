import { setAckRequiredAction } from "@/lib/actions";

// «Потвърждения» on the scheme's page (plan part 5.9; Реш. 117, 118): per document, whether it
// asks the participations to acknowledge it, and how many of those it reaches have done so for
// the edition each holds. The declaration Ф 4.2-2 always asks — it is signed by its tick. Who
// edits the scheme sets the others; clearing a setting keeps every record. Counts only — no
// participation is named here, by code or otherwise. Never a block for anyone.

export interface AckRow {
  key: string;
  name: string;
  required: boolean;
  settable: boolean;
  done: number;
  of: number;
  /** acknowledged against a document sent to one user (5.4) — counted apart */
  personal: number;
}

export default function AckPanel({ schemeId, lang, rows, canEdit, started, notice }: { schemeId: string; lang: "bg" | "en"; rows: AckRow[]; canEdit: boolean; started: boolean; notice?: string }) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  return (
    <section id="acknowledgements" className="card p-4 mt-3" data-ack-panel>
      <h2 className="font-bold" style={{ color: "var(--green-dark)", fontSize: 15, margin: 0 }}>{L("Потвърждения от участниците", "Acknowledgements from the participants")}</h2>
      <p className="text-sm mt-1" style={{ color: "var(--muted)", maxWidth: 760 }}>
        {L("Документ с «изисква потвърждение» иска от всяко участие да потвърди, че се е запознало с редакцията, която държи. Записват се акаунтът, датата и редакцията; нищо не спира (Реш. 117). Декларацията Ф 4.2-2 винаги се подписва с отметка (Реш. 118). Нова редакция иска ново потвърждение.",
          "A document set to «asks for acknowledgement» asks each participation to acknowledge the edition it holds. The account, the date and the edition are recorded; nothing is held back (Реш. 117). The declaration F 4.2-2 is always signed by a tick (Реш. 118). A new edition asks again.")}
      </p>
      {notice === "on" || notice === "off" || notice === "doc" ? (
        <p role={notice === "doc" ? "alert" : "status"} data-ack-notice={notice} className="text-sm mt-2" style={{ color: notice === "doc" ? "#8a1f1f" : "var(--green-dark)" }}>
          {notice === "on" ? L("Записано: документът изисква потвърждение.", "Saved: the document asks for an acknowledgement.")
            : notice === "off" ? L("Записано: документът вече не изисква потвърждение. Направените потвърждения остават.", "Saved: the document no longer asks for an acknowledgement. The ones given stay.")
            : L("Този документ няма такава настройка.", "This document has no such setting.")}
        </p>
      ) : null}
      <div style={{ overflowX: "auto" }} className="mt-2">
        <table className="text-sm" style={{ borderCollapse: "collapse", minWidth: 520 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 12 }}>
              <th className="p-1">{L("Документ", "Document")}</th>
              <th className="p-1">{L("Изисква потвърждение", "Asks for acknowledgement")}</th>
              <th className="p-1">{L("Потвърдили", "Acknowledged")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} data-ack-row={r.key} data-ack-required={r.required ? "1" : "0"} data-ack-done={r.done} data-ack-of={r.of} style={{ borderTop: "1px solid var(--line)" }}>
                <td className="p-1">{r.name}</td>
                <td className="p-1">
                  {!r.settable ? (
                    <span>{L("винаги — подписва се с отметка", "always — signed by a tick")}</span>
                  ) : canEdit ? (
                    <form action={setAckRequiredAction} style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                      <input type="hidden" name="schemeId" value={schemeId} />
                      <input type="hidden" name="docKey" value={r.key} />
                      <input type="hidden" name="on" value={r.required ? "0" : "1"} />
                      <span>{r.required ? L("да", "yes") : L("не", "no")}</span>
                      <button type="submit" className="btn btn-sm" data-ack-toggle={r.key} style={{ fontSize: 12 }}>{r.required ? L("Спри", "Stop asking") : L("Изисквай", "Ask")}</button>
                    </form>
                  ) : (
                    <span>{r.required ? L("да", "yes") : L("не", "no")}</span>
                  )}
                </td>
                <td className="p-1" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {!started || (!r.required && r.done === 0 && r.personal === 0) ? "—" : L(`${r.done} от ${r.of}`, `${r.done} of ${r.of}`)}
                  {/* a document sent to one user personally (5.4): its acknowledgements counted apart */}
                  {started && r.personal > 0 ? <span data-ack-personal={r.personal} style={{ color: "var(--muted)" }}>{L(` · лично изпратени: ${r.personal}`, ` · sent personally: ${r.personal}`)}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

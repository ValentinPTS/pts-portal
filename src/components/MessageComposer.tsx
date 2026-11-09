import { randomUUID } from "crypto";
import { MESSAGE_MAX, MESSAGE_PROBLEM_TEXT, MESSAGE_WARNING, MESSAGE_FOOTER } from "@/lib/messages-model";
import PendingSubmit from "@/components/PendingSubmit";

// «Съобщение» (plan part 5.10; Реш. 116): a one-way message from PTS — to one participation, to
// everyone going on in a scheme, or to one organisation. It reaches the portal and each of its
// people by e-mail at once, released by its writer, who sees its exact text here (Реш. 138).
// Bulgarian required; English optional (the Bulgarian is used). No reply in the portal: the
// footer says questions go by e-mail (Реш. 54). A server form — the page answers with ?msg=.

export interface MessageHistoryItem { id: string; at: string; to: string; bg: string; en: string }

const ANSWER: Record<string, { bg: string; en: string }> = {
  sent: { bg: "Изпратено — в портала веднага, по имейл с първото изпращане.", en: "Sent — in the portal at once, by e-mail with the next send-out." },
  state: { bg: "Не е изпратено: схемата не е започнала, или организацията е неактивна.", en: "Not sent: the scheme has not started, or the organisation is inactive." },
  who: { bg: "Не е изпратено: няма такъв получател.", en: "Not sent: no such recipient." },
  reach: { bg: "Не е изпратено: хранилището на самоличността не отговори. Опитайте пак.", en: "Not sent: the identity store did not answer. Try again." },
  nobody: { bg: "Не е изпратено: в схемата няма участия в ход.", en: "Not sent: no participation is going on in the scheme." },
  failed: { bg: "Не е изпратено: съобщението не се записа. Опитайте пак.", en: "Not sent: the message was not recorded. Try again." },
  ...MESSAGE_PROBLEM_TEXT,
};

export default function MessageComposer({ action, hidden, lang, title, to, answer, answerExtra, history, warn = true, anchor = "message" }: {
  action: (formData: FormData) => Promise<void>;
  hidden: Record<string, string>;
  lang: "bg" | "en";
  title: string;
  /** who it goes to, in words */
  to: string;
  /** the page's ?msg= */
  answer?: string;
  /** e.g. «12 of 14» for a partial send */
  answerExtra?: string;
  history: MessageHistoryItem[];
  warn?: boolean;
  /** the section's id — one per organisation on «Организации» */
  anchor?: string;
}) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const a = answer === "partial" ? { bg: `Изпратено на ${answerExtra ?? ""} — за останалите хранилището не отговори; изпратете им отделно.`, en: `Sent to ${answerExtra ?? ""} — for the rest the identity store did not answer; send to them separately.` } : answer ? ANSWER[answer] : undefined;
  const ok = answer === "sent";
  const field = { border: "1px solid var(--line)", borderRadius: 8, padding: "6px 8px", fontSize: 13, fontFamily: "inherit", width: "100%" } as const;
  return (
    <section id={anchor} className="card p-4 mt-3" data-message-composer={hidden.entityId ? "entity" : hidden.code ? "participation" : "scheme"}>
      <h2 className="font-bold" style={{ color: "var(--green-dark)", fontSize: 15, margin: 0 }}>{title}</h2>
      <p className="text-sm mt-1" style={{ color: "var(--muted)", maxWidth: 760 }}>
        {L(`Еднопосочно съобщение ${to}: в портала веднага и по имейл до всеки получател на известията. Изпращате го вие — виждате точния му текст (Реш. 138).`, `A one-way message ${to}: in the portal at once, and by e-mail to each recipient of the notices. You send it — you see its exact text (decision 138).`)}
        {warn ? ` ${L(MESSAGE_WARNING.bg, MESSAGE_WARNING.en)}` : ""}
      </p>
      {a ? <p role={ok ? "status" : "alert"} data-message-answer={answer} className="text-sm mt-2" style={{ color: ok ? "var(--green-dark)" : "#8a1f1f", fontWeight: 600 }}>{L(a.bg, a.en)}</p> : null}
      <form action={action} className="mt-2" style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 760 }}>
        {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        {/* the form's one-time token: a second press of this form sends nothing (review) */}
        <input type="hidden" name="nonce" value={randomUUID()} />
        <label className="text-sm" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span>{L("На български", "In Bulgarian")} *</span>
          <textarea name="bg" required minLength={3} maxLength={MESSAGE_MAX} rows={4} style={field} data-message-bg />
        </label>
        <label className="text-sm" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span>{L("На английски (по желание — иначе отива българският текст)", "In English (optional — else the Bulgarian goes)")}</span>
          <textarea name="en" maxLength={MESSAGE_MAX} rows={3} style={field} data-message-en />
        </label>
        <p className="text-sm" style={{ color: "var(--muted)", margin: 0 }}>{L("Под текста се добавя:", "Added below the text:")} «{L(MESSAGE_FOOTER.bg, MESSAGE_FOOTER.en)}»</p>
        {/* disabled while it is being sent — never a double send by a double click (review) */}
        <div data-message-send><PendingSubmit label={L("Изпрати съобщението", "Send the message")} className="btn btn-primary btn-sm" /></div>
      </form>
      {history.length > 0 && (
        <details className="mt-3" data-message-history={history.length}>
          <summary className="text-sm" style={{ cursor: "pointer" }}>{L(`История (${history.length})`, `History (${history.length})`)}</summary>
          <ul className="text-sm mt-2" style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {history.map((h) => (
              <li key={h.id} data-message-item={h.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 6 }}>
                <div style={{ color: "var(--muted)", fontSize: 12 }}>{h.at} · {h.to}</div>
                <div style={{ whiteSpace: "pre-wrap" }}>{lang === "bg" ? h.bg : h.en}</div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

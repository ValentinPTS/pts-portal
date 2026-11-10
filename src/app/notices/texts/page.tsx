import Link from "next/link";
import { mayAnywhereNow, requireCapAnywhere } from "@/lib/access";
import { getServerT } from "@/lib/i18n-server";
import { listReminderTemplates, isTemplateApproved, renderTemplate, PLACEHOLDERS, MAX_TEMPLATE_LENGTH, REMINDER_LABEL } from "@/lib/reminder-templates";
import { saveReminderTemplateAction, approveReminderTemplateAction } from "@/lib/actions";
import { invitePreview, profileConfirmedPreview, officialNoticePreviews, SUPABASE_TEMPLATES, FIXED_TEXTS_APPROVED_AT } from "@/lib/fixed-texts";

// «Текстове на напомнянията» (plan part 1.8, Реш. 138). The words of the automatic
// reminders, which PTS approves: approved, a reminder goes out by itself with that
// approval on record; not approved, it waits in «Известия» for a person. Editing
// the text needs a new approval. Below, read-only: the fixed texts kept in the code
// — the invitation and Supabase's own e-mails — also for PTS to approve.
export const dynamic = "force-dynamic";

const SAMPLE = { scheme: "PTS 26/01-T-1", date: "15.03.2027" };

function fmt(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

export default async function ReminderTextsPage({ searchParams }: { searchParams: Promise<{ saved?: string; approved?: string; error?: string }> }) {
  // who reads the journal reads the notices — as the bell and the panel show them (2.4, 2.7);
  // deciding, editing and approving are gated by their own rights
  await requireCapAnywhere("journal.read");
  const canEdit = await mayAnywhereNow("library.manage"); // drafting; approving is the head's (texts.approve, 2.4)
  const { lang } = await getServerT();
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const sp = await searchParams;
  const templates = await listReminderTemplates();
  const invite = invitePreview();
  const confirmed = profileConfirmedPreview(); // 4.4: to the official address (К23)
  const ERR: Record<string, string> = {
    changed: L("Текстът е променен междувременно — вижте новия и опитайте пак.", "The text was changed meanwhile — look at the new one and try again."),
    empty: L("И двата езика трябва да имат текст.", "Both languages need a text."),
    "too-long": L(`Най-много ${MAX_TEMPLATE_LENGTH} знака на език.`, `At most ${MAX_TEMPLATE_LENGTH} characters per language.`),
    "unknown-placeholder": L(`Позволени са само ${PLACEHOLDERS.join(" и ")}.`, `Only ${PLACEHOLDERS.join(" and ")} are allowed.`),
    "missing-placeholder": L(`И двата езика трябва да съдържат ${PLACEHOLDERS.join(" и ")}.`, `Both languages must contain ${PLACEHOLDERS.join(" and ")}.`),
    unchanged: L("Няма промяна.", "Nothing changed."),
    bad: L("Невалидна заявка.", "Not a valid request."),
  };

  return (
    <div className="max-w-4xl">
      <Link href="/notices" className="text-sm" style={{ color: "var(--muted)" }}>← {L("Известия", "Notices")}</Link>
      <h1 className="text-2xl font-bold mt-2" style={{ color: "var(--green-dark)" }}>{L("Текстове на напомнянията", "Reminder texts")}</h1>
      <p className="text-sm mt-1" style={{ color: "var(--muted)", maxWidth: 760 }}>
        {L("Само напомнянията тръгват сами, и то само с текст, одобрен тук (Реш. 138). Докато текстът не е одобрен, всяко напомняне чака в «Известия» някой да натисне «Изпрати». Промененият текст иска ново одобрение.",
          "Only reminders go out by themselves, and only with a text approved here (Decision 138). Until the text is approved, each reminder waits in «Notices» for someone to press «Send». A changed text needs a new approval.")}
      </p>
      {sp.saved && <p role="status" className="text-sm mt-3" style={{ color: "var(--green-dark)" }}>{L("Записано. Новият текст чака одобрение.", "Saved. The new text awaits approval.")}</p>}
      {sp.approved && <p role="status" className="text-sm mt-3" style={{ color: "var(--green-dark)" }}>{L("Одобрено. Напомнянията вече тръгват сами с този текст.", "Approved. Reminders now go out by themselves with this text.")}</p>}
      {sp.error && <p role="alert" className="text-sm mt-3" style={{ color: "var(--red)" }}>{ERR[sp.error] ?? ERR.bad}</p>}

      {templates.map((tpl) => {
        const ok = isTemplateApproved(tpl);
        const sample = renderTemplate(tpl, SAMPLE);
        return (
          <section key={tpl.kind} data-template={tpl.kind} className="card p-4 mt-4">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="font-bold" style={{ color: "var(--green-dark)" }}>{L(REMINDER_LABEL[tpl.kind].bg, REMINDER_LABEL[tpl.kind].en)}</h2>
              <span data-template-status className="text-xs font-bold rounded px-2 py-0.5"
                style={ok ? { background: "#e3eeda", color: "#456b2c" } : { background: "#fbe9dc", color: "#7a2e0e" }}>
                {ok
                  ? L(`одобрен · v${tpl.version} · ${tpl.approvedBy ?? ""} · ${fmt(tpl.approvedAt)}`, `approved · v${tpl.version} · ${tpl.approvedBy ?? ""} · ${fmt(tpl.approvedAt)}`)
                  : L(`не е одобрен · v${tpl.version} — напомнянията чакат човек`, `not approved · v${tpl.version} — reminders wait for a person`)}
              </span>
            </div>
            <div className="text-sm mt-2" style={{ color: "var(--muted)" }}>{L("Както ще го види лабораторията (пример):", "As the laboratory will see it (an example):")}</div>
            <div className="grid gap-2 mt-1 text-sm" style={{ gridTemplateColumns: "1fr 1fr" }} data-template-sample>
              <div><b>БГ:</b> {sample.bg}</div>
              <div><b>EN:</b> {sample.en}</div>
            </div>
            {canEdit && !ok && (
              <form action={approveReminderTemplateAction} className="mt-3">
                <input type="hidden" name="kind" value={tpl.kind} />
                <input type="hidden" name="version" value={tpl.version} />
                <button type="submit" data-template-approve className="btn btn-primary btn-sm">{L(`Одобри този текст (v${tpl.version})`, `Approve this text (v${tpl.version})`)}</button>
              </form>
            )}
            {canEdit && (
              <details className="mt-3">
                <summary className="text-sm" style={{ color: "var(--green-dark)", cursor: "pointer" }}>{L("Промени текста", "Change the text")}</summary>
                <form action={saveReminderTemplateAction} className="grid gap-2 mt-2" data-template-edit>
                  <input type="hidden" name="kind" value={tpl.kind} />
                  <input type="hidden" name="version" value={tpl.version} />
                  <label className="text-xs">БГ<textarea name="bg" defaultValue={tpl.bg} rows={2} maxLength={MAX_TEMPLATE_LENGTH} className="w-full" style={{ border: "1px solid var(--line)", borderRadius: 6, padding: 6 }} /></label>
                  <label className="text-xs">EN<textarea name="en" defaultValue={tpl.en} rows={2} maxLength={MAX_TEMPLATE_LENGTH} className="w-full" style={{ border: "1px solid var(--line)", borderRadius: 6, padding: 6 }} /></label>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>{L(`На мястото на ${PLACEHOLDERS.join(" и ")} порталът слага номера на схемата и датата. Име на лаборатория не се слага никога.`, `The portal puts the scheme number and the date in place of ${PLACEHOLDERS.join(" and ")}. A laboratory's name is never put in.`)}</div>
                  <div><button type="submit" className="btn btn-sm">{L("Запази (иска ново одобрение)", "Save (needs a new approval)")}</button></div>
                </form>
              </details>
            )}
          </section>
        );
      })}

      <h2 className="text-lg font-bold mt-8" style={{ color: "var(--green-dark)" }}>{L("Фиксирани текстове в кода", "Fixed texts in the code")}</h2>
      <p className="text-sm mt-1" style={{ color: "var(--muted)", maxWidth: 760 }} data-fixed-status>
        {FIXED_TEXTS_APPROVED_AT
          ? L(`Одобрени от PTS на ${FIXED_TEXTS_APPROVED_AT}.`, `Approved by PTS on ${FIXED_TEXTS_APPROVED_AT}.`)
          : L("Чакат одобрение от PTS. Поканата се показва цялата, преди да се натисне «Изпрати». Другите три праща Supabase, когато човекът ги поиска сам: шаблоните им се копират в Supabase → Authentication → Emails → Templates.",
              "Awaiting PTS's approval. The invitation is shown in full before «Send» is pressed. Supabase sends the other three when the person asks for them: their templates are copied into Supabase → Authentication → Emails → Templates.")}
      </p>
      <section className="card p-4 mt-3" data-fixed="invite">
        <div className="font-bold text-sm">{L("Поканата", "The invitation")}</div>
        <div className="text-sm mt-1"><b>{L("Тема", "Subject")}:</b> {invite.subject}</div>
        <pre className="text-xs mt-1" style={{ whiteSpace: "pre-wrap" }}>{invite.body}</pre>
      </section>
      <section className="card p-4 mt-3" data-fixed="profile-confirmed">
        <div className="font-bold text-sm">{L("Потвърден профил — до официалния e-mail на юридическото лице (К23, Реш. 152)", "A confirmed profile — to the legal entity's official e-mail (К23, Decision 152)")}</div>
        <div className="text-sm mt-1"><b>{L("Тема", "Subject")}:</b> {confirmed.subject}</div>
        <pre className="text-xs mt-1" style={{ whiteSpace: "pre-wrap" }}>{confirmed.body}</pre>
      </section>
      {/* 9.1: on registration and joining — to the official e-mail (К23, Реш. 152) */}
      {officialNoticePreviews().map((t) => (
        <section key={t.key} className="card p-4 mt-3" data-fixed={t.key}>
          <div className="font-bold text-sm">{({ "profile-created": L("Създаден профил (одобрена регистрация)", "A profile made (a registration approved)"), "user-joined": L("Нов потребител (одобрено присъединяване)", "A new user (a join approved)"), "admin-changed": L("Нов администратор на профила", "A new profile administrator") } as Record<string, string>)[t.key]} — {L("до официалния e-mail на юридическото лице (К23, Реш. 152)", "to the legal entity's official e-mail (К23, Decision 152)")}</div>
          <div className="text-sm mt-1"><b>{L("Тема", "Subject")}:</b> {t.subject}</div>
          <pre className="text-xs mt-1" style={{ whiteSpace: "pre-wrap" }}>{t.body}</pre>
        </section>
      ))}
      {SUPABASE_TEMPLATES.map((t) => (
        <section key={t.key} className="card p-4 mt-3" data-fixed={t.key}>
          <div className="font-bold text-sm">Supabase · {t.dashboard}</div>
          <div className="text-sm mt-1"><b>{L("Тема", "Subject")}:</b> {t.subject}</div>
          <pre className="text-xs mt-1" style={{ whiteSpace: "pre-wrap" }}>{t.html}</pre>
        </section>
      ))}
    </div>
  );
}

import Link from "next/link";
import { getViewer, authorize, authorizeAnywhere, schemesFor, requireCapAnywhere } from "@/lib/access";
import { listHeld } from "@/lib/notifications";
import { listSchemeSummaries } from "@/lib/store";
import { decideNoticeAction } from "@/lib/actions";
import { getServerT } from "@/lib/i18n-server";
import { bodyFor, subjectFor, classFor, mailBaseUrl } from "@/lib/notify-deliver";
import { testSubject } from "@/lib/environment";
import { listSent, type MessageClass } from "@/lib/sent-messages";
import { noticeKindText } from "@/lib/notice-kinds";

// Notices to laboratories (Реш. 138, plan parts 0.8 and 1.8). Nothing reaches a
// participant unless a person saw the exact text and pressed «Изпрати» — or, for a
// reminder, PTS approved its words on «Текстове на напомнянията». Every notice the
// app raises for a laboratory waits here as the very e-mail it will be: subject,
// text, link. «Не изпращай» keeps it on record; it never goes out. Below: what was
// sent, with who approved it. By participant CODE only — the address only to a
// manager.
export const dynamic = "force-dynamic";

function fmt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

export default async function NoticesPage({ searchParams }: { searchParams: Promise<{ refused?: string }> }) {
  // who reads the journal reads the notices — as the bell and the panel show them (2.4, 2.7);
  // deciding, editing and approving are gated by their own rights
  await requireCapAnywhere("journal.read");
  const viewer = await getViewer();
  // deciding a held notice: who releases documents (2.4) — per notice, in its scheme
  const canDecide = authorizeAnywhere(viewer, "docs.release");
  const mayDecide = (schemeId?: string) => authorize(viewer, "docs.release", schemeId);
  // a laboratory's address is an identity: per message, in its scheme (Реш. 93)
  const isManager = authorizeAnywhere(viewer, "names.view");
  const seesAddress = (schemeId?: string) => authorize(viewer, "names.view", schemeId);
  // a message's words: those to a participation are by its code, never a name — the rest
  // (a registration's, a profile's: to an organisation) name it and its people, and their time
  // matches the journal's lines: only to who sees names, or manages the organisations
  // (the security sweep, SC-1)
  const managesLabs = authorizeAnywhere(viewer, "labs.manage");
  const seesWords = (m: { schemeId?: string; code?: string }) => !!m.code || seesAddress(m.schemeId) || (!m.schemeId && managesLabs);
  const { lang } = await getServerT();
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  // only the schemes this person works in: a notice carries a code (2.4)
  const scope = schemesFor(viewer, "codes.view");
  const inScope = (schemeId?: string | null) => scope === "all" || (!!schemeId && scope.includes(schemeId));
  const [heldAll, schemes, sentAll] = await Promise.all([listHeld(), listSchemeSummaries(), listSent(50)]);
  const held = heldAll.filter((n) => inScope(n.schemeId));
  const sent = sentAll.filter((m) => inScope(m.schemeId));
  const number = new Map(schemes.map((s) => [s.id, s.number]));
  // 10.1 review: a «the next scheme started» notice of a scheme no longer started is never released (Реш. 147)
  const startedIds = new Set(schemes.filter((x) => x.status !== "draft").map((x) => x.id));
  const releasable = (n: { kind: string; schemeId?: string }) => n.kind !== "catalogue.next" || (!!n.schemeId && startedIds.has(n.schemeId));
  const refusedAs = (await searchParams).refused;
  const refused = refusedAs === "not-started";
  const decidedMeanwhile = refusedAs === "decided";
  const base = mailBaseUrl();
  const CLASS: Record<MessageClass, string> = {
    provider: L("известие", "notice"),
    reminder: L("напомняне", "reminder"),
    chain: L("веригата", "the chain"),
    triggered: L("поискано от човека", "asked for by the person"),
  };

  return (
    <div>
      <h1 className="text-2xl font-bold" style={{ color: "var(--green-dark)" }}>
        {L("Известия към лабораториите", "Notices to laboratories")}
        <span className="text-base font-normal" style={{ color: "var(--muted)" }}> · {held.length} {L("чакат", "waiting")}</span>
      </h1>
      <p className="text-sm mt-1" style={{ color: "var(--muted)", maxWidth: 760 }}>
        {L(
          "Нищо не стига до участник, без човек да е видял точния текст (Реш. 138). Всяко известие към лаборатория чака тук такова, каквото ще бъде писмото. Лабораторията го вижда в портала си и го получава по имейл едва след «Изпрати». «Не изпращай» го оставя записано, но то никога не тръгва. Напомнянията тръгват сами само по текст, одобрен в ",
          "Nothing reaches a participant unless a person has seen the exact text (Decision 138). Every notice to a laboratory waits here as the e-mail it will be: the laboratory sees it in its portal, and receives it by e-mail, only after «Send». «Do not send» keeps it on record but it never goes out. Reminders go out by themselves only with a text approved on "
        )}
        <Link href="/notices/texts" style={{ color: "var(--green-dark)", fontWeight: 700 }}>{L("«Текстове на напомнянията»", "«Reminder texts»")}</Link>.
      </p>

      {decidedMeanwhile && <div role="alert" data-notice-decided className="card p-3 mt-4" style={{ borderLeft: "4px solid var(--amber)" }}>{L("Нищо не е променено: това известие вече е решено — от друг раздел или от друг човек. Вижте «Изпратени имейли» по-долу.", "Nothing changed: this notice was already decided — from another tab or by another person. See «E-mails sent» below.")}</div>}
      {refused && <div role="alert" data-notice-refused className="card p-3 mt-4" style={{ borderLeft: "4px solid var(--red)" }}>{L("Не е изпратено: схемата вече не е започнала (върната в чернова или архивирана) — изберете «Не изпращай».", "Not sent: the scheme is no longer started (back to draft or archived) — choose «Do not send».")}</div>}
      {held.length === 0 ? (
        <div className="card p-4 mt-5" style={{ color: "var(--muted)" }}>{L("Няма задържани известия.", "No notices are waiting.")}</div>
      ) : (
        <div className="mt-5 grid gap-3">
          {held.map((n) => (
            <div key={n.id} data-held className="card p-4" style={{ borderLeft: "4px solid var(--amber)" }}>
              <div className="flex items-center gap-3 flex-wrap text-sm" style={{ color: "var(--muted)" }}>
                <span>{fmt(n.createdAt)}</span>
                {n.schemeId && <Link href={`/schemes/${n.schemeId}`} style={{ color: "var(--green-dark)", fontWeight: 700 }}>{number.get(n.schemeId) ?? n.schemeId}</Link>}
                {n.code && <span className="font-mono font-bold" style={{ color: "var(--green-dark)" }}>{n.code}</span>}
                <span style={{ fontSize: 11 }} data-kind={n.kind}>{CLASS[classFor(n)]} · {noticeKindText(n.kind, lang === "bg" ? "bg" : "en")}</span>
              </div>
              {/* the exact e-mail: what the transport will be handed, word for word */}
              <div className="text-sm mt-2"><b>{L("Тема", "Subject")}:</b> {testSubject(subjectFor(n))}</div>
              <pre data-exact-text className="text-sm mt-1 p-2" style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", background: "var(--green-soft)", borderRadius: 6 }}>{bodyFor(n, base)}</pre>
              {canDecide && mayDecide(n.schemeId) && (
                <div className="flex gap-2 mt-3">
                  {releasable(n) ? (
                    <form action={decideNoticeAction}>
                      <input type="hidden" name="id" value={n.id} />
                      <input type="hidden" name="decision" value="release" />
                      <button type="submit" className="btn btn-primary btn-sm">{L("Изпрати", "Send")}</button>
                    </form>
                  ) : <span className="text-sm" data-notice-unstarted style={{ color: "var(--red)" }}>{L("схемата вече не е започнала — не се изпраща", "the scheme is no longer started — it is not sent")}</span>}
                  <form action={decideNoticeAction}>
                    <input type="hidden" name="id" value={n.id} />
                    <input type="hidden" name="decision" value="withhold" />
                    <button type="submit" className="btn btn-sm" style={{ borderColor: "var(--red)", color: "var(--red)" }}>{L("Не изпращай", "Do not send")}</button>
                  </form>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <h2 className="text-lg font-bold mt-8" style={{ color: "var(--green-dark)" }}>{L("Изпратени имейли", "E-mails sent")}</h2>
      <p className="text-sm mt-1" style={{ color: "var(--muted)", maxWidth: 760 }}>
        {L("Всеки имейл към лаборатория се записва преди да тръгне: кой го е одобрил, точният текст и до кого. Връзките за вход не се пазят.",
          "Every e-mail to a laboratory is recorded before it goes: who approved it, the exact text, and to whom. Sign-in links are not kept.")}
      </p>
      {sent.length === 0 ? (
        <div className="card p-4 mt-3" style={{ color: "var(--muted)" }}>{L("Още няма изпратени.", "None sent yet.")}</div>
      ) : (
        <div className="card mt-3 overflow-x-auto">
          <table className="w-full text-sm" data-sent style={{ borderCollapse: "collapse" }}>
            <thead><tr style={{ color: "var(--muted)", textAlign: "left" }}>
              <th className="p-2">{L("Кога", "When")}</th>
              <th className="p-2">{L("Какво", "What")}</th>
              <th className="p-2">{L("Схема · код", "Scheme · code")}</th>
              {isManager && <th className="p-2">{L("До", "To")}</th>}
              <th className="p-2">{L("Одобрено от", "Approved by")}</th>
              <th className="p-2">{L("Резултат", "Result")}</th>
            </tr></thead>
            <tbody>
              {sent.map((m) => (
                <tr key={m.id} style={{ borderTop: "1px solid var(--line)", verticalAlign: "top" }}>
                  <td className="p-2" style={{ whiteSpace: "nowrap" }}>{fmt(m.sentAt)}</td>
                  <td className="p-2">
                    {seesWords(m) ? (
                      <details><summary data-kind={m.kind}>{CLASS[m.class]} · {noticeKindText(m.kind, lang === "bg" ? "bg" : "en")}</summary>
                        <div className="text-xs mt-1"><b>{L("Тема", "Subject")}:</b> {m.subject}</div>
                        <pre className="text-xs mt-1" style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{m.body}</pre>
                      </details>
                    ) : <span data-sent-words-hidden data-kind={m.kind}>{CLASS[m.class]} · {noticeKindText(m.kind, lang === "bg" ? "bg" : "en")}</span>}
                  </td>
                  <td className="p-2">{m.schemeId ? (number.get(m.schemeId) ?? m.schemeId) : "—"}{m.code ? <span className="font-mono"> · {m.code}</span> : null}</td>
                  {isManager && <td className="p-2 font-mono text-xs">{seesAddress(m.schemeId) ? m.to : "—"}</td>}
                  <td className="p-2 text-xs">{m.approvedBy}</td>
                  <td className="p-2">{m.outcome === "sent" ? L("изпратен", "sent") : m.outcome === "failed" ? <span style={{ color: "var(--red)" }} title={seesAddress(m.schemeId) ? m.error : m.error?.replace(/[^\s@<>"']+@[^\s@<>"']+/g, "‹address›")}>{L("не тръгна", "failed")}</span> : L("на път", "pending")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

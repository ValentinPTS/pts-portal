import Link from "next/link";
import { getDoc } from "@/lib/documents";
import { isProvisional } from "@/lib/coding-model";
import { fmtSchemeDate, daysUntil, isPast } from "@/lib/scheme-dates";
import { schemeNowMs, sofiaToday } from "@/lib/clock";
import { ACTION_LABEL, DEADLINE_LABEL, STATE_LABEL, stageLabel, actionOrder, type ActionItem } from "@/lib/participation-state-model";
import type { ParticipationView } from "@/lib/participation-view";
import Icon from "@/components/ui/Icon";
import { labsTurn } from "@/lib/ui-model";
import type { IconName } from "@/lib/ui-icons";

// The participant's home, as drawn (plan part 5.5; design §4): what asks for action now —
// a deadline, a delivery, a document — each with its button; then the participations, with
// their stage and next deadline. Each row opens the participation's own page.

type Lang = "bg" | "en";
const T = (lang: Lang, x: { bg: string; en: string }) => (lang === "bg" ? x.bg : x.en);

export const schemeTitle = (s: ParticipationView["scheme"], lang: Lang) => s.name?.trim() || (lang === "bg" ? s.titleBg : s.titleEn) || "";
export const participationHref = (v: { participantId: string }) => `/lab/p/${encodeURIComponent(v.participantId)}`;
export const docHref = (v: ParticipationView, key: string, lang: Lang) => `/lab/doc/${v.scheme.id}/${key}?lang=${lang}&p=${encodeURIComponent(v.participantId)}`;
export const docName = (key: string, lang: Lang) => { const d = getDoc(key); return d ? (lang === "bg" ? d.nameBg : d.nameEn) : key; };

/** «29.05.2026, 17:00 EEST · остават 6 дни» — the hour and zone when it has one (3.4).
 *  Passed is decided at its hour on the round's clock, not by the day (5.5 review). */
export function deadlineText(at: string, v: ParticipationView, lang: Lang): string {
  const nowMs = schemeNowMs(v.scheme);
  if (isPast(at, nowMs)) return fmtSchemeDate(at) + T(lang, { bg: " · срокът е изтекъл", en: " · the deadline has passed" });
  const left = daysUntil(at, sofiaToday(nowMs));
  const tail = left === null ? "" : left > 1 ? T(lang, { bg: ` · остават ${left} дни`, en: ` · ${left} days left` })
    : left === 1 ? T(lang, { bg: " · остава 1 ден", en: " · 1 day left" })
    : T(lang, { bg: " · днес", en: " · today" });
  return fmtSchemeDate(at) + tail;
}

// the redesign (R2): each kind its picture; a deadline is the laboratory's turn — the orange card and button
const KIND_ICON: Record<ActionItem["kind"], IconName> = { deadline: "pencil", delivery: "box", acknowledge: "check", document: "doc" };

/** An action's words — its title, where, the detail, the link and the button — written once, for the list and for the
 *  home's «Сега» box (the redesign, R2). */
export function actionLine(a: ActionItem, v: ParticipationView, lang: Lang, onItsPage = false): { title: string; where: string; detail: string; href: string; button: string } {
  const where = `${v.scheme.number}${schemeTitle(v.scheme, lang) ? ` ${schemeTitle(v.scheme, lang)}` : ""}`;
  const code = isProvisional(v.part.code) ? "" : T(lang, { bg: ` · код ${v.part.code}`, en: ` · code ${v.part.code}` });
  const object = v.part.sampleCode ? T(lang, { bg: ` · обект ${v.part.sampleCode}`, en: ` · object ${v.part.sampleCode}` }) : "";
  const line = a.what === "results"
    ? { title: T(lang, { bg: "Неподадени резултати", en: "Results not submitted" }), detail: `${T(lang, DEADLINE_LABEL.results)} ${deadlineText(a.at!, v, lang)}${code}${object}`, href: participationHref(v), button: T(lang, { bg: "Към участието", en: "Open the participation" }) }
    : a.what === "chain"
      ? { title: T(lang, { bg: "Предайте уреда нататък", en: "Hand the instrument on" }), detail: `${T(lang, { bg: "до", en: "by" })} ${deadlineText(a.at!, v, lang)}${code}`, href: participationHref(v), button: T(lang, { bg: "Към участието", en: "Open the participation" }) }
      : a.what === "receipt"
        ? { title: T(lang, { bg: "Непотвърдено получаване", en: "Receipt not confirmed" }), detail: [a.at ? `${T(lang, { bg: "Изпратено", en: "Dispatched" })} ${fmtSchemeDate(a.at)}` : "", v.dispatch?.ref ? `${T(lang, { bg: "товарителница", en: "waybill" })} ${v.dispatch.ref}` : ""].filter(Boolean).join(" · ") + code, href: `${participationHref(v)}#receipt`, button: T(lang, { bg: "Потвърди получаването", en: "Confirm the receipt" }) }
        : a.kind === "acknowledge"
          // 5.9: the declaration to sign, a document to acknowledge — on the participation's page; never a block
          ? { title: `${docName(a.docKey!, lang)}${a.editionNo ? T(lang, { bg: ` · ред. № ${a.editionNo}`, en: ` · ed. No. ${a.editionNo}` }) : ""}`, detail: (a.what === "declaration" ? T(lang, { bg: "Очаква подписване с отметка в портала", en: "Awaits signing by a tick in the portal" }) : T(lang, { bg: "Изисква потвърждение, че сте се запознали", en: "Asks you to acknowledge you have read it" })) + code, href: `${participationHref(v)}${a.what === "declaration" ? "#declaration" : "#documents"}`, button: a.what === "declaration" ? T(lang, { bg: "Подпиши", en: "Sign" }) : T(lang, { bg: "Потвърди", en: "Acknowledge" }) }
          : { title: `${docName(a.docKey!, lang)}${a.editionNo ? T(lang, { bg: ` · ред. № ${a.editionNo}`, en: ` · ed. No. ${a.editionNo}` }) : ""}`, detail: T(lang, { bg: "Още не е отворен от никого от участието", en: "Not opened yet by anyone of the participation" }), href: docHref(v, a.docKey!, lang), button: T(lang, { bg: "Отвори", en: "Open" }) };
  // on the participation's own page, «Към участието» would lead to itself: the results go to their form (R2)
  if (onItsPage && a.what === "results") return { ...line, where, href: `${participationHref(v)}/results`, button: T(lang, { bg: "Към формуляра", en: "Open the form" }) };
  return { ...line, where };
}
export { nowFirst } from "@/lib/participation-state-model";

/** Everything the laboratory does is its turn — orange; a document not opened yet is a calmer note (R2). */
export const actionIsTurn = (a: ActionItem): boolean => a.kind !== "document";

export function ActionItems({ lang, views }: { lang: Lang; views: ParticipationView[] }) {
  const byId = new Map(views.map((v) => [v.participantId, v] as const));
  const items = views.flatMap((v) => v.actions).sort(actionOrder);
  return (
    <section data-actions={items.length} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h2 style={{ display: "flex", alignItems: "baseline", gap: 10, margin: 0, fontSize: 26, fontWeight: 600 }}>
        {T(lang, { bg: "Какво чака вас", en: "What waits for you" })}
        <span style={{ fontSize: 16, fontWeight: 400, color: "#555" }}>{T(lang, { bg: `${items.length} ${items.length === 1 ? "позиция" : "позиции"}`, en: `${items.length} ${items.length === 1 ? "item" : "items"}` })}</span>
      </h2>
      {items.length === 0 ? (
        <p className="ui-card ui-card-later" style={{ margin: 0, padding: "18px 22px", fontSize: 18, color: "#4a4a4a", display: "flex", alignItems: "center", gap: 12 }}><Icon name="check" size={24} />{T(lang, { bg: "Нищо не чака вас в момента.", en: "Nothing is waiting for you right now." })}</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          {items.map((a, i) => {
            const v = byId.get(a.participantId)!;
            const yours = actionIsTurn(a);
            const line = actionLine(a, v, lang), where = line.where;
            return (
              <li key={`${a.participantId}-${a.kind}-${a.docKey ?? a.what}-${i}`} data-action={a.kind} data-action-what={a.what} data-action-for={a.participantId}
                className={`ui-card${yours ? " ui-card-now" : ""}`} style={{ display: "flex", alignItems: "center", gap: 18, padding: "18px 22px", flexWrap: "wrap" }}>
                <span aria-hidden="true" style={{ width: 52, height: 52, flex: "0 0 52px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: yours ? "var(--turn)" : "var(--done-soft)", color: yours ? "#fff" : "var(--done-ink)" }}><Icon name={KIND_ICON[a.kind]} size={26} /></span>
                <div style={{ flex: "1 1 260px", minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", color: yours ? "var(--turn-ink)" : "var(--done-ink)" }}>{T(lang, ACTION_LABEL[a.kind])}</span>
                  <div style={{ fontSize: 19, fontWeight: 700 }}>{line.title} · {where}</div>
                  <div style={{ fontSize: 16, color: "#555", fontVariantNumeric: "tabular-nums" }}>{line.detail}</div>
                </div>
                {a.kind === "document"
                  ? <a href={line.href} target="_blank" rel="noreferrer" className="ui-btn">{line.button}</a>
                  : <Link href={line.href} className={yours ? "ui-btn ui-btn-next" : "ui-btn"}>{line.button}</Link>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function ParticipationsTable({ lang, views, archive, showLab = true }: { lang: Lang; views: ParticipationView[]; archive?: boolean; showLab?: boolean }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table data-participations-table={archive ? "archive" : "active"} style={{ width: "100%", borderCollapse: "collapse", fontSize: 16, minWidth: 560 }}>
        <thead>
          <tr style={{ textAlign: "left", fontSize: 15, fontWeight: 600, color: "#555", background: "#f6f9f3" }}>
            <th style={{ padding: "9px 14px" }}>{T(lang, { bg: "Схема", en: "Scheme" })}</th>
            {showLab && <th style={{ padding: "9px 14px" }}>{T(lang, { bg: "Лаборатория", en: "Laboratory" })}</th>}
            <th style={{ padding: "9px 14px" }}>{T(lang, { bg: "Код", en: "Code" })}</th>
            <th style={{ padding: "9px 14px" }}>{archive ? T(lang, { bg: "Състояние", en: "State" }) : T(lang, { bg: "Етап", en: "Stage" })}</th>
            <th style={{ padding: "9px 14px" }}>{archive ? T(lang, { bg: "Схемата", en: "The scheme" }) : T(lang, { bg: "Следващ срок", en: "Next deadline" })}</th>
          </tr>
        </thead>
        <tbody>
          {views.map((v) => (
            <tr key={v.participantId} data-participation-id={v.participantId} data-participation={isProvisional(v.part.code) ? undefined : v.part.code} data-row-state={v.state} style={{ borderTop: "1px solid var(--line)" }}>
              <td style={{ padding: "10px 14px" }}>
                <Link href={participationHref(v)} style={{ color: "var(--green-dark)", fontWeight: 600 }}>{v.scheme.number}</Link>
                {schemeTitle(v.scheme, lang) && <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{schemeTitle(v.scheme, lang)}</div>}
              </td>
              {showLab && <td style={{ padding: "10px 14px" }}>{v.labName || "—"}</td>}
              <td style={{ padding: "10px 14px", fontVariantNumeric: "tabular-nums" }}>{isProvisional(v.part.code) ? <span style={{ color: "var(--muted)" }}>{T(lang, { bg: "кодът предстои", en: "code to come" })}</span> : v.part.code}</td>
              <td style={{ padding: "10px 14px" }}>
                <span data-row-stage={v.stage ?? "ended"} className={`ui-pill ${v.finished ? "ui-pill-done" : labsTurn(v.state) ? "ui-pill-turn" : "ui-pill-later"}`} style={{ fontSize: 15, padding: "5px 12px" }}>
                  {v.stage && !v.finished ? T(lang, stageLabel(v.stage, v.scheme.type)) : T(lang, STATE_LABEL[v.state])}
                </span>
              </td>
              <td style={{ padding: "10px 14px", fontVariantNumeric: "tabular-nums" }}>
                {archive
                  ? <span style={{ color: "var(--muted)" }}>{v.scheme.status === "not_held" ? T(lang, { bg: "не се състои", en: "not held" }) : v.scheme.status === "closed" ? T(lang, { bg: "приключена", en: "closed" }) : v.scheme.status === "report" ? T(lang, { bg: "докладът е издаден", en: "report issued" }) : "—"}</span>
                  : v.deadline ? <span title={T(lang, DEADLINE_LABEL[v.deadline.kind])}>{fmtSchemeDate(v.deadline.at)}</span> : <span style={{ color: "var(--muted)" }}>—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import Link from "next/link";
import { getDoc } from "@/lib/documents";
import { isProvisional } from "@/lib/coding-model";
import { fmtSchemeDate, daysUntil, isPast } from "@/lib/scheme-dates";
import { schemeNowMs, sofiaToday } from "@/lib/clock";
import { ACTION_LABEL, DEADLINE_LABEL, STATE_LABEL, stageLabel, actionOrder, type ActionItem } from "@/lib/participation-state-model";
import type { ParticipationView } from "@/lib/participation-view";

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

const KIND_STYLE: Record<ActionItem["kind"], { bg: string; fg: string; line: string }> = {
  deadline: { bg: "#fbeaea", fg: "#8f2f2f", line: "#ecc4c4" },
  delivery: { bg: "#faf2e0", fg: "#7a5416", line: "#ecd9ae" },
  acknowledge: { bg: "#efeaf6", fg: "#4f3a75", line: "#d8cdea" },
  document: { bg: "#e8eff7", fg: "#2f4f75", line: "#c8d6e8" },
};

export function ActionItems({ lang, views }: { lang: Lang; views: ParticipationView[] }) {
  const byId = new Map(views.map((v) => [v.participantId, v] as const));
  const items = views.flatMap((v) => v.actions).sort(actionOrder);
  return (
    <section className="card" data-actions={items.length} style={{ padding: 0, overflow: "hidden" }}>
      <h2 style={{ display: "flex", alignItems: "baseline", gap: 10, margin: 0, padding: "14px 18px", borderBottom: "1px solid var(--line)", fontSize: 16, fontWeight: 800 }}>
        {T(lang, { bg: "Изисква действие", en: "Needs action" })}
        <span style={{ fontSize: 12.5, fontWeight: 400, color: "var(--muted)" }}>{T(lang, { bg: `${items.length} ${items.length === 1 ? "позиция" : "позиции"}`, en: `${items.length} ${items.length === 1 ? "item" : "items"}` })}</span>
      </h2>
      {items.length === 0 ? (
        <p style={{ margin: 0, padding: "14px 18px", fontSize: 13, color: "var(--muted)" }}>{T(lang, { bg: "Нищо не чака вас в момента.", en: "Nothing is waiting for you right now." })}</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {items.map((a, i) => {
            const v = byId.get(a.participantId)!;
            const k = KIND_STYLE[a.kind];
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
            return (
              <li key={`${a.participantId}-${a.kind}-${a.docKey ?? a.what}-${i}`} data-action={a.kind} data-action-what={a.what} data-action-for={a.participantId}
                style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 18px", borderTop: i ? "1px solid var(--line)" : "none", flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", padding: "3px 8px", borderRadius: 6, background: k.bg, color: k.fg, border: `1px solid ${k.line}`, minWidth: 82, textAlign: "center" }}>{T(lang, ACTION_LABEL[a.kind])}</span>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontSize: 14 }}>{line.title} · {where}</div>
                  <div style={{ fontSize: 12.5, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{line.detail}</div>
                </div>
                {a.kind === "document"
                  ? <a href={line.href} target="_blank" rel="noreferrer" className="btn btn-sm">{line.button}</a>
                  : <Link href={line.href} className={a.kind === "deadline" ? "btn btn-primary btn-sm" : "btn btn-sm"}>{line.button}</Link>}
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
      <table data-participations-table={archive ? "archive" : "active"} style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 560 }}>
        <thead>
          <tr style={{ textAlign: "left", fontSize: 11.5, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)", background: "#f7f6f2" }}>
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
                <span data-row-stage={v.stage ?? "ended"} style={{ fontSize: 12, padding: "2px 9px", borderRadius: 6, border: "1px solid var(--line)", background: v.stage === "work" || v.stage === "results" ? "#fbeaea" : v.stage === "receipt" ? "#faf2e0" : v.stage === "dispatch" ? "#eef3ea" : "#f4f2ec" }}>
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

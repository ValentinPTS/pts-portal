import Link from "next/link";
import { notFound } from "next/navigation";
import { mayNow, requireCap } from "@/lib/access";
import { getScheme } from "@/lib/store";
import { requireStaff } from "@/lib/roles";
import { getServerT } from "@/lib/i18n-server";
import { amendmentLine, mayAmend, AMENDED_DOCS } from "@/lib/amendments-model";
import { DATE_KEYS, DATE_LABELS, fmtSchemeDate } from "@/lib/scheme-dates";
import { STATE_LABEL } from "@/lib/lifecycle-model";
import { fmtDay } from "@/lib/editions-model";
import { getDoc } from "@/lib/documents";
import { listStaff } from "@/lib/staff";
import AmendmentForm, { CompleteAmendment } from "@/components/AmendmentForm";

export const dynamic = "force-dynamic";

// «Изменения» (plan part 3.3; Zadanie §3 «Изменение на схема в процес на
// провеждане»; Реш. 154): every amendment of the scheme — the head's order (number and
// date), the reason, the amended points, the new deadlines against the old, the
// assessment of the consequences for validity, the editions of the plan and the
// invitation it issued and the ones they replace; and, for the head, a new one.
// PTS's own people only; no laboratory is named here.
export default async function AmendmentsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  await requireCap("codes.view", id); // in THIS scheme, by the role model (2.4)
  const s = await getScheme(id);
  if (!s) notFound();
  const { lang } = await getServerT();
  const lg: "bg" | "en" = lang === "bg" ? "bg" : "en";
  const L = (bg: string, en: string) => (lg === "bg" ? bg : en);
  const canAmend = (await mayNow("order.manage", id)) && mayAmend(s.status);
  const staff = await listStaff();
  const nameOf = (email: string) => staff.find((u) => u.email.toLowerCase() === email.toLowerCase())?.name || email;
  const list = [...(s.amendments ?? [])].reverse();

  return (
    <div>
      <Link href={`/schemes/${id}`} className="text-sm" style={{ color: "var(--muted)" }}>← {s.number}</Link>
      <h1 className="text-2xl font-bold mt-2" style={{ color: "var(--green-dark)" }}>{L("Изменения", "Amendments")}</h1>
      <p className="text-sm mt-1" style={{ color: "var(--muted)", maxWidth: 780 }}>
        {L(
          "Промени в утвърдения план и в публикуваната покана, включително в сроковете, се правят със заповед за изменение на ръководителя на РТ провайдъра. Изменените план и покана се издават като нови редакции с отбелязване на изменението; предишните редакции остават. Участниците се уведомяват. Закъснение на превозвач не удължава срок само по себе си (Реш. 154).",
          "Changes to the approved plan and the published invitation, the deadlines included, are made by an order of amendment of the head of the PT provider. The amended plan and invitation are issued as new editions marked with the amendment; the earlier editions remain. The participants are told. A carrier's delay does not extend a deadline by itself (Реш. 154).",
        )}
      </p>
      <p className="text-sm mt-2">{L("Състояние на схемата: ", "Scheme state: ")}<b>{STATE_LABEL[s.status][lg]}</b></p>

      {canAmend && (
        <AmendmentForm
          schemeId={id}
          lang={lg}
          dates={s.dates ?? {}}
          docs={AMENDED_DOCS.map((d) => ({
            key: d, name: (lg === "bg" ? getDoc(d)?.nameBg : getDoc(d)?.nameEn) ?? d,
            // PTS's own file: the portal cannot stamp a PDF — the marking goes in the file
            uploaded: !!s.uploads?.[d] && s.docActive?.[d] !== "built",
          }))}
        />
      )}

      {list.length === 0 ? (
        <div className="card p-4 mt-5" style={{ color: "var(--muted)" }} data-amendments-none>{L("Няма изменения.", "No amendments.")}</div>
      ) : (
        <div className="mt-5 grid gap-3">
          {list.map((a) => (
            <div key={a.id} className="card p-4" data-amendment={a.no}>
              <div className="font-bold" style={{ color: "var(--green-dark)" }}>{amendmentLine(lg, a)}</div>
              <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>{fmtDay(a.day)} · {nameOf(a.by)}</div>
              {!!a.pending?.length && (
                <div data-amendment-pending className="text-sm mt-2" style={{ color: "#8f2f2f" }}>
                  {L("Още не са издадени: ", "Not issued yet: ")}{a.pending.map((d) => (lg === "bg" ? getDoc(d)?.nameBg : getDoc(d)?.nameEn) ?? d).join(", ")}{" "}
                  {canAmend && <CompleteAmendment schemeId={id} amendmentId={a.id} lang={lg} />}
                </div>
              )}
              <dl className="text-sm mt-2 grid gap-1" style={{ gridTemplateColumns: "minmax(140px, 220px) 1fr" }}>
                <dt style={{ color: "var(--muted)" }}>{L("Основание", "Reason")}</dt><dd data-amendment-reason>{a.reason}</dd>
                <dt style={{ color: "var(--muted)" }}>{L("Изменени точки", "Amended points")}</dt><dd>{a.points}</dd>
                <dt style={{ color: "var(--muted)" }}>{L("Последици за валидността", "Consequences for validity")}</dt><dd>{a.validity}</dd>
                {a.dates && (
                  <>
                    <dt style={{ color: "var(--muted)" }}>{L("Нови срокове", "New deadlines")}</dt>
                    <dd data-amendment-dates>
                      {DATE_KEYS.filter((k) => a.dates?.[k]).map((k) => (
                        <div key={k}>{DATE_LABELS[k][lg]}: {a.datesBefore?.[k] ? <s style={{ color: "var(--muted)" }}>{fmtSchemeDate(a.datesBefore[k])}</s> : "—"} → <b>{fmtSchemeDate(a.dates?.[k])}</b></div>
                      ))}
                    </dd>
                  </>
                )}
                {a.editions && (
                  <>
                    <dt style={{ color: "var(--muted)" }}>{L("Издадени редакции", "Editions issued")}</dt>
                    <dd>
                      {Object.entries(a.editions).map(([doc, e]) => (
                        <div key={doc} data-amendment-edition={`${doc}:${e!.no}`}>
                          <Link href={`/schemes/${id}/editions?doc=${doc}#${doc}`} style={{ color: "var(--green-dark)", fontWeight: 700 }}>
                            {(lg === "bg" ? getDoc(doc)?.nameBg : getDoc(doc)?.nameEn) ?? doc} — {L("ред.", "ed.")} № {e!.no}
                          </Link>
                          {e!.replaces && <span style={{ color: "var(--muted)" }}> {L("заменя ред.", "replaces ed.")} № {e!.replaces.no} {L("от", "of")} {fmtDay(e!.replaces.issuedOn)}</span>}
                        </div>
                      ))}
                    </dd>
                  </>
                )}
              </dl>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { requireCap } from "@/lib/access";
import { notFound } from "next/navigation";
import { getScheme } from "@/lib/store";
import { listApplications } from "@/lib/applications";
import { approveApplicationAction, rejectApplicationAction } from "@/lib/actions";
import { EmptyState } from "@/components/States";
import { getServerT } from "@/lib/i18n-server";
import { ONLINE_APPLICATIONS_OPEN } from "@/lib/online-applications";
import { accreditationWarning, listsOf } from "@/lib/scheme-lists-model";
import { listParticipants } from "@/lib/participants";
import { inRound } from "@/lib/application-model";
import { currentFinalList } from "@/lib/announcement-model";
import SchemeFullNotice from "@/components/SchemeFullNotice";

const STATUS_COLOR: Record<string, string> = {
  pending: "var(--amber)",
  approved: "var(--success)",
  rejected: "var(--red)",
};

export default async function ApplicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const { err } = await searchParams;
  // Manager only: every заявка names the lab, with its people, ЕИК and address, and
  // approving it mints the code — staff and auditors work by code alone (§4.2, N29).
  const { id } = await params;
  await requireCap("participants.manage", id); // the applications name the labs (2.4)
  const s = await getScheme(id);
  if (!s) notFound();
  const apps = await listApplications(id);
  const pending = apps.filter((a) => a.status === "pending");
  const { tr, lang } = await getServerT();
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const lists = listsOf(s); // «accreditation required» warns, never refuses (Реш. 108, 3.8)
  // the hidden maximum, here too — where PTS approves (3.7 review); codes only, no names
  // places taken: the participations in the round (as the participants page counts them, 5.1)
  const taken = (await listParticipants(id)).filter(inRound).length + pending.length;
  // the final list announced (5.2): no application is approved after it
  const listFinal = !!currentFinalList(s);

  const charName = (i: string) => {
    // "cal" = a calibration scheme's device item (lib/apply-item)
    if (i === "cal") return s.calibration?.quantityEn || s.calibration?.quantityBg || "Calibration";
    const p = s.parameters[Number(i)];
    return p ? p.characteristicEn : `#${i}`;
  };

  return (
    <div>
      <Link href={`/schemes/${id}`} className="text-sm" style={{ color: "var(--muted)" }}>
        ← {s.number}
      </Link>
      <h1 className="text-2xl font-bold mt-2" style={{ color: "var(--green-dark)" }}>
        {tr("apps.title")}{" "}
        <span className="text-base font-normal" style={{ color: "var(--muted)" }}>
          · {pending.length} {tr("apps.pending")} / {apps.length} {tr("apps.total")}
        </span>
      </h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>{ONLINE_APPLICATIONS_OPEN ? tr("apps.subtitle") : tr("apps.closedNote")}</p>
      {err === "numbers" && (
        <div className="card p-3 mt-3 text-sm" data-err-numbers style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f" }}>{L("Няма свободен номер на лаборатория в схемата: всички 99 са дадени (правилото за кода, А2). Нищо не е добавено.", "No laboratory number is left in the scheme: all 99 are given (the code rule, А2). Nothing was added.")}</div>
      )}
      {err === "list-final" && (
        <div className="card p-3 mt-3 text-sm" data-err-list-final style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f" }}>{L("Окончателният списък е обявен — заявката не е одобрена. За да влезе, върнете схемата към предишното състояние. Нищо не е записано.", "The final list is announced — the application was not approved. To take it in, step the scheme back. Nothing was saved.")}</div>
      )}
      {err === "save" && (
        <div className="card p-3 mt-3 text-sm" style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f" }}>{tr("part.saveFailed")}</div>
      )}

      {apps.length === 0 && (
        <div className="mt-5">
          <EmptyState
            title={tr("apps.noneTitle")}
            body={tr("apps.noneBody")}
            action={ONLINE_APPLICATIONS_OPEN
              ? <Link href={`/apply/${id}`} className="btn btn-primary btn-sm" style={{ marginTop: 4 }}>{tr("apps.openForm")}</Link>
              : <Link href={`/schemes/${id}/participants`} className="btn btn-primary btn-sm" style={{ marginTop: 4 }}>{tr("scheme.participants")}</Link>}
          />
        </div>
      )}

      <SchemeFullNotice commercial={s.commercial} taken={taken} lang={lang === "bg" ? "bg" : "en"} />
      <div className="mt-5 grid gap-4">
        {[...apps]
          .sort((a, b) => (a.status === "pending" ? -1 : 1) - (b.status === "pending" ? -1 : 1))
          .map((a) => (
            <div key={a.id} className="card p-4" style={{ borderLeft: `4px solid ${STATUS_COLOR[a.status] ?? "var(--line)"}` }}>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg" style={{ color: "var(--green-dark)" }}>{a.labName}</span>
                <span style={{ color: STATUS_COLOR[a.status], fontWeight: 700, marginLeft: "auto" }}>● {tr(`appstatus.${a.status}`)}</span>
              </div>
              <div className="grid gap-x-6 gap-y-1 mt-2 text-sm" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <div><b>{tr("apps.manager")}:</b> {a.manager || "—"}</div>
                <div><b>{tr("col.contact")}:</b> {a.contactPerson || "—"}</div>
                <div><b>{tr("part.email")}:</b> {a.email || "—"}</div>
                <div><b>{tr("part.phone")}:</b> {a.phone || "—"}</div>
                <div><b>{tr("apps.accreditation")}:</b> {a.accreditationCert || "—"}
                  {accreditationWarning(lists, a.accreditationCert) && (
                    <span data-accreditation-warning className="text-xs" style={{ marginLeft: 8, background: "#fdf6e3", border: "1px solid #ecd9a6", color: "#7a5a12", borderRadius: 6, padding: "1px 6px" }}>
                      {L("Схемата изисква акредитация, а заявката не посочва — само предупреждение (Реш. 108)", "The scheme asks for accreditation and the application states none — a warning only (Реш. 108)")}
                    </span>
                  )}
                </div>
                <div><b>{tr("apps.delivery")}:</b> {a.deliveryAddress || "—"} {a.postalCode}</div>
                <div><b>{tr("apps.company")}:</b> {a.companyName || "—"}</div>
                <div><b>ЕИК / VAT:</b> {a.eik || "—"} / {a.vat || "—"}</div>
                <div><b>МОЛ:</b> {a.mol || "—"}</div>
                <div><b>{tr("apps.regAddress")}:</b> {a.registeredAddress || "—"}</div>
              </div>
              <div className="mt-2 text-sm">
                <b>{tr("apps.requestedChars")}</b>{" "}
                {Object.keys(a.selections).length === 0
                  ? "—"
                  : Object.entries(a.selections)
                      .map(([i, n]) => `${charName(i)} ×${n}`)
                      .join(" · ")}
              </div>

              {a.status === "pending" && (
                <div className="flex gap-2 mt-3">
                  {listFinal
                    ? <span data-approve-closed className="text-xs" style={{ color: "#7a5a12", alignSelf: "center" }}>{L("Окончателният списък е обявен — заявка не се одобрява след него.", "The final list is announced — no application is approved after it.")}</span>
                    : <form action={approveApplicationAction}>
                    <input type="hidden" name="schemeId" value={s.id} />
                    <input type="hidden" name="appId" value={a.id} />
                    <button type="submit" className="btn btn-primary">{tr("apps.approve")}</button>
                  </form>}
                  <form action={rejectApplicationAction}>
                    <input type="hidden" name="schemeId" value={s.id} />
                    <input type="hidden" name="appId" value={a.id} />
                    <button type="submit" className="btn" style={{ borderColor: "var(--red)", color: "var(--red)" }}>{tr("apps.reject")}</button>
                  </form>
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}

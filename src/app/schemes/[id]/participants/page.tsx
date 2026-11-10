import Link from "next/link";
import { mayNow, requireCap } from "@/lib/access";
import { notFound } from "next/navigation";
import { getScheme } from "@/lib/store";
import { listParticipants } from "@/lib/participants";
import { namesFor } from "@/lib/identities";
import type { Participant } from "@/lib/types";
import { addParticipantAction, inviteLabAction, updateParticipantAction } from "@/lib/actions";
import { getServerT } from "@/lib/i18n-server";
import { requireStaff } from "@/lib/roles";
import { logActivity } from "@/lib/activity";
import { invitePreview } from "@/lib/fixed-texts";
import { testSubject } from "@/lib/environment";
import { resultsDeadline, deadlineState, resultsSubmittedAt } from "@/lib/deadlines-model";
import { characteristicLabel } from "@/lib/characteristics-model";
import SchemeFullNotice from "@/components/SchemeFullNotice";
import PendingSubmit from "@/components/PendingSubmit";
import { accreditationWarning, listsOf } from "@/lib/scheme-lists-model";
import { listLabs } from "@/lib/labs";
import { schemeNowMs } from "@/lib/clock";
import { openParticipationSnapshots, inForce, type ParticipationSnapshot } from "@/lib/participation-snapshots";
import { openEntityUsers } from "@/lib/entity-users";
import { actorNow } from "@/lib/identities";
import { confirmDate } from "@/lib/profile-confirm-model";
import FreezeParticipationForm from "@/components/FreezeParticipationForm";
import StandingForms from "@/components/StandingForms";
import { inRound, objectsNeeded, selectionsOf, STANDING_LABEL, REFUSAL_CATEGORIES, MAX_PER_CHARACTERISTIC, type Selections } from "@/lib/application-model";
import { currentFinalList, finalSelectionsOf } from "@/lib/announcement-model";
import { isProvisional } from "@/lib/coding-model";
import { fmtMoment } from "@/lib/scheme-dates";
import { needsCarrierChoice } from "@/lib/participation-state-model";

const INVITE = invitePreview();

const inputCls = "w-full rounded px-2 py-1 text-sm";
const inputStyle = { border: "1px solid var(--line)", background: "#fff" } as const;

// Courier options exactly as they appear on the owner's F 7.2.1-4 workbook.
// the usual carriers, offered — any other may be typed: outside the EU and the Balkans the
// participant chooses one from the offers, and PTS records it here (Реш. 128, 5.5)
const COURIERS = ["Спиди БГ", "Спиди EN", "Поща/Fedex"];

const STATUS_COLOR: Record<string, string> = {
  applied: "var(--muted)", approved: "var(--success)", invoiced: "var(--info)",
  paid: "var(--info)", dispatched: "var(--blue)", received: "var(--teal)",
  submitted: "var(--amber)", scored: "var(--green-dark)",
};

export default async function ParticipantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const { err } = await searchParams;
  await requireStaff(); // read gate: manager/staff/auditor only
  const { id } = await params;
  await requireCap("codes.view", id); // in THIS scheme, by the role model (2.4)
  const s = await getScheme(id);
  if (!s) notFound();
  // the names only for a viewer who may see them — an opening, on record (2.3)
  const participants = await namesFor(id, await listParticipants(id));
  const { tr, lang } = await getServerT();
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  // the hidden maximum (3.7): the participants and the applications still waiting —
  // «запълнена» is a label and a warning to PTS, never a closing (Реш. 120)
  // only the participations in the round — a refused, annulled or withdrawn one takes no place (5.1)
  const inRoundParts = participants.filter(inRound);
  const taken = inRoundParts.length + (s.applications ?? []).filter((a) => a.status === "pending").length;
  // after the second announcement (5.2): the final list — only those on it, for the
  // characteristics that run; before it, every participation in the round as applied
  const finalList = currentFinalList(s);
  const onList = (p: Participant) => inRound(p) && (!finalList?.participants || finalList.participants.includes(p.id));
  const selNow = (p: Participant): Selections => (finalList?.runs ? finalSelectionsOf(p, { runs: finalList.runs }, s.parameters.length) : selectionsOf(p, s.parameters.length));
  // the objects the round's participations need (5.1; one per participation set by default — PTS to confirm)
  const objectsTotal = inRoundParts.filter(onList).reduce((a, p) => a + objectsNeeded(selNow(p), s.type), 0);
  const max = s.commercial?.maxParticipants;
  // RT1 — only a manager sees the real names behind the codes (§4.2). Staff and
  // auditors see codes only, and only a manager adds a participant: the new row's
  // code would otherwise stand next to the name just typed.
  const reveal = await mayNow("names.view", id); // the scheme manager and the coding expert, here (Реш. 93, 2.4)
  // «accreditation required» (3.8, Реш. 108): a warning beside the laboratory whose
  // account states none — or that is not linked to an account — never a refusal.
  // Here, where PTS adds participants while online applications are closed (review);
  // only to a viewer who sees the names.
  const lists = listsOf(s);
  const labsById = reveal && lists.accreditationRequired ? new Map((await listLabs()).map((l) => [l.id, l])) : null;
  const accWarn = (labId?: string) => !!labsById && accreditationWarning(lists, labId ? labsById.get(labId)?.accreditationCert : "");
  // the frozen copies (4.5, J12): only to a viewer who sees the names; only who manages
  // the participants links one (its choices opened when asked — 4.5 review); the
  // contacts' names by their entities only; a failure is said, the page still shown
  const canFreeze = reveal && (await mayNow("participants.manage", id));
  let snapshots = new Map<string, ParticipationSnapshot>(), versions = new Map<string, number>(), contactName = new Map<string, string>(), snapshotsFailed = false;
  if (reveal) {
    try {
      const actor = await actorNow();
      const all = await openParticipationSnapshots({ actor, purpose: "names.view" }, id);
      snapshots = inForce(all);
      for (const x of all) versions.set(x.participantId, (versions.get(x.participantId) ?? 0) + 1);
      const withContact = [...snapshots.values()].filter((x) => x.contactUserId);
      for (const entityId of new Set(withContact.map((x) => x.entityId))) {
        for (const u of await openEntityUsers({ actor, purpose: "names.view" }, { entityId })) if (withContact.some((x) => x.contactUserId === u.id)) contactName.set(u.id, u.name);
      }
    } catch { snapshotsFailed = true; snapshots = new Map(); versions = new Map(); contactName = new Map(); }
  }
  // every opening of the code ↔ laboratory link is in the journal (part 1.9)
  if (reveal && participants.length) await logActivity("names.viewed", { schemeId: id, subject: "page:participants", summary: "Laboratory names shown with their codes — participants list" });
  const hidden = <span style={{ color: "var(--muted)", fontStyle: "italic" }}>{tr("part.hidden")}</span>;

  // the same laboratory's name twice in the round (a PDF and an online application) — a hint (9.2 review)
  const nameKey = (n: string) => n.toLowerCase().replace(/[\s"'„“”«».,-]+/g, " ").trim();
  const twins = new Map<string, number>();
  if (reveal) for (const x of inRoundParts.filter((q) => q.labName)) twins.set(nameKey(x.labName), (twins.get(nameKey(x.labName)) ?? 0) + 1);
  // the warning from the participation's copy (4.5) — the laboratory's accreditation as frozen — where
  // there is one; else the earlier laboratory account (9.2 review: an online application has no account)
  const accWarnFor = (p: { id: string; labId?: string }) => { const sn = snapshots.get(p.id); return sn ? reveal && !!lists.accreditationRequired && accreditationWarning(lists, sn.laboratory.accreditationNo) : accWarn(p.labId); };
  return (
    <div>
      <Link href={`/schemes/${id}`} className="text-sm" style={{ color: "var(--muted)" }}>
        ← {s.number}
      </Link>
      <h1 className="text-2xl font-bold mt-2" style={{ color: "var(--green-dark)" }}>
        {tr("scheme.participants")}{" "}
        <span className="text-base font-normal" style={{ color: "var(--muted)" }}>
          · <span data-in-round-count={inRoundParts.length}>{inRoundParts.length}</span>{participants.length > inRoundParts.length && <span style={{ color: "var(--muted)" }}> {L(`(+${participants.length - inRoundParts.length} извън кръга)`, `(+${participants.length - inRoundParts.length} out of the round)`)}</span>}{max !== undefined && <span data-max-participants title={L("Участници и чакащи заявки / максимален брой", "Participants and pending applications / maximum")}> ({L("със заявките", "with applications")} {taken} / {max})</span>}
        </span>
      </h1>
      <SchemeFullNotice commercial={s.commercial} taken={taken} lang={lang === "bg" ? "bg" : "en"} />
      {s.type === "T" && inRoundParts.length > 0 && (
        <p className="text-sm" data-objects-total={objectsTotal} style={{ color: "var(--muted)" }}>
          {L(`Обекти за участниците: ${objectsTotal} (по заявките — по един за всяко участие; без резервните)`, `Objects for the participants: ${objectsTotal} (from the applications — one per participation; reserves not included)`)}
        </p>
      )}
      <p className="text-sm" style={{ color: "var(--muted)" }}>{reveal ? tr("part.subtitle") : tr("part.confBanner")}</p>
      {err === "numbers" && (
        <div className="card p-3 mt-3 text-sm" data-err-numbers style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f" }}>{L("Няма свободен номер на лаборатория в схемата: всички 99 са дадени (правилото за кода, А2). Нищо не е добавено.", "No laboratory number is left in the scheme: all 99 are given (the code rule, А2). Nothing was added.")}</div>
      )}
      {err === "frozen" && (
        <div className="card p-3 mt-3 text-sm" data-err-frozen style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f" }}>{L("Наименованието и адресът за доставка на това участие са от копието му (J12) — не се променят тук. Ако връзката е грешна, поправете я. Нищо не е записано.", "This participation's laboratory name and delivery address are its copy's (J12) — not changed here. If the link is wrong, correct it. Nothing was saved.")}</div>
      )}
      {snapshotsFailed && (
        <div className="card p-3 mt-3 text-sm" data-snapshots-failed style={{ background: "#fdf6e3", border: "1px solid #ecd9a6", color: "#7a5a12" }}>{L("Копията на участията не можаха да се отворят — опитайте пак.", "The participations' copies could not be opened — try again.")}</div>
      )}
      {err === "list-final" && (
        <div className="card p-3 mt-3 text-sm" data-err-list-final style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f" }}>{L("Окончателният списък е обявен — нова заявка или промяна на заявеното по характеристики не се записва. Нищо не е записано.", "The final list is announced — a new application or a change of what was applied for is not recorded. Nothing was saved.")}</div>
      )}
      {(err === "sel-none" || err === "sel-count") && (
        <div className="card p-3 mt-3 text-sm" data-err-selections style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f" }}>{err === "sel-none" ? L("Заявката трябва да има поне една характеристика с поне едно участие. Нищо не е записано.", "The application needs at least one characteristic with at least one participation. Nothing was saved.") : L("Броят участия по характеристика е цяло число от 0 до 10. Нищо не е записано.", "The number of participations per characteristic is a whole number from 0 to 10. Nothing was saved.")}</div>
      )}
      {err === "save" && (
        <div className="card p-3 mt-3 text-sm" style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f" }}>{tr("part.saveFailed")}</div>
      )}

      {/* the usual carriers, offered by the courier fields (any other may be typed) */}
      <datalist id="courier-options">{COURIERS.map((c) => <option key={c} value={c} />)}</datalist>

      {/* list */}
      <div className="card mt-4 overflow-hidden">
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--green-soft)", color: "var(--green-dark)" }}>
              <th className="text-left p-2">{tr("col.code")}</th>
              <th className="text-left p-2">{tr("col.laboratory")}</th>
              <th className="text-left p-2">{tr("col.country")}</th>
              <th className="text-left p-2">{tr("col.sample")}</th>
              <th className="text-left p-2">{tr("col.courier")}</th>
              <th className="text-left p-2">{tr("col.status")}</th>
              <th className="text-left p-2">{tr("col.paid")}</th>
              <th className="text-left p-2">{tr("part.portal")}</th>
            </tr>
          </thead>
          <tbody>
            {participants.length === 0 && (
              <tr><td colSpan={8} className="p-3" style={{ color: "var(--muted)" }}>{tr("part.noneYet")}</td></tr>
            )}
            {participants.map((p) => (
              <ParticipantRows key={p.id} p={p} schemeId={id} reveal={reveal} hidden={hidden} tr={tr} accWarn={accWarnFor(p)} L={L} twin={reveal && inRound(p) && (twins.get(nameKey(p.labName)) ?? 0) > 1}
                snapshot={snapshots.get(p.id)} versions={versions.get(p.id) ?? 0} contactName={contactName} lang={lang === "bg" ? "bg" : "en"}
                canFreeze={canFreeze && !snapshotsFailed} canManage={canFreeze} schemeType={s.type}
                objects={onList(p) ? objectsNeeded(selNow(p), s.type) : 0} listed={finalList ? onList(p) : undefined}
                invoiced={!!s.labDocs?.[p.code]?.proforma} paid={!!s.paidAt?.[p.code]}
                deadline={(() => {
                  // its results deadline (3.4): extended? overdue? — a state, never a block
                  const rd = resultsDeadline(s, p.code);
                  const done = resultsSubmittedAt(s, p.code, p.status); // the first file, on the round's clock
                  return { state: deadlineState(rd.at, done, schemeNowMs(s)), extended: !!rd.ext };
                })()}
                parameters={s.parameters.map((x, i) => ({ i, label: characteristicLabel(x, "bg") }))} />
            ))}
          </tbody>
        </table>
      </div>

      {/* add form — manager only; the final list announced (5.2), none is added: a step back undoes it */}
      {reveal && finalList && (
        <p className="card p-3 mt-7 text-sm" data-list-final style={{ background: "#fdf6e3", border: "1px solid #ecd9a6", color: "#7a5a12" }}>
          {L("Окончателният списък е обявен (второ обявяване) — нови заявки не се въвеждат, а заявеното по характеристики не се променя. За промяна върнете схемата към предишното състояние.", "The final list is announced (the second announcement) — no new applications are entered, and what was applied for per characteristic is not changed. To change it, step the scheme back.")}
        </p>
      )}
      {reveal && !finalList && (<>
      <h2 className="text-lg font-bold mt-7 mb-2 pb-1" style={{ color: "var(--green-dark)", borderBottom: "2px solid var(--red)" }}>
        {tr("part.addTitle")}
      </h2>
      <form action={addParticipantAction} className="grid gap-3" style={{ gridTemplateColumns: "2fr 1fr" }}>
        <input type="hidden" name="schemeId" value={s.id} />
        <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("part.labName")}</span>
          <input name="labName" required className={inputCls} style={inputStyle} /></label>
        <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("col.country")}</span>
          <input name="country" className={inputCls} style={inputStyle} /></label>
        <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("part.contactPerson")}</span>
          <input name="contact" className={inputCls} style={inputStyle} /></label>
        <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("part.phone")}</span>
          <input name="phone" className={inputCls} style={inputStyle} /></label>
        <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("part.email")}</span>
          <input name="email" type="email" className={inputCls} style={inputStyle} /></label>
        <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("part.deliveryAddress")}</span>
          <input name="deliveryAddress" className={inputCls} style={inputStyle} /></label>
        {/* with characteristics, the participations follow from the counts below (5.1) */}
        {s.parameters.length === 0 && <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("part.participations")}</span>
          <input name="participations" type="number" min="1" defaultValue="1" className={inputCls} style={inputStyle} /></label>}
        <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("part.courier")}</span>
          <input name="courier" list="courier-options" maxLength={60} className={inputCls} style={inputStyle} defaultValue="" /></label>
        <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("part.sampleCode")}</span>
          <input name="sampleCode" className={inputCls} style={inputStyle} /></label>
        {/* the application from the PDF: participations per characteristic (5.1) — no approval act follows (Реш. 123);
            a scheme with no characteristics (calibration) has none to count */}
        {s.parameters.length > 0 && <fieldset style={{ gridColumn: "1 / -1" }} data-add-selections>
          <span className="block text-xs mb-1" style={{ color: "var(--muted)" }}>{L("Брой участия по характеристика (0 — без нея). Участията на лабораторията са най-големият от тях.", "Participations per characteristic (0 — not taken). The laboratory's participations are the largest of them.")}</span>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {s.parameters.map((x, i) => (
              <label key={i} className="text-sm flex items-center gap-1.5">
                <input name={`sel_${i}`} type="number" min={0} max={MAX_PER_CHARACTERISTIC} defaultValue={1} className="rounded px-1 py-0.5" style={{ ...inputStyle, width: 56 }} />
                {characteristicLabel(x, "bg")}
              </label>
            ))}
          </div>
        </fieldset>}
        <div className="flex items-end">
          <PendingSubmit label={tr("part.addButton")} />
        </div>
      </form>
      <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>{tr("part.footnote")}</p>
      </>)}
    </div>
  );
}

// One participant = its data row, then (to staff) its standing row (5.1), its
// participation-copy row (4.x) and a collapsed edit row (native <details>, no client
// JS) holding the full edit form — courier, sample code and the F 7.2.1-6
// characteristics live here so 30 labs can be filled in quickly.
function ParticipantRows({ p, schemeId, reveal, hidden, tr, invoiced, paid, parameters, deadline, accWarn, L, snapshot, versions, contactName, canFreeze, lang, canManage, schemeType, objects, listed, twin }: {
  /** another participation in the round under the same laboratory's name — a PDF application and an
   *  online one for one laboratory, while both paths are open (9.2 review, Реш. 146): a hint, never a block */
  twin?: boolean;
  /** the objects it needs now (5.1; after the final list, for the characteristics that run) */
  objects: number;
  /** on the final list? — undefined before the second announcement (5.2) */
  listed?: boolean;
  canManage: boolean;
  schemeType: "T" | "C";
  snapshot?: ParticipationSnapshot;
  versions: number;
  contactName: Map<string, string>;
  canFreeze: boolean;
  lang: "bg" | "en";
  deadline: { state: string; extended: boolean };
  p: Participant;
  schemeId: string;
  reveal: boolean;
  hidden: React.ReactNode;
  tr: (key: string) => string;
  invoiced: boolean; // a proforma sits in this participation's slot
  paid: boolean;     // the owner's own note that the money arrived
  parameters: { i: number; label: string }[];
  accWarn: boolean;
  L: (bg: string, en: string) => string;
}) {
  // its participations per characteristic (5.1) — an older one: one of each of its characteristics
  const sel = selectionsOf(p, parameters.length);
  const out = !inRound(p);
  return (
    <>
      <tr style={{ borderTop: "1px solid var(--line)", opacity: out ? 0.6 : 1 }} data-participant-row={p.code} data-in-round={out ? "0" : "1"}>
        <td className="p-2 font-mono font-bold" data-provisional={isProvisional(p.code) ? "1" : undefined}
          title={isProvisional(p.code) ? L("Заявка без код — кодът се тегли при кодирането (5.3)", "An application without a code — drawn at the coding act (5.3)") : undefined}>
          <Link href={`/schemes/${schemeId}/participants/${encodeURIComponent(p.code)}`} style={{ color: isProvisional(p.code) ? "var(--muted)" : "var(--green-dark)" }}>{p.code}</Link>
        </td>
        <td className="p-2">{reveal ? p.labName : hidden}
          {isProvisional(p.code) && !out && <span data-no-code className="text-xs" style={{ marginLeft: 6, color: "var(--muted)" }}>· {L("без код до кодирането", "no code until the coding act")}</span>}
          {twin && <span data-possible-twin className="text-xs" style={{ marginLeft: 6, color: "#7a2e0e" }} title={L("Друго участие в кръга със същото име на лаборатория — заявка в PDF и от портала?", "Another participation in the round with the same laboratory name — a PDF application and an online one?")}>· {L("същото име — повторение?", "same name — twice?")}</span>}
          {/* 9.2: the laboratory's own application in its portal — and when */}
          {p.source === "portal" && <span data-source-portal className="text-xs" style={{ marginLeft: 6, color: "var(--green-dark)" }} title={p.createdAt ?? ""}>· {L("от портала", "from the portal")}{p.createdAt ? `, ${fmtMoment(p.createdAt)}` : ""}</span>}
          {out && p.standing && <span data-standing-state={p.standing.state} className="text-xs" style={{ marginLeft: 6, fontWeight: 700, color: "#8f2f2f" }}>● {L(STANDING_LABEL[p.standing.state].bg, STANDING_LABEL[p.standing.state].en)}</span>}
          {!out && schemeType === "T" && <span data-objects={objects} className="text-xs" style={{ marginLeft: 6, color: "var(--muted)" }}>· {L("обекти", "objects")}: {objects}</span>}
          {!out && listed !== undefined && <span data-final={listed ? "1" : "0"} className="text-xs" style={{ marginLeft: 6, fontWeight: 700, color: listed ? "var(--green-dark)" : "#8a5a00" }}>· {listed ? L("в окончателния списък", "on the final list") : L("не е в окончателния списък — не продължава", "not on the final list — goes no further")}</span>}
          {reveal && snapshot && (
            <span data-frozen={snapshot.takenAt} className="text-xs" title={L("Копие на данните на юридическото лице и лабораторията към участието — не се сменя (J12)", "A copy of the legal entity's and the laboratory's data for this participation — never changed (J12)")}
              style={{ marginLeft: 6, background: "var(--green-soft)", border: "1px solid var(--line)", borderRadius: 6, padding: "0 5px", color: "var(--green-dark)" }}>
              {L("копие от", "copy of")} {confirmDate(snapshot.takenAt)}
            </span>
          )}
          {reveal && accWarn && (
            <span data-accreditation-warning className="text-xs" title={L("Схемата изисква акредитация, а при лабораторията няма посочена — само предупреждение (Реш. 108)", "The scheme asks for accreditation and the laboratory states none — a warning only (Реш. 108)")}
              style={{ marginLeft: 6, background: "#fdf6e3", border: "1px solid #ecd9a6", color: "#7a5a12", borderRadius: 6, padding: "0 5px" }}>
              {L("без посочена акредитация", "no accreditation stated")}
            </span>
          )}
        </td>
        <td className="p-2">{p.country}</td>
        <td className="p-2 font-mono">{p.sampleCode || <span style={{ color: "var(--muted)" }}>—</span>}</td>
        {/* the carrier only to who sees names: outside the EU and the Balkans it is chosen from
            offers, and its name can say where the participation is (§4.2, 5.5 review) */}
        <td className="p-2" data-courier={p.courier ? "1" : "0"}>{reveal ? (p.courier || <span style={{ color: "var(--muted)" }}>—</span>) : p.courier ? <span style={{ color: "var(--muted)" }}>{L("избран", "chosen")}</span> : <span style={{ color: "var(--muted)" }}>—</span>}
          {/* Реш. 128: on the final list, outside the EU and the Balkans, the carrier not chosen yet — only
              to who sees the country (§4.2). The country: its frozen copy's legal entity, else its own —
              the same one its users read (5.5 review) */}
          {reveal && !out && listed === true && !p.courier?.trim() && needsCarrierChoice(snapshot?.entity.country || p.country) && (
            <span data-carrier-pending className="text-xs" style={{ display: "block", fontWeight: 700, color: "#7a5416" }}>{L("изчаква избор на доставчик", "awaiting the choice of carrier")}</span>
          )}
        </td>
        <td className="p-2"><span style={{ color: STATUS_COLOR[p.status] ?? "var(--muted)", fontWeight: 700 }}>● {tr(`pstatus.${p.status}`)}</span>
          {deadline.state === "overdue" && <span data-overdue style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: "#8f2f2f" }}>{tr("part.overdue")}</span>}
          {deadline.extended && <span data-extended style={{ marginLeft: 6, fontSize: 11, color: "var(--muted)" }}>{tr("part.extended")}</span>}
        </td>
        {/* the money at a glance: is there an invoice, and did it come back paid?
            Neither state gates anything — the round runs whatever this says. */}
        <td className="p-2" style={{ whiteSpace: "nowrap" }}>
          {paid
            ? <span style={{ color: "var(--green-dark)", fontWeight: 700 }}>✓ {tr("col.paid")}</span>
            : invoiced
              ? <span style={{ color: "var(--muted)" }}>📨 {tr("part.invoiceSent")}</span>
              : <span style={{ color: "var(--muted)" }}>—</span>}
        </td>
        <td className="p-2">
          <div className="flex items-center gap-3">
            {p.labId && reveal ? (
              // the invitation's exact text first, then «Изпрати» (part 1.8, Реш. 138)
              <details data-invite-preview>
                <summary className="btn btn-sm" style={{ fontSize: 12, padding: "5px 10px", listStyle: "none" }}>{tr("part.inviteToPortal")}</summary>
                <div className="card p-2 mt-1" style={{ maxWidth: 520 }}>
                  <div className="text-xs"><b>{tr("users.inviteSubject")}:</b> {testSubject(INVITE.subject)}</div>
                  <pre className="text-xs mt-1" style={{ whiteSpace: "pre-wrap" }}>{INVITE.body}</pre>
                  <form action={inviteLabAction}>
                    <input type="hidden" name="labId" value={p.labId} />
                    <input type="hidden" name="textKey" value={INVITE.key} />
                    <input type="hidden" name="returnTo" value={`/schemes/${schemeId}/participants`} />
                    <button type="submit" className="btn btn-primary btn-sm" style={{ fontSize: 12, padding: "5px 10px" }}>{tr("users.inviteSend")}</button>
                  </form>
                </div>
              </details>
            ) : (
              <span style={{ color: "var(--muted)" }}>—</span>
            )}
            <Link href={`/schemes/${schemeId}/participants/${encodeURIComponent(p.code)}`} style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>{tr("part.openCase")} →</Link>
          </div>
        </td>
      </tr>
      {/* out of the round (5.1): why; or — to who manages the participants — refuse, annul, withdrawn */}
      {reveal && (out || canManage) && (
        <tr data-standing-row={p.id}>
          <td colSpan={8} className="px-2 py-1" style={{ fontSize: 12 }}>
            {out && p.standing ? (
              <span data-standing-detail style={{ color: "#8f2f2f" }}>
                {L(STANDING_LABEL[p.standing.state].bg, STANDING_LABEL[p.standing.state].en)} — {confirmDate(p.standing.at)}
                {p.standing.category && <>: {(() => { const c = REFUSAL_CATEGORIES.find((x) => x.key === p.standing!.category); return c ? L(c.bg, c.en) : p.standing!.category; })()}</>}
                {p.standing.reason && <> · {L("основание", "reason")}: {p.standing.reason}</>}
                {p.standing.source && <> · {L("основание", "source")}: {p.standing.source}</>}
                {" "}<span style={{ color: "var(--muted)" }}>{L("(извън кръга; кодът остава)", "(out of the round; its code stays)")}</span>
                {p.standing.state === "refused" && !snapshot && !p.labId && <span data-standing-unreachable style={{ color: "#8a5a00" }}> · {L("не е свързано с лаборатория в портала — отказът се съобщава от PTS", "not linked to a laboratory in the portal — PTS tells it of the refusal")}</span>}
              </span>
            ) : (
              <details><summary style={{ cursor: "pointer", color: "var(--muted)" }}>{L("Откажи, анулирай или отбележи оттегляне", "Refuse, annul or record a withdrawal")}</summary>
                <div className="mt-1"><StandingForms lang={lang} schemeId={schemeId} participantId={p.id} categories={REFUSAL_CATEGORIES.map((c) => ({ key: c.key, bg: c.bg, en: c.en }))} reachable={!!snapshot || !!p.labId} /></div>
              </details>
            )}
          </td>
        </tr>
      )}
      {reveal && (snapshot || canFreeze) && (
        <tr data-snapshot-row={p.id}>
          <td colSpan={8} className="px-2 py-1" style={{ fontSize: 12 }}>
            {snapshot && (
              <div data-snapshot={p.id} data-snapshot-version={snapshot.version} style={{ color: "var(--muted)" }}>
                <b style={{ color: "var(--green-dark)" }}>{L("Копие към участието", "The participation's copy")} ({confirmDate(snapshot.takenAt)}{versions > 1 ? `, ${L("версия", "version")} ${snapshot.version}` : ""}):</b>{" "}
                {snapshot.entity.name} · {L("ЕИК", "Reg. no.")} {snapshot.entity.eik}{snapshot.entity.vat ? ` · ${snapshot.entity.vat}` : ""} · {snapshot.entity.correspondenceAddress}
                {" — "}{snapshot.laboratory.name} · {snapshot.laboratory.deliveryAddress}{snapshot.laboratory.mobileOffice ? ` · ${L("мобилен офис", "mobile office")}` : ""}{(snapshot.laboratory.accreditationNo || snapshot.laboratory.accreditationBody) ? ` · ${L("акр.", "accr.")} ${[snapshot.laboratory.accreditationNo, snapshot.laboratory.accreditationBody].filter(Boolean).join(", ")}` : ""} · {snapshot.entity.country}
                {snapshot.contactUserId && <> · {L("контакт", "contact")}: {contactName.get(snapshot.contactUserId) ?? "—"}</>}
                {snapshot.reason && <> · {L("поправка", "correction")}: {snapshot.reason}</>}
              </div>
            )}
            {!snapshot && canFreeze && <span style={{ color: "var(--muted)", marginRight: 8 }}>{L("Свържете участието с лабораторията му — данните на юридическото лице и лабораторията се запазват към него както са сега и не се сменят после (J12).", "Link the participation to its laboratory — the legal entity's and the laboratory's data are kept with it as they are now, never changed after (J12).")}</span>}
            {canFreeze && <FreezeParticipationForm lang={lang} schemeId={schemeId} participantId={p.id} correcting={!!snapshot} />}
          </td>
        </tr>
      )}
      {reveal && (
        <tr data-edit-row={p.id}>
          <td colSpan={8} style={{ padding: 0 }}>
            <details>
              <summary className="text-xs px-2 py-1" style={{ color: "var(--muted)", cursor: "pointer", listStyle: "none" }}>{tr("part.edit")}</summary>
              <form action={updateParticipantAction} className="grid gap-3 p-3" style={{ gridTemplateColumns: "2fr 1fr 1fr", background: "var(--green-soft)", borderTop: "1px solid var(--line)" }}>
                <input type="hidden" name="schemeId" value={schemeId} />
                <input type="hidden" name="id" value={p.id} />
                <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("part.labName")}{snapshot ? ` — ${L("от копието", "from its copy")}` : ""}</span>
                  <input name="labName" required defaultValue={p.labName} readOnly={!!snapshot} className={inputCls} style={snapshot ? { ...inputStyle, background: "var(--bg)", color: "var(--muted)" } : inputStyle} /></label>
                <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("col.country")}</span>
                  <input name="country" defaultValue={p.country} className={inputCls} style={inputStyle} /></label>
                <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("part.contactPerson")}</span>
                  <input name="contact" defaultValue={p.contact} className={inputCls} style={inputStyle} /></label>
                <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("part.phone")}</span>
                  <input name="phone" defaultValue={p.phone} className={inputCls} style={inputStyle} /></label>
                <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("part.email")}</span>
                  <input name="email" type="email" defaultValue={p.email} className={inputCls} style={inputStyle} /></label>
                <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("part.deliveryAddress")}{snapshot ? ` — ${L("от копието", "from its copy")}` : ""}</span>
                  <input name="deliveryAddress" defaultValue={p.deliveryAddress} readOnly={!!snapshot} className={inputCls} style={snapshot ? { ...inputStyle, background: "var(--bg)", color: "var(--muted)" } : inputStyle} /></label>
                {parameters.length === 0 && <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("part.participations")}</span>
                  <input name="participations" type="number" min="1" defaultValue={String(p.participations)} className={inputCls} style={inputStyle} /></label>}
                <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("part.courier")}</span>
                  <input name="courier" list="courier-options" maxLength={60} defaultValue={p.courier ?? ""} className={inputCls} style={inputStyle} /></label>
                <label className="block"><span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("part.sampleCode")}</span>
                  <input name="sampleCode" defaultValue={p.sampleCode ?? ""} className={inputCls} style={inputStyle} /></label>
                {parameters.length > 0 && (
                  <fieldset style={{ gridColumn: "1 / -1" }}>
                    <span className="block text-xs mb-1" style={{ color: "var(--muted)" }}>{L("Брой участия по характеристика (0 — без нея). Участията на лабораторията са най-големият от тях.", "Participations per characteristic (0 — not taken). The laboratory's participations are the largest of them.")}</span>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {parameters.map(({ i, label }) => (
                        <label key={i} className="text-sm flex items-center gap-1.5">
                          <input name={`sel_${i}`} type="number" min={0} max={MAX_PER_CHARACTERISTIC} defaultValue={sel[String(i)] ?? 0} className="rounded px-1 py-0.5" style={{ ...inputStyle, width: 56 }} />
                          {label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
                <div><button type="submit" className="btn btn-primary btn-sm">{tr("part.save")}</button></div>
              </form>
            </details>
          </td>
        </tr>
      )}
    </>
  );
}

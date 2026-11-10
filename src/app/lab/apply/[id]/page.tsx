import Link from "next/link";
import { requireParticipant, participantActor, participationsOf } from "@/lib/participant-session";
import { openLaboratories } from "@/lib/laboratories";
import { getScheme } from "@/lib/store";
import { listParticipants } from "@/lib/participants";
import { getServerT } from "@/lib/i18n-server";
import { applyOpenProblem, labAccreditationWarning, earlierProblem, APPLY_PROBLEM_TEXT } from "@/lib/lab-apply-model";
import { schemeFull } from "@/lib/waitlist-model";
import { isStarted } from "@/lib/visibility";
import { characteristicLabel } from "@/lib/characteristics-model";
import { schemeNowMs } from "@/lib/clock";
import { paramsSignature } from "@/lib/param-remap";
import { fmtSchemeDate } from "@/lib/scheme-dates";
import ParticipantNav from "@/components/ParticipantNav";
import LabApplyForm from "@/components/LabApplyForm";

export const dynamic = "force-dynamic";

// The application for one scheme (plan part 9.2): one of the organisation's active laboratories, the
// participations per characteristic (1–10 each; a calibration scheme — the number of participations), the
// delivery by PTS or the laboratory's own courier. The accreditation warning (Реш. 108) — never a block.
// A laboratory that has applied already is said so. A scheme that is not open — the same words as one
// that does not exist (never a draft, Реш. 147).
export default async function LabApplySchemePage({ params }: { params: Promise<{ id: string }> }) {
  const ps = await requireParticipant();
  const { user, entity, persona } = ps;
  const { lang } = await getServerT();
  const lg: "bg" | "en" = lang === "bg" ? "bg" : "en";
  const L = (bg: string, en: string) => (lg === "bg" ? bg : en);
  const { id } = await params;
  const scheme = await getScheme(id);
  const problem = !scheme || !isStarted(scheme) ? "not-open" : applyOpenProblem(scheme, schemeNowMs(scheme));
  const shell = (body: React.ReactNode) => (
    <div style={{ minHeight: "100dvh", background: "var(--bg)" }}>
      <ParticipantNav lang={lg} active="apply" name={user.name} role={user.role} persona={persona} />
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "32px 24px" }}>
        <Link href="/lab/apply" className="text-sm" style={{ color: "var(--muted)" }}>← {L("Заявяване", "Apply")}</Link>
        {body}
      </main>
    </div>
  );
  if (problem || !scheme) return shell(<div role="note" data-apply-closed className="card" style={{ padding: 14, marginTop: 12 }}>{L(APPLY_PROBLEM_TEXT[problem ?? "not-open"].bg, APPLY_PROBLEM_TEXT[problem ?? "not-open"].en)}.</div>);
  if (entity.state !== "active") return shell(<div role="note" data-apply-entity-pending className="card" style={{ padding: 14, marginTop: 12, background: "#fff8e6" }}>{L(APPLY_PROBLEM_TEXT.entity.bg, APPLY_PROBLEM_TEXT.entity.en)}.</div>);
  const labs = (await openLaboratories({ actor: participantActor(user.id), purpose: "lab.own" }, { entityId: entity.id })).filter((l) => l.state === "active");
  // the laboratories that have applied — one in the round («already»), or refused or withdrawn (through
  // PTS); an annulled one may apply again
  const mine = (await participationsOf(ps)).filter((p) => p.schemeId === scheme.id);
  const rows = await listParticipants(scheme.id);
  // «Запълнена» (9.3) — a yes or a no; never the maximum (3.7)
  const full = schemeFull(scheme, rows);
  const earlierOf = (labId: string) => earlierProblem(mine.filter((m) => m.laboratoryId === labId).map((m) => rows.find((x) => x.id === m.participantId) ?? { standing: null }));
  return shell(
    <>
      <h1 className="section-title" style={{ fontSize: 24, margin: "10px 0 4px" }}>{scheme.number} · {L(scheme.titleBg || scheme.titleEn, scheme.titleEn || scheme.titleBg)}</h1>
      {full && <div role="note" data-apply-full className="card" style={{ padding: 12, marginBottom: 12, background: "#fdf6e3", color: "#7a5a12" }}>{L("Схемата е запълнена — заявката ви влиза в списъка на изчакващите, по реда на подаване (Реш. 120). Ако се освободи място навреме, PTS ще ви уведоми.", "The scheme is full — your application goes on the waiting list, in the order of submission (Decision 120). Should a place become free in time, PTS will tell you.")}</div>}
      <p className="text-sm" style={{ color: "var(--muted)", marginBottom: 14 }}>
        {scheme.dates?.applicationsDue ? L(`Краен срок за заявки: ${fmtSchemeDate(scheme.dates.applicationsDue)}. `, `Applications due: ${fmtSchemeDate(scheme.dates.applicationsDue)}. `) : ""}
        {L("С подаването лабораторията става участник; PTS може да откаже заявката с причина (Реш. 14). Промяна след подаването — чрез PTS.", "On submitting, the laboratory becomes a participant; PTS may refuse the application with a reason (Decision 14). A change after submitting — through PTS.")}
      </p>
      <LabApplyForm lang={lg} schemeId={scheme.id}
        labs={labs.map((l) => ({ id: l.id, name: l.name, applied: earlierOf(l.id), warning: labAccreditationWarning(scheme.lists, l.accreditationNo) }))}
        characteristics={scheme.parameters.map((p, i) => ({ i, label: characteristicLabel(p, lg) }))} signature={paramsSignature(scheme.parameters)} />
    </>,
  );
}

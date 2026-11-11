import Link from "next/link";
import { notFound } from "next/navigation";
import { getScheme } from "@/lib/store";
import ApplyWizard from "@/components/ApplyWizard";
import { paramsSignature } from "@/lib/param-remap";
import { calApplyItem } from "@/lib/apply-item";
import { getServerT } from "@/lib/i18n-server";
import { isStarted } from "@/lib/visibility";
import { ONLINE_APPLICATIONS_OPEN, PDF_APPLICATION_URL } from "@/lib/online-applications";
import { catalogueState, STATE_TEXT, takesApplications, wishOffered } from "@/lib/catalogue-model";
import { schemeFull } from "@/lib/waitlist-model";
import { listParticipants } from "@/lib/participants";
import { schemeNowMs } from "@/lib/clock";

export default async function ApplyToScheme({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const s = await getScheme(id);
  // an unstarted scheme answers exactly like a missing one — no number, no title (Реш. 147)
  if (!s || !isStarted(s)) notFound();
  const { lang, tr } = await getServerT();
  // the plan, readable before applying — its released edition (D15, 5.4)
  const planLink = s.sentToParticipants?.plan && s.releasedEditions?.plan ? (
    <a href={`/apply/${s.id}/plan?lang=${lang === "bg" ? "bg" : "en"}`} target="_blank" rel="noopener" data-public-plan className="btn inline-flex">
      {lang === "bg" ? `План на схемата (ред. № ${s.releasedEditions.plan.no})` : `The scheme's plan (ed. No. ${s.releasedEditions.plan.no})`}
    </a>
  ) : null;

  // …and its invitation (10.1; D15) — the released edition, public as the plan
  const invitationLink = s.sentToParticipants?.invitation && s.releasedEditions?.invitation ? (
    <a href={`/apply/${s.id}/invitation?lang=${lang === "bg" ? "bg" : "en"}`} target="_blank" rel="noopener" data-public-invitation className="btn inline-flex">
      {lang === "bg" ? `Покана за участие (ред. № ${s.releasedEditions.invitation.no})` : `The invitation (ed. No. ${s.releasedEditions.invitation.no})`}
    </a>
  ) : null;
  // its state in words (10.1) — never a count or a place (К1); «Запълнена» a label (К19)
  const state = catalogueState(s, schemeNowMs(s), s.status === "open" && schemeFull(s, await listParticipants(s.id)));
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);

  // Online applications are closed in the transition (part 0.4): the scheme's
  // public facts, and the way to apply with the PDF form — never the wizard.
  if (!ONLINE_APPLICATIONS_OPEN) {
    return (
      <div className="text-center">
        <h1 className="text-3xl font-bold">{s.number}</h1>
        <p className="mt-2" style={{ color: "#cdd6c2" }}>{lang === "bg" ? s.titleBg : s.titleEn}</p>
        {state && <p className="mt-3" data-public-state={state} style={{ fontWeight: 700, color: takesApplications(state) ? "var(--green-light)" : "#f0c98a" }}>{STATE_TEXT[state][lang === "bg" ? "bg" : "en"]}</p>}
        <p className="mt-6 mx-auto" style={{ color: "#f0c98a", maxWidth: 620 }}>{tr("apply.closedBody")}</p>
        <div className="mt-6 flex gap-3 justify-center flex-wrap">
          {planLink}
          {invitationLink}
          {/* 9.2: the laboratory applies in its portal — or with the PDF, until Реш. 146 */}
          <a href="/lab/login" className="btn btn-primary inline-flex" data-apply-portal>{tr("apply.portalLink")}</a>
          <a href="/register" className="btn inline-flex">{tr("apply.registerLink")}</a>
          <a href={PDF_APPLICATION_URL} target="_blank" rel="noopener" className="btn inline-flex">{tr("apply.pdfLink")}</a>
          <Link href="/apply" className="btn inline-flex">{tr("apply.toOpen")}</Link>
          <Link href="/catalogue" className="btn inline-flex" data-catalogue-link>{L("Каталог на схемите", "The schemes' catalogue")}</Link>
        </div>
        {state && wishOffered(state) && (
          <p className="mt-5 text-sm" data-public-wish-note style={{ color: "#aab59c" }}>
            {L("«Уведоми ме при следваща» — в портала, за влезлите потребители на организация (", "«Notify me of the next» — in the portal, for the signed-in users of an organisation (")}
            <a href="/lab/catalogue" style={{ color: "var(--green-light)" }}>{L("Каталог в портала", "the portal's catalogue")}</a>).
          </p>
        )}
      </div>
    );
  }

  // only open schemes accept applications
  if (s.status !== "open") {
    return (
      <div className="text-center">
        <h1 className="text-3xl font-bold">{s.number}</h1>
        <p className="mt-2" style={{ color: "#cdd6c2" }}>{lang === "bg" ? s.titleBg : s.titleEn}</p>
        {state && <p className="mt-3" data-public-state={state} style={{ fontWeight: 700, color: "#f0c98a" }}>{STATE_TEXT[state][lang === "bg" ? "bg" : "en"]}</p>}
        <p className="mt-6" style={{ color: "#f0c98a" }}>
          {tr("apply.notAccepting")}
        </p>
        <div className="mt-4 flex gap-3 justify-center flex-wrap">{planLink}{invitationLink}<Link href="/catalogue" className="btn inline-flex" data-catalogue-link>{L("Каталог на схемите", "The schemes' catalogue")}</Link></div>
        <Link href="/apply" className="btn btn-primary mt-6 inline-flex">
          {tr("apply.toOpen")}
        </Link>
      </div>
    );
  }

  return (
    <>
      <Link href="/apply" className="no-underline text-sm" style={{ color: "#aab59c" }}>
        {tr("apply.allOpen")}
      </Link>
      {state && <p className="mt-2" data-public-state={state} style={{ fontWeight: 700, color: "var(--green-light)" }}>{STATE_TEXT[state][lang === "bg" ? "bg" : "en"]}</p>}
      <div className="mt-3 flex gap-3 flex-wrap">{planLink}{invitationLink}<Link href="/catalogue" className="btn inline-flex" data-catalogue-link>{L("Каталог на схемите", "The schemes' catalogue")}</Link></div>
      <div className="mt-3">
        <ApplyWizard
          schemeId={s.id}
          number={s.number}
          titleBg={s.titleBg}
          titleEn={s.titleEn}
          objectBg={s.objectBg}
          objectEn={s.objectEn}
          params={
            // Calibration schemes participate with the DEVICE (one item built
            // from scheme.calibration); testing schemes with their standards.
            calApplyItem(s, lang)
              ? [calApplyItem(s, lang)!]
              : s.parameters.map((p) => ({
                  standard: lang === "bg" ? p.standardBg : p.standardEn,
                  characteristic: lang === "bg" ? p.characteristicBg : p.characteristicEn,
                }))
          }
          paramSig={paramsSignature(s.parameters)}
          branch={calApplyItem(s, lang) ? "cal" : "std"}
        />
      </div>
    </>
  );
}

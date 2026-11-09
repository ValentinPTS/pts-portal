import Link from "next/link";
import { notFound } from "next/navigation";
import { getScheme } from "@/lib/store";
import ApplyWizard from "@/components/ApplyWizard";
import { paramsSignature } from "@/lib/param-remap";
import { calApplyItem } from "@/lib/apply-item";
import { getServerT } from "@/lib/i18n-server";
import { isStarted } from "@/lib/visibility";
import { ONLINE_APPLICATIONS_OPEN, PDF_APPLICATION_URL } from "@/lib/online-applications";

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

  // Online applications are closed in the transition (part 0.4): the scheme's
  // public facts, and the way to apply with the PDF form — never the wizard.
  if (!ONLINE_APPLICATIONS_OPEN) {
    return (
      <div className="text-center">
        <h1 className="text-3xl font-bold">{s.number}</h1>
        <p className="mt-2" style={{ color: "#cdd6c2" }}>{lang === "bg" ? s.titleBg : s.titleEn}</p>
        <p className="mt-6 mx-auto" style={{ color: "#f0c98a", maxWidth: 620 }}>{tr("apply.closedBody")}</p>
        <div className="mt-6 flex gap-3 justify-center flex-wrap">
          {planLink}
          <a href={PDF_APPLICATION_URL} target="_blank" rel="noopener" className="btn btn-primary inline-flex">{tr("apply.pdfLink")}</a>
          <Link href="/apply" className="btn inline-flex">{tr("apply.toOpen")}</Link>
        </div>
      </div>
    );
  }

  // only open schemes accept applications
  if (s.status !== "open") {
    return (
      <div className="text-center">
        <h1 className="text-3xl font-bold">{s.number}</h1>
        <p className="mt-2" style={{ color: "#cdd6c2" }}>{lang === "bg" ? s.titleBg : s.titleEn}</p>
        <p className="mt-6" style={{ color: "#f0c98a" }}>
          {tr("apply.notAccepting")}
        </p>
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
      {planLink && <div className="mt-3">{planLink}</div>}
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

import Link from "next/link";
import { notFound } from "next/navigation";
import { getScheme } from "@/lib/store";
import ApplyWizard from "@/components/ApplyWizard";
import { getServerT } from "@/lib/i18n-server";

export default async function ApplyToScheme({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const s = await getScheme(id);
  if (!s) notFound();
  const { lang, tr } = await getServerT();

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
      <div className="mt-3">
        <ApplyWizard
          schemeId={s.id}
          number={s.number}
          titleBg={s.titleBg}
          titleEn={s.titleEn}
          objectBg={s.objectBg}
          objectEn={s.objectEn}
          params={s.parameters.map((p) => ({
            standard: lang === "bg" ? p.standardBg : p.standardEn,
            characteristic: lang === "bg" ? p.characteristicBg : p.characteristicEn,
          }))}
        />
      </div>
    </>
  );
}

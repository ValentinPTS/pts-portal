import Link from "next/link";
import { notFound } from "next/navigation";
import { getScheme } from "@/lib/store";
import ApplyWizard from "@/components/ApplyWizard";

export default async function ApplyToScheme({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const s = await getScheme(id);
  if (!s) notFound();

  // only open schemes accept applications
  if (s.status !== "open") {
    return (
      <div className="text-center">
        <h1 className="text-3xl font-bold">{s.number}</h1>
        <p className="mt-2" style={{ color: "#cdd6c2" }}>{s.titleBg}</p>
        <p className="mt-6" style={{ color: "#f0c98a" }}>
          Тази схема не приема заявки в момента. / This scheme is not accepting applications right now.
        </p>
        <Link href="/apply" className="btn btn-primary mt-6 inline-flex">
          ← Към отворените схеми / Open schemes
        </Link>
      </div>
    );
  }

  return (
    <>
      <Link href="/apply" className="no-underline text-sm" style={{ color: "#aab59c" }}>
        ← Всички отворени схеми / All open schemes
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
            standard: p.standardBg,
            characteristic: p.characteristicBg,
          }))}
        />
      </div>
    </>
  );
}

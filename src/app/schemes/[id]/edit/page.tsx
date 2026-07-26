import Link from "next/link";
import { notFound } from "next/navigation";
import { getScheme } from "@/lib/store";
import SchemeEditor from "@/components/SchemeEditor";
import { getServerT } from "@/lib/i18n-server";

// The scheme setup page: essentials (number, name, photo), opening the scheme,
// the schedule dates and the participation standards — with add/remove/reorder.
// All interactivity lives in the SchemeEditor client component; this server page
// only loads the scheme and passes the (serializable) slice it edits.
export default async function EditSchemePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ err?: string; codes?: string }>;
}) {
  const { id } = await params;
  const { err, codes } = await searchParams;
  const s = await getScheme(id);
  if (!s) notFound();
  const { lang, tr } = await getServerT();
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);

  return (
    <div>
      <Link href={`/schemes/${id}`} className="text-sm" style={{ color: "var(--muted)" }}>
        ← {s.number}
      </Link>
      <h1 className="text-2xl font-bold mt-2" style={{ color: "var(--green-dark)" }}>
        {tr("edit.title")}
      </h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        {tr("edit.subtitle")}
      </p>

      {err === "stranded" && (
        <div className="card p-3 mt-3 text-sm" style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f" }}>
          <b>{L("Промените НЕ са запазени.", "The changes were NOT saved.")}</b>{" "}
          {L(
            `Изтриването на тези стандарти би оставило участник(ци) ${codes ?? ""} без нито един регистриран стандарт — първо променете обхвата им или ги премахнете от страницата „Участници“.`,
            `Deleting those standards would leave participant(s) ${codes ?? ""} with no registered standard — first re-scope or remove them on the “Participants” page.`
          )}
        </div>
      )}

      <SchemeEditor
        init={{
          id: s.id,
          number: s.number,
          titleEn: s.titleEn,
          titleBg: s.titleBg,
          objectEn: s.objectEn,
          objectBg: s.objectBg,
          status: s.status,
          announced: !!s.announced,
          coverImage: s.coverImage,
          coverImageWidth: s.coverImageWidth,
          coverImageAlign: s.coverImageAlign,
          minParticipants: s.minParticipants,
          schedule: s.schedule,
          parameters: s.parameters,
          prices: s.prices,
          calibration: s.calibration,
        }}
      />
    </div>
  );
}

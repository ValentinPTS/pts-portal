import Link from "next/link";
import { requireSection, getViewer, schemesFor } from "@/lib/access";
import { listSchemes } from "@/lib/store";
import { getServerT } from "@/lib/i18n-server";
import { fmtSchemeDate } from "@/lib/scheme-dates";

// «Обекти и партиди» (plan part 3.5; Реш. 151 / А18): every testing scheme this person
// works in, with its batches — identification, material, date, objects, whether they
// are drawn — and the way to each scheme's own page, where batches are recorded. The
// technical expert's (D18), planned with the scheme manager. A calibration scheme has
// no batch. Codes of objects only — no laboratory is named here.
export const dynamic = "force-dynamic";

export default async function BatchesPage() {
  await requireSection("batches");
  const { lang } = await getServerT();
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const scope = schemesFor(await getViewer(), "codes.view");
  const schemes = (await listSchemes()).filter((s) => s.type === "T" && (scope === "all" || scope.includes(s.id)));
  return (
    <div>
      <h1 className="text-2xl font-bold" style={{ color: "var(--green-dark)" }}>{L("Обекти и партиди", "Objects and batches")}</h1>
      <p className="text-sm mt-1" style={{ color: "var(--muted)", maxWidth: 780 }}>
        {L("Партидите на схемите за изпитване. При калибриране партида няма — уредът обикаля, а записите са във веригата на схемата.", "The batches of the testing schemes. A calibration scheme has none — the instrument travels, and its records are the scheme's chain.")}
      </p>
      {schemes.length === 0 ? (
        <div className="card p-4 mt-4" style={{ color: "var(--muted)" }}>{L("Няма схеми за изпитване.", "No testing schemes.")}</div>
      ) : (
        <div className="mt-4 grid gap-3">
          {schemes.map((s) => (
            <div key={s.id} className="card p-4" data-batches-scheme={s.id}>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-bold" style={{ color: "var(--green-dark)" }}>{s.number}</span>
                <span style={{ color: "var(--muted)", fontSize: 13 }}>{s.name?.trim() || (lang === "bg" ? s.titleBg : s.titleEn)}</span>
                <span style={{ flex: 1 }} />
                <Link href={`/schemes/${s.id}/batches`} className="btn btn-sm">{L("Партиди", "Batches")} ({(s.batches ?? []).length})</Link>
              </div>
              {(s.batches ?? []).length > 0 && (
                <ul className="text-sm mt-2" style={{ paddingLeft: 18 }}>
                  {(s.batches ?? []).map((b) => (
                    <li key={b.id}>{b.label} · {b.material} · {fmtSchemeDate(b.preparedOn)} · {b.objects.length} {L("обекта", "objects")} · {b.draw ? L("изтеглени", "drawn") : L("неизтеглени", "not drawn")}{b.homogeneity?.length ? ` · ${b.homogeneity.length} ${L("стойности", "values")}` : ""}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

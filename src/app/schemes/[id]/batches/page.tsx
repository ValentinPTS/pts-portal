import Link from "next/link";
import { notFound } from "next/navigation";
import { mayNow, requireCap } from "@/lib/access";
import { getScheme } from "@/lib/store";
import { requireStaff } from "@/lib/roles";
import { getServerT } from "@/lib/i18n-server";
import { listStaff } from "@/lib/staff";
import { OBJECT_ROLES, ROLE_LABEL, homogeneityKey, currentHomogeneity } from "@/lib/batches-model";
import { sofiaDay } from "@/lib/chain";
import { characteristicLabel } from "@/lib/characteristics-model";
import { fmtSchemeDate } from "@/lib/scheme-dates";
import BatchForms from "@/components/BatchForms";

export const dynamic = "force-dynamic";

// «Обекти и партиди» of one scheme (plan part 3.5; Реш. 151 / А18; D3): each batch with
// its fields — identification, material and origin, date of preparation and packing,
// the objects prepared, the storage conditions, the link to the homogeneity and
// stability record — its objects and their roles, drawn at random once, and the
// homogeneity values for 2.0's `Homogeneity` sheet. A calibration scheme has none: one
// instrument travels, and its record is the chain. Codes of objects only — no
// laboratory is named here.
export default async function SchemeBatchesPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  await requireCap("codes.view", id); // in THIS scheme, by the role model (2.4)
  const s = await getScheme(id);
  if (!s) notFound();
  const { lang } = await getServerT();
  const lg: "bg" | "en" = lang === "bg" ? "bg" : "en";
  const L = (bg: string, en: string) => (lg === "bg" ? bg : en);
  const canEdit = (await mayNow("items.manage", id)) || (await mayNow("scheme.edit", id));
  const canValues = canEdit || (await mayNow("results.process", id));
  const staff = await listStaff();
  const nameOf = (email: string) => staff.find((u) => u.email.toLowerCase() === email.toLowerCase())?.name || email;
  // the name and the method together (the names repeat, 3.6)
  const characteristics = s.parameters.map((p, i) => `${i + 1}. ${characteristicLabel(p, lg)}`);

  return (
    <div>
      <Link href={`/schemes/${id}`} className="text-sm" style={{ color: "var(--muted)" }}>← {s.number}</Link>
      <h1 className="text-2xl font-bold mt-2" style={{ color: "var(--green-dark)" }}>{L("Обекти и партиди", "Objects and batches")}</h1>
      {s.type === "C" ? (
        <div className="card p-4 mt-4" data-no-batch>
          {L("При схема за калибриране партида няма: един калибрационен обект обикаля между лабораториите и записите се водят за него — във веригата на схемата (Реш. 151).",
             "A calibration scheme has no batch: one calibration object travels between the laboratories and its records are kept for it — in the scheme's chain (Реш. 151).")}
        </div>
      ) : (
        <>
          <p className="text-sm mt-1" style={{ color: "var(--muted)", maxWidth: 780 }}>
            {L("Партида е съвкупността от обекти, приготвени от един материал в един процес на подготовка и опаковане. Всеки обект е в точно една партида. Обектите за хомогенност, стабилност, участници и резерва се теглят на случаен принцип от партидата — веднъж, от портала, със запис кой и кога.",
               "A batch is the set of objects prepared from one material in one process of preparation and packing. Each object is in exactly one batch. The homogeneity, stability, participant and reserve objects are drawn at random from the batch — once, by the portal, on record of who and when.")}
          </p>
          {(s.batches ?? []).length === 0 && <div className="card p-4 mt-4" data-batches-none style={{ color: "var(--muted)" }}>{L("Няма записани партиди.", "No batches recorded.")}</div>}
          <div className="grid gap-4 mt-4">
            {(s.batches ?? []).map((b) => (
              <div key={b.id} className="card p-4" data-batch={b.label}>
                <div className="font-bold" style={{ color: "var(--green-dark)" }}>{L("Партида", "Batch")} {b.label}</div>
                <dl className="text-sm mt-2 grid gap-1" style={{ gridTemplateColumns: "minmax(160px, 240px) 1fr" }}>
                  <dt style={{ color: "var(--muted)" }}>{L("Материал и произход", "Material and origin")}</dt><dd>{b.material}</dd>
                  <dt style={{ color: "var(--muted)" }}>{L("Подготовка и опаковане", "Prepared and packed")}</dt><dd>{fmtSchemeDate(b.preparedOn)}</dd>
                  <dt style={{ color: "var(--muted)" }}>{L("Приготвени обекти", "Objects prepared")}</dt><dd>{b.objects.length} ({b.objects[0]?.code} … {b.objects[b.objects.length - 1]?.code})</dd>
                  <dt style={{ color: "var(--muted)" }}>{L("Условия на съхранение", "Storage conditions")}</dt><dd>{b.storage || "—"}</dd>
                  <dt style={{ color: "var(--muted)" }}>{L("Запис за хомогенност и стабилност", "Homogeneity and stability record")}</dt><dd data-batch-record>{b.hsRecord || "—"}</dd>
                  <dt style={{ color: "var(--muted)" }}>{L("Записана", "Recorded")}</dt><dd>{fmtSchemeDate(sofiaDay(b.createdAt))} · {nameOf(b.createdBy)}</dd>
                </dl>
                {b.draw ? (
                  <div className="mt-3" data-batch-drawn>
                    <div className="text-sm font-bold">{L("Изтеглени на случаен принцип", "Drawn at random")} · {fmtSchemeDate(b.draw.day)} · {nameOf(b.draw.by)}</div>
                    {OBJECT_ROLES.map((r) => {
                      const codes = b.objects.filter((o) => o.role === r).map((o) => o.code);
                      return codes.length ? (
                        <div key={r} className="text-sm mt-1" data-role={r}><b>{ROLE_LABEL[r][lg]} ({codes.length}):</b> <span className="font-mono">{codes.join(", ")}</span></div>
                      ) : null;
                    })}
                    {b.objects.some((o) => !o.role) && <div className="text-sm mt-1" style={{ color: "var(--muted)" }}>{L("Неразпределени", "Unassigned")}: {b.objects.filter((o) => !o.role).length}</div>}
                  </div>
                ) : (
                  <p className="text-sm mt-3" style={{ color: "var(--muted)" }}>{L("Обектите още не са изтеглени.", "The objects are not drawn yet.")}</p>
                )}
                {!!b.homogeneity?.length && (
                  <div className="mt-3" data-homogeneity={b.homogeneity.length} style={{ overflowX: "auto" }}>
                    <div className="text-sm font-bold">{L("Стойности за хомогенност и стабилност", "Homogeneity and stability values")} ({currentHomogeneity(b.homogeneity).length}{b.homogeneity.length > currentHomogeneity(b.homogeneity).length ? L(`; поправени: ${b.homogeneity.length - currentHomogeneity(b.homogeneity).length}`, `; corrected: ${b.homogeneity.length - currentHomogeneity(b.homogeneity).length}`) : ""})</div>
                    <table className="text-sm mt-1" style={{ borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
                      <thead><tr>{["series", "sample_code", "characteristic", "replicate", "value", ""].map((h) => <th key={h} className="p-1" style={{ textAlign: "left", color: "var(--muted)", fontWeight: 600 }}>{h}</th>)}</tr></thead>
                      <tbody>
                        {b.homogeneity.map((h, i) => {
                          // a later value of the same key corrects this one: shown, struck through
                          const corrected = b.homogeneity!.slice(i + 1).some((x) => homogeneityKey(x) === homogeneityKey(h));
                          return (
                            <tr key={i} data-corrected={corrected ? "1" : "0"} style={{ borderTop: "1px solid var(--line)", color: corrected ? "var(--muted)" : undefined, textDecoration: corrected ? "line-through" : undefined }}>
                              <td className="p-1">{h.series}</td><td className="p-1 font-mono">{h.sampleCode}</td>
                              <td className="p-1">{h.characteristic === null ? <s>{h.characteristicName}</s> : `${h.characteristic + 1}. ${h.characteristicName}`}{h.characteristicId && <span className="font-mono" style={{ color: "var(--muted)", fontSize: 11 }}> {h.characteristicId}</span>}</td>
                              <td className="p-1">{h.replicate}</td><td className="p-1">{h.value}</td>
                              <td className="p-1" style={{ fontSize: 11, color: "var(--muted)" }}>{h.at ? `${fmtSchemeDate(sofiaDay(h.at))} · ${nameOf(h.by ?? "")}` : ""}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <BatchForms schemeId={id} lang={lg} mode="batch" batchId={b.id} drawn={!!b.draw} objects={b.objects.length} canEdit={canEdit} canValues={canValues} characteristics={characteristics} record={b.hsRecord ?? ""}
                  fields={{ label: b.label, material: b.material, preparedOn: b.preparedOn, storage: b.storage, prefix: b.prefix, count: b.objects.length }} />
              </div>
            ))}
          </div>
          {canEdit && <BatchForms schemeId={id} lang={lg} mode="new" canEdit canValues={canValues} characteristics={characteristics} />}
        </>
      )}
    </div>
  );
}

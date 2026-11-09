import Link from "next/link";
import { notFound } from "next/navigation";
import { mayNow, requireOneOf } from "@/lib/access";
import { getScheme } from "@/lib/store";
import { requireStaff } from "@/lib/roles";
import { getServerT } from "@/lib/i18n-server";
import { listStaff } from "@/lib/staff";
import { fmtSchemeDate } from "@/lib/scheme-dates";
import { sofiaDay } from "@/lib/chain";
import { pointKeys, pointsReady, fingerprint, orphans, currentRows, derived, missingFor2, referenceRole, REFERENCE_FIELDS, REFERENCE_FIELD_LABEL } from "@/lib/reference-values-model";
import ReferenceValuesForm from "@/components/ReferenceValuesForm";

export const dynamic = "force-dynamic";

// «Референтни стойности по точки» of a calibration scheme (plan part 5.7; Zadanie
// «Приписана и референтна стойност»; D3: 2.0's «Calibration» sheet): per calibration point —
// × the direction, when there are directions — the reference laboratory's ERROR at the point
// before the first participant and after the last (the same quantity a participant reports as
// its `mean`, D3), u_calibration, u_other and k. For PTS's eye, the Zadanie's X_ref and u_stab
// in errors; 2.0 computes the official ones. The reference stops of the chain with their
// dates. Each save a version, kept. The device's numbers — no laboratory is named here.
export default async function ReferenceValuesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string }> }) {
  await requireStaff();
  const { id } = await params;
  await requireOneOf(["results.read", "scheme.edit", "results.process"], id); // in THIS scheme (2.4)
  const s = await getScheme(id);
  if (!s) notFound();
  const sp = await searchParams;
  const { lang } = await getServerT();
  const lg: "bg" | "en" = lang === "bg" ? "bg" : "en";
  const L = (bg: string, en: string) => (lg === "bg" ? bg : en);
  const T = (x: { bg: string; en: string }) => (lg === "bg" ? x.bg : x.en);
  const open = s.status === "draft" || s.status === "open" || s.status === "running" || s.status === "processing";
  const ready = pointsReady(s.calibration);
  const canEdit = open && ready && ((await mayNow("scheme.edit", id)) || (await mayNow("results.process", id)));
  const keys = pointKeys(s.calibration);
  const rows = currentRows(s.referenceValues);
  const versions = s.referenceValues?.versions ?? [];
  const latest = versions[versions.length - 1];
  const missing = missingFor2(keys, rows);
  const lost = orphans(rows, keys);
  const staff = await listStaff();
  const nameOf = (email: string) => staff.find((u) => u.email.toLowerCase() === email.toLowerCase())?.name || email;
  const stops = s.chain?.stops ?? [];
  const refStops = stops.filter((x) => x.kind === "ref").map((x) => ({ x, role: referenceRole(stops, x.id) }));
  const unit = s.calibration?.unit ?? "";
  // eight significant figures, trailing zeros off — enough to look at; 2.0 keeps the full ones
  const num = (n: number) => String(Number(n.toPrecision(8)));
  const label = (k: (typeof keys)[number]) => `${k.nominal}${unit ? ` ${unit}` : ""}${k.direction ? ` · ${T(k.direction)}` : ""}`;
  const formRows = keys.map((k) => {
    const r = rows[k.key];
    const dv = derived(r);
    const sc = s.scoring?.assigned?.[`${k.dirIdx ?? 0}:${k.pointIdx}`]?.xpt;
    return {
      key: k.key, label: label(k),
      values: Object.fromEntries(REFERENCE_FIELDS.map((f) => [f, r?.[f] === undefined ? "" : String(r[f])])),
      ...(dv ? { xRef: num(dv.xRef), uStab: num(dv.uStab) } : {}),
      ...(sc !== undefined && Number.isFinite(sc) ? { scoringXref: num(sc) } : {}),
    };
  });

  return (
    <div>
      <Link href={`/schemes/${id}`} className="text-sm" style={{ color: "var(--muted)" }}>← {s.number}</Link>
      <h1 className="text-2xl font-bold mt-2" style={{ color: "var(--green-dark)" }}>{L("Референтни стойности по точки", "Reference values per point")}</h1>
      {s.type !== "C" ? (
        <div className="card p-4 mt-4" data-no-reference>{L("Референтни стойности има само схема за калибриране — при изпитване приписаната стойност се определя иначе.", "Only a calibration scheme has reference values — in testing the assigned value is set otherwise.")}</div>
      ) : (
        <>
          <p className="text-sm mt-1" style={{ color: "var(--muted)", maxWidth: 860 }}>
            {L("Обектът се калибрира от референтната лаборатория преди първия участник и отново след последния. За всяка точка се записва грешката на уреда, измерена от референтната лаборатория (показание − референтна стойност) — същата величина, която участникът подава като резултат (D3) —, преди и след, u от калибрирането, u от друго и k: колоните на листа «Calibration» на PTS_Analysis 2.0. X_ref = (преди + след)/2 и u_stab = |преди − след|/(2√3) тук са само за преглед; официалните ги смята 2.0.",
              "The object is calibrated by the reference laboratory before the first participant and again after the last. Per point, the instrument's error as the reference laboratory measured it (indication − reference value) — the same quantity a participant reports as its result (D3) —, before and after, u from the calibration, u from other sources and k: the columns of PTS_Analysis 2.0's «Calibration» sheet. X_ref = (before + after)/2 and u_stab = |before − after|/(2√3) are shown here only to look at; 2.0 computes the official ones.")}
          </p>
          <p className="text-xs mt-1" style={{ color: "#8a5a00", maxWidth: 860 }} data-u-other-note>
            {L("Какво влиза в «u (друго)» е въпрос към PTS (писмо REPLY-3, т. г) — записва се както е въведено, нищо не се изчислява от него.", "What «u (other)» holds is asked of PTS (letter REPLY-3, item г) — it is kept as typed, nothing is computed from it.")}
          </p>
          {sp.ok && <div role="status" data-reference-ok={sp.ok} className="card p-3 mt-3 text-sm" style={{ background: "var(--green-soft)", border: "1px solid var(--line)" }}>{sp.ok === "same" ? L("Нищо не се промени — нова версия не е записана.", "Nothing changed — no new version recorded.") : L(`Записано като версия ${versions.length}.`, `Saved as version ${versions.length}.`)}</div>}

          <section className="card p-4 mt-4" data-reference-stops>
            <h2 className="font-bold" style={{ color: "var(--green-dark)" }}>{L("Референтните спирки във веригата", "The reference stops of the chain")}</h2>
            {refStops.length === 0 ? (
              <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>{L("Веригата още няма референтна спирка — подредете я на страницата на схемата.", "The chain has no reference stop yet — order it on the scheme's page.")}</p>
            ) : (
              <ul className="text-sm mt-1" style={{ listStyle: "none", padding: 0 }}>
                {refStops.map(({ x, role }) => (
                  <li key={x.id} data-reference-stop={role ?? "between"}>
                    <b>{role === "before" ? L("Преди участниците", "Before the participants") : role === "after" ? L("След участниците — краят на измерванията", "After the participants — the end of the measurements") : L("Между участниците", "Between the participants")}</b>
                    {": "}{x.receivedAt ? `${L("получен", "received")} ${fmtSchemeDate(sofiaDay(x.receivedAt))}` : L("още не е получен", "not received yet")}{x.sentAt ? ` · ${L("върнат", "sent back")} ${fmtSchemeDate(sofiaDay(x.sentAt))}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {keys.length === 0 ? (
            <div className="card p-4 mt-4" style={{ color: "var(--muted)" }}>{L("Схемата още няма точки на калибриране — добавете ги в редакцията на схемата.", "The scheme has no calibration points yet — add them in the scheme's editor.")}</div>
          ) : (
            <section className="card p-4 mt-4">
              {!ready && <p role="note" data-reference-ids className="text-sm" style={{ color: "#8a5a00" }}>{L("Точките на схемата още нямат постоянни номера — запазете веднъж редакцията на схемата, преди да записвате стойности (иначе те биха следвали мястото, а не точката).", "The scheme's points have no lasting ids yet — save the scheme's editor once before recording values (else they would follow the place, not the point).")}</p>}
              <div className="flex items-center gap-3 flex-wrap text-sm" data-reference-missing={`${missing.before}/${missing.after}/${missing.uCal}`}>
                <b>{L("За 2.0 още липсват", "Still missing for 2.0")}:</b>
                <span>{L(`преди — ${missing.before}`, `before — ${missing.before}`)}</span>
                <span>{L(`след — ${missing.after}`, `after — ${missing.after}`)}</span>
                <span>{L(`u (калибриране) — ${missing.uCal}`, `u (calibration) — ${missing.uCal}`)}</span>
                <span style={{ color: "var(--muted)" }}>{L("(k по подразбиране е 2; «u (друго)» може да е празно)", "(k is 2 by default; «u (other)» may be empty)")}</span>
              </div>
              <ReferenceValuesForm lang={lg} schemeId={id} version={versions.length} fp={fingerprint(keys)} rows={formRows}
                fields={REFERENCE_FIELDS.map((f) => ({ f, label: T(REFERENCE_FIELD_LABEL[f]) }))} kReason={latest?.kReason ?? ""} canEdit={canEdit} />
              {!canEdit && <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>{!open ? L("След доклада стойностите не се променят.", "After the report the values are not changed.") : L("Записва ръководителят на схемата или който обработва резултатите.", "The scheme manager, or who processes the results, records them.")}</p>}
              {lost.length > 0 && (
                <div className="text-xs mt-3" data-reference-orphans={lost.length} style={{ color: "#8a5a00" }}>
                  <b>{L("Стойности на точки, които вече ги няма в схемата (пазят се):", "Values of points no longer in the scheme (kept):")}</b>
                  <ul style={{ paddingLeft: 18, margin: "4px 0 0" }}>
                    {lost.map((k) => <li key={k} data-orphan={k}>{k}: {REFERENCE_FIELDS.filter((f) => rows[k]?.[f] !== undefined).map((f) => `${T(REFERENCE_FIELD_LABEL[f])} ${rows[k][f]}`).join(" · ")}</li>)}
                  </ul>
                </div>
              )}
              {latest?.kReason && <p className="text-xs mt-2" style={{ color: "var(--muted)" }} data-k-reason>{L("Обосновка за k ≠ 2", "Why k ≠ 2")}: {latest.kReason}</p>}
            </section>
          )}

          {versions.length > 0 && (
            <section className="card p-4 mt-4" data-reference-versions={versions.length}>
              <h2 className="font-bold" style={{ color: "var(--green-dark)" }}>{L("Версии", "Versions")}</h2>
              <ol className="text-sm mt-1" style={{ paddingLeft: 18 }}>
                {versions.map((v, i) => <li key={i}>{L(`Версия ${i + 1}`, `Version ${i + 1}`)} · {fmtSchemeDate(sofiaDay(v.at))} · {nameOf(v.by)} · {Object.keys(v.rows).length} {L("точки", "points")}</li>)}
              </ol>
            </section>
          )}
        </>
      )}
    </div>
  );
}

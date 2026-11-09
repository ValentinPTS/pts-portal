import Link from "next/link";
import { mayNow, requireCap } from "@/lib/access";
import { notFound } from "next/navigation";
import { getScheme } from "@/lib/store";
import { listParticipants } from "@/lib/participants";
import { isProvisional } from "@/lib/coding-model";
import { namesFor } from "@/lib/identities";
import { metricsForScheme, scoreMetric, scoringStamp, type ScoredRow } from "@/lib/scoring";
import { saveScoringAction, autoAssignAction } from "@/lib/actions";
import { getServerT } from "@/lib/i18n-server";
import { requireStaff } from "@/lib/roles";
import { logActivity } from "@/lib/activity";

const inputCls = "w-full rounded px-2 py-1 text-sm";
const inputStyle = { border: "1px solid var(--line)", background: "#fff" } as const;
const numStyle = { ...inputStyle, textAlign: "right" as const };

// stored numbers → input value (strip float noise, blank for missing)
const fv = (v: number | undefined) =>
  v === undefined || Number.isNaN(v) ? "" : String(parseFloat(v.toFixed(6)));
const score = (v: number | null) => (v === null || Number.isNaN(v) ? "—" : v.toFixed(2));

function NumCell({ name, def }: { name: string; def: string }) {
  return (
    <input name={name} defaultValue={def} inputMode="decimal" className={inputCls} style={numStyle} placeholder="—" />
  );
}

function verdictBadge(r: ScoredRow | undefined, tr: (k: string) => string) {
  if (!r || r.verdict === null) return <span style={{ color: "var(--muted)" }}>—</span>;
  const map: Record<string, [string, string]> = {
    satisfactory: [tr("verdict.ok"), "var(--success)"],
    warning: [tr("verdict.warn"), "#b8860b"],
    action: [tr("verdict.action"), "var(--red)"],
    A: [tr("results.gradeA"), "var(--success)"],
    N: [tr("results.gradeN"), "var(--red)"],
  };
  const [text, color] = map[r.verdict] ?? ["—", "var(--muted)"];
  return <span style={{ color, fontWeight: 700 }}>● {text}</span>;
}

export default async function ResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ err?: string; warn?: string; n?: string }>;
}) {
  await requireStaff(); // read gate: manager/staff/auditor only
  const { id } = await params;
  await requireCap("results.read", id); // in THIS scheme, by the role model (2.4)
  const { err, warn, n } = await searchParams;
  const s = await getScheme(id);
  if (!s) notFound();
  // results only for a coded participation — an application has none before the coding act (5.3)
  const participants = await namesFor(id, (await listParticipants(id)).filter((p) => !isProvisional(p.code))); // names only for a manager, on record (2.3)
  const metrics = metricsForScheme(s);
  const isCal = s.type === "C";
  // Blind evaluation (§4.2, N1): staff and auditors enter and read results by code
  // only; the laboratory column exists for a manager alone.
  const reveal = await mayNow("names.view", id);
  // who may save here: results entered or processed; the consensus value: processed (2.4)
  const canSave = (await mayNow("results.enter", id)) || (await mayNow("results.process", id));
  const canProcess = await mayNow("results.process", id);
  if (reveal && participants.length) await logActivity("names.viewed", { schemeId: id, subject: "page:results", summary: "Laboratory names shown with their codes — the results page" });
  const { lang, tr } = await getServerT();
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);

  return (
    <div>
      <Link href={`/schemes/${id}`} className="text-sm" style={{ color: "var(--muted)" }}>
        ← {s.number}
      </Link>
      <h1 className="text-2xl font-bold mt-2" style={{ color: "var(--green-dark)" }}>
        {tr("results.title")}
      </h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        {tr(isCal ? "results.subtitleCal" : "results.subtitleTest")}
      </p>
      {/* Реш. 135 (part 0.6): the engine is a staff working check — never official */}
      <div className="card p-3 mt-3 text-sm" style={{ background: "#fdf6e3", border: "1px solid #e6d9a8", color: "#7a5c00" }}>
        <b>{tr("results.unofficialTitle")}</b> {tr("results.unofficialBody")}
      </div>

      {err === "conflict" && (
        <div className="card p-3 mt-3 text-sm" style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f" }}>
          <b>{L("Промените НЕ са запазени.", "Your changes were NOT saved.")}</b>{" "}
          {L(
            "Резултатите или участниците са променени, откакто отворихте тази страница — записът е отказан, за да не изтрие чуждите въведени данни. Страницата вече показва актуалните стойности; въведете промените си отново.",
            "The results or participants changed after you opened this page — the save was refused so it could not erase someone else's entries. The page now shows the current values; please re-enter your changes."
          )}
        </div>
      )}

      {warn === "minpart" && (
        <div className="card p-3 mt-3 text-sm" style={{ background: "#fdf6e3", border: "1px solid #e6d9a8", color: "#7a5c00" }}>
          <b>{L("Резултатите СА запазени.", "Your results ARE saved.")}</b>{" "}
          {L(
            `За характеристиките с по-малко от ${n ?? ""} резултата приетата стойност не беше изчислена автоматично: при два резултата устойчивата оценка е изродена — и двете лаборатории получават z = ±0,62, независимо колко се различават. Въведете приетата стойност, σ и u ръчно (Статистически проект §4).`,
            `For characteristics with fewer than ${n ?? ""} results the assigned value was not auto-computed: with two results the robust estimate degenerates — both laboratories score z = ±0.62 however far apart they are. Enter the assigned value, σ and u by hand instead (Statistical project §4).`
          )}
        </div>
      )}

      {participants.length === 0 ? (
        <div className="card p-4 mt-5" style={{ borderLeft: "4px solid var(--amber)" }}>
          <p>{tr("results.noParticipants")}</p>
          <Link href={`/schemes/${id}/participants`} className="btn btn-primary mt-2">
            {tr("results.goParticipants")}
          </Link>
        </div>
      ) : (
        <form action={saveScoringAction} className="mt-4">
          <input type="hidden" name="id" value={s.id} />
          {/* optimistic lock: a fingerprint of the state this form was rendered
              from. The save is refused if anyone saved meanwhile, so one operator
              can never silently overwrite another — see writeScoringIfUnchanged. */}
          <input
            type="hidden"
            name="stamp"
            value={scoringStamp(s.scoring, [...metrics.map((m) => m.key), ...participants.map((p) => p.code)])}
          />

          {metrics.map((m, mi) => {
            const { rows } = scoreMetric(s, m.key);
            const byCode = new Map(rows.map((r) => [r.code, r]));
            const a = s.scoring?.assigned[m.key];
            return (
              <section key={m.key} className="card p-4 mb-5">
                <h2 className="text-lg font-bold pb-1 mb-3" style={{ color: "var(--green-dark)", borderBottom: "2px solid var(--red)" }}>
                  {m.labelEn}
                  <span className="text-sm font-normal ml-2" style={{ color: "var(--muted)" }}>{m.labelBg}</span>
                </h2>

                {/* assigned value row */}
                <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: isCal ? "1fr 1fr" : "1fr 1fr 1fr" }}>
                  <label className="block">
                    <span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>
                      {tr(isCal ? "results.refValue" : "results.assignedValue")}
                    </span>
                    <NumCell name={`a_${mi}_xpt`} def={fv(a?.xpt)} />
                  </label>
                  {!isCal && (
                    <label className="block">
                      <span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("results.sigma")}</span>
                      <NumCell name={`a_${mi}_sigma`} def={fv(a?.sigma)} />
                    </label>
                  )}
                  <label className="block">
                    <span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>
                      {tr(isCal ? "results.uRef" : "results.uXpt")}
                    </span>
                    <NumCell name={`a_${mi}_u`} def={fv(a?.u)} />
                  </label>
                </div>

                {/* per-participant results */}
                <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "var(--green-soft)", color: "var(--green-dark)" }}>
                      <th className="text-left p-2">{tr("col.code")}</th>
                      {reveal && <th className="text-left p-2">{tr("col.laboratory")}</th>}
                      {/* individual determinations I/II/III (F 7.2.1-5) — optional */}
                      <th className="text-left p-2" style={{ width: 76 }}>I</th>
                      <th className="text-left p-2" style={{ width: 76 }}>II</th>
                      <th className="text-left p-2" style={{ width: 76 }}>III</th>
                      <th className="text-left p-2" style={{ width: 110 }}>{isCal ? "X_lab" : "Result xᵢ"}</th>
                      <th className="text-left p-2" style={{ width: 110 }} title={tr(isCal ? "results.uLabTitle" : "results.uHintTitle")}>
                        {isCal ? "U_lab" : "u(xᵢ)"}
                        {!isCal && <div data-u-hint style={{ fontSize: 11, fontWeight: 400, color: "var(--muted)" }}>{tr("results.uHint")}</div>}
                      </th>
                      {isCal ? (
                        <th className="text-right p-2" style={{ width: 70 }}>Eₙ</th>
                      ) : (
                        <>
                          <th className="text-right p-2" style={{ width: 60 }}>z</th>
                          <th className="text-right p-2" style={{ width: 60 }}>ζ</th>
                        </>
                      )}
                      <th className="text-left p-2" style={{ width: 150 }}>{tr("results.evaluation")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {participants.map((p, pi) => {
                      const r = byCode.get(p.code);
                      const stored = s.scoring?.results[p.code]?.[m.key];
                      return (
                        <tr key={p.id} style={{ borderTop: "1px solid var(--line)" }}>
                          <td className="p-2 font-mono font-bold" style={{ color: "var(--green-dark)" }}>{p.code}</td>
                          {reveal && <td className="p-2" style={{ color: "var(--muted)" }}>{p.labName}</td>}
                          <td className="p-1"><NumCell name={`r_${mi}_${pi}_d0`} def={fv(stored?.determinations?.[0] ?? undefined)} /></td>
                          <td className="p-1"><NumCell name={`r_${mi}_${pi}_d1`} def={fv(stored?.determinations?.[1] ?? undefined)} /></td>
                          <td className="p-1"><NumCell name={`r_${mi}_${pi}_d2`} def={fv(stored?.determinations?.[2] ?? undefined)} /></td>
                          <td className="p-1"><NumCell name={`r_${mi}_${pi}_value`} def={fv(stored?.value)} /></td>
                          <td className="p-1"><NumCell name={`r_${mi}_${pi}_u`} def={fv(stored?.u)} /></td>
                          {isCal ? (
                            <td className="p-2 text-right font-mono">{score(r?.en ?? null)}</td>
                          ) : (
                            <>
                              <td className="p-2 text-right font-mono">{score(r?.z ?? null)}</td>
                              <td className="p-2 text-right font-mono">{score(r?.zeta ?? null)}</td>
                            </>
                          )}
                          <td className="p-2">{verdictBadge(r, tr)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            );
          })}

          <div className="flex gap-3 flex-wrap">
            {canSave && <button type="submit" className="btn btn-primary">{tr("results.save")}</button>}
            {!isCal && canProcess && (
              <button
                type="submit"
                formAction={autoAssignAction}
                className="btn"
              >
                {tr("results.autoCompute")}
              </button>
            )}
            <Link href={`/schemes/${id}/doc/report`} className="btn">{tr("results.viewReport")}</Link>
          </div>
          <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
            {tr("results.footnote")}
          </p>
        </form>
      )}
    </div>
  );
}

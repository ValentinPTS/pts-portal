import Link from "next/link";
import { notFound } from "next/navigation";
import { getScheme } from "@/lib/store";
import { listParticipants } from "@/lib/participants";
import { metricsForScheme, scoreMetric, type ScoredRow } from "@/lib/scoring";
import { saveScoringAction, autoAssignAction } from "@/lib/actions";
import { getServerT } from "@/lib/i18n-server";

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
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const s = await getScheme(id);
  if (!s) notFound();
  const participants = await listParticipants(id);
  const metrics = metricsForScheme(s);
  const isCal = s.type === "C";
  const { tr } = await getServerT();

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
                      <th className="text-left p-2">{tr("col.laboratory")}</th>
                      <th className="text-left p-2" style={{ width: 110 }}>{isCal ? "X_lab" : "Result xᵢ"}</th>
                      <th className="text-left p-2" style={{ width: 110 }}>{isCal ? "U_lab" : "u(xᵢ)"}</th>
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
                          <td className="p-2" style={{ color: "var(--muted)" }}>{p.labName}</td>
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
            <button type="submit" className="btn btn-primary">{tr("results.save")}</button>
            {!isCal && (
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

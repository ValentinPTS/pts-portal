import Link from "next/link";
import { notFound } from "next/navigation";
import { getScheme } from "@/lib/store";
import { listParticipants } from "@/lib/participants";
import { metricsForScheme, scoreMetric, type ScoredRow } from "@/lib/scoring";
import { saveScoringAction, autoAssignAction } from "@/lib/actions";

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

function verdictBadge(r?: ScoredRow) {
  if (!r || r.verdict === null) return <span style={{ color: "var(--muted)" }}>—</span>;
  const map: Record<string, [string, string]> = {
    satisfactory: ["Satisfactory", "var(--success)"],
    warning: ["Warning", "#b8860b"],
    action: ["Action", "var(--red)"],
    A: ["A · satisfactory", "var(--success)"],
    N: ["N · unsatisfactory", "var(--red)"],
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

  return (
    <div>
      <Link href={`/schemes/${id}`} className="text-sm" style={{ color: "var(--muted)" }}>
        ← {s.number}
      </Link>
      <h1 className="text-2xl font-bold mt-2" style={{ color: "var(--green-dark)" }}>
        Results &amp; scoring
      </h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Enter each participant&apos;s result and uncertainty, plus the assigned{" "}
        {isCal ? "(reference) value" : "value, σ and its uncertainty"}. Scores —{" "}
        <b>{isCal ? "Eₙ" : "z and ζ"}</b> — are computed on Save (ISO 13528) and flow straight into the Final Report.
      </p>

      {participants.length === 0 ? (
        <div className="card p-4 mt-5" style={{ borderLeft: "4px solid var(--amber)" }}>
          <p>No participants yet — add them before entering results.</p>
          <Link href={`/schemes/${id}/participants`} className="btn btn-primary mt-2">
            👥 Go to Participants
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
                      {isCal ? "Reference value X_ref" : "Assigned value xₚₜ"}
                    </span>
                    <NumCell name={`a_${mi}_xpt`} def={fv(a?.xpt)} />
                  </label>
                  {!isCal && (
                    <label className="block">
                      <span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>σ (proficiency assessment)</span>
                      <NumCell name={`a_${mi}_sigma`} def={fv(a?.sigma)} />
                    </label>
                  )}
                  <label className="block">
                    <span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>
                      {isCal ? "Expanded uncertainty U_ref" : "Uncertainty u(xₚₜ)"}
                    </span>
                    <NumCell name={`a_${mi}_u`} def={fv(a?.u)} />
                  </label>
                </div>

                {/* per-participant results */}
                <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "var(--green-soft)", color: "var(--green-dark)" }}>
                      <th className="text-left p-2">Code</th>
                      <th className="text-left p-2">Laboratory</th>
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
                      <th className="text-left p-2" style={{ width: 150 }}>Evaluation</th>
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
                          <td className="p-2">{verdictBadge(r)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            );
          })}

          <div className="flex gap-3 flex-wrap">
            <button type="submit" className="btn btn-primary">Save &amp; recompute scores</button>
            {!isCal && (
              <button
                type="submit"
                formAction={autoAssignAction}
                className="btn"
                title="Fill the assigned value, σ and u(xₚₜ) from the entered results using ISO 13528 Algorithm A (robust consensus). You can still edit them afterwards."
              >
                ⚙ Save &amp; auto-compute assigned (robust)
              </button>
            )}
            <Link href={`/schemes/${id}/doc/report`} className="btn">View Final Report →</Link>
          </div>
          <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
            Leave a cell blank to skip it. Decimal comma (1,5) or dot (1.5) both work. Scores recompute on every Save.
            {!isCal && " “Auto-compute” derives the assigned value/σ from the participants’ results (robust mean, ISO 13528) — a starting point you can override."}
          </p>
        </form>
      )}
    </div>
  );
}

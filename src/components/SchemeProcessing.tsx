"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLang } from "@/components/LangProvider";
import { designateProcessingAction } from "@/lib/actions";
import { ACTS, coincidences, MIN_JUSTIFICATION, MAX_JUSTIFICATION, type Act, type Coincidence, type ReviewerBasis } from "@/lib/processing-model";

// «Обработка на резултатите» (plan part 2.5, Реш. 140; П 7.4.1 т. 3): who processes,
// who reviews and who approves this scheme. Everyone who opens the scheme sees it;
// the head of the PT provider designates them from the Order. Two acts on one person
// are flagged as they are chosen, and need a written justification to be saved.

export type PersonRef = { email: string; name: string };
export type DesignationView = {
  id: string;
  processor: PersonRef;
  reviewer: PersonRef & { basis: ReviewerBasis };
  approver: PersonRef;
  coincide: Coincidence[];
  justification: string;
  setBy: string;
  setOn: string; // the date, formatted on the server
  endedOn?: string;
};
export type CandidateView = PersonRef & { basis?: ReviewerBasis };

const PERSON: Record<Act, "processor" | "reviewer" | "approver"> = { process: "processor", review: "reviewer", approve: "approver" };

export default function SchemeProcessing({ schemeId, current, stale, history, candidates, canDesignate }: {
  schemeId: string;
  current: DesignationView | null;
  stale: boolean;
  history: DesignationView[];
  candidates: { processors: CandidateView[]; reviewers: CandidateView[]; approvers: CandidateView[] };
  canDesignate: boolean;
}) {
  const { t } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState("");
  const [pick, setPick] = useState({ processor: "", reviewer: "", approver: "" }); // set when the form opens
  const [justification, setJustification] = useState("");
  const coincide = coincidences(pick);
  const list: Record<Act, CandidateView[]> = { process: candidates.processors, review: candidates.reviewers, approve: candidates.approvers };
  const who = (p: PersonRef) => (p.name ? `${p.name} · ${p.email}` : p.email);

  function save(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const fd = new FormData();
    fd.set("schemeId", schemeId);
    fd.set("processor", pick.processor);
    fd.set("reviewer", pick.reviewer);
    fd.set("approver", pick.approver);
    fd.set("justification", coincide.length ? justification : "");
    start(async () => {
      const res = await designateProcessingAction(fd);
      if (res?.error) { setErr(res.error); return; }
      setEditing(false);
      setJustification("");
      router.refresh();
    });
  }

  const field = { border: "1px solid var(--line)", borderRadius: 8, padding: "5px 8px", fontSize: 13, background: "#fff", maxWidth: "100%" } as const;
  const warn = { background: "#fff6e5", border: "1px solid #e8c37a", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: "#6b4a00" } as const;

  return (
    <section data-processing className="card" style={{ padding: "12px 16px", margin: "12px 0" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <h2 className="font-bold" style={{ color: "var(--green-dark)", fontSize: 15 }}>{t("proc.title")}</h2>
        {canDesignate && !editing && (
          <button type="button" className="btn btn-sm" data-processing-edit style={{ marginLeft: "auto", fontSize: 12 }} onClick={() => {
            // start from what is designated now (the page may have refreshed since)
            // …but only who may still be chosen: a stale pick would stay hidden in the
            // field and still count for the coincidence warning
            const keep = (email: string | undefined, c: CandidateView[]) => (email && c.some((x) => x.email === email) ? email : "");
            setPick({ processor: keep(current?.processor.email, candidates.processors), reviewer: keep(current?.reviewer.email, candidates.reviewers), approver: keep(current?.approver.email, candidates.approvers) });
            setJustification(""); setErr(""); setEditing(true);
          }}>
            {t(current ? "proc.change" : "proc.edit")}
          </button>
        )}
      </div>
      <p className="text-xs mt-1 mb-2" style={{ color: "var(--muted)", maxWidth: 760 }}>{t("proc.hint")}</p>
      {err && <p role="alert" className="mb-2" style={{ color: "var(--red)", fontSize: 13 }}>{err}</p>}

      {!editing ? (
        <>
          {stale && <p data-processing-stale role="status" className="mb-2" style={warn}>{t("proc.stale")}</p>}
          {!current ? (
            <p data-processing-none style={{ color: "var(--muted)", fontSize: 13 }}>{t("proc.none")}</p>
          ) : (
            <>
              <div style={{ overflowX: "auto" }}>
                <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "var(--green-soft)", color: "var(--green-dark)" }}>
                      <th className="text-left p-2">{t("proc.col.act")}</th>
                      <th className="text-left p-2">{t("proc.col.who")}</th>
                      <th className="text-left p-2">{t("proc.col.designated")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ACTS.map((act) => {
                      const p = current[PERSON[act]];
                      return (
                        <tr key={act} data-act={act} style={{ borderTop: "1px solid var(--line)" }}>
                          <td className="p-2 align-top">{t(`proc.act.${act}`)}</td>
                          <td className="p-2 align-top" style={{ color: "var(--muted)" }}>{t(`proc.who.${act}`)}</td>
                          <td className="p-2 align-top" data-designated={p.email}>
                            <div>{p.name || p.email}</div>
                            {p.name && <div className="text-xs font-mono" style={{ color: "var(--muted)" }}>{p.email}</div>}
                            {act === "review" && <div className="text-xs" style={{ color: "var(--muted)" }}>{t(`proc.basis.${current.reviewer.basis}`)}</div>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {current.coincide.length > 0 && (
                <div data-processing-coincide className="mt-2" style={warn}>
                  <b>{t("proc.coincide")}:</b> {current.coincide.map((c) => t(`proc.coincide.${c}`)).join(", ")}.
                  <div className="mt-1" style={{ whiteSpace: "pre-wrap" }}>{current.justification}</div>
                </div>
              )}
              <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>{t("proc.setBy")} {current.setBy} · {current.setOn}</p>
            </>
          )}
          {history.length > 0 && (
            <details className="mt-2" data-processing-history>
              <summary className="text-xs" style={{ color: "var(--muted)", cursor: "pointer" }}>{t("proc.history")} ({history.length})</summary>
              <ul className="text-xs mt-1 flex flex-col gap-1" style={{ color: "var(--muted)" }}>
                {history.map((d) => (
                  <li key={d.id}>
                    {d.setOn}–{d.endedOn} ({t("proc.ended")}): {who(d.processor)} / {who(d.reviewer)} / {who(d.approver)}
                    {d.coincide.length > 0 && <> — {d.coincide.map((c) => t(`proc.coincide.${c}`)).join(", ")}: «{d.justification}»</>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      ) : (
        <form onSubmit={save} data-processing-form className="flex flex-col gap-3">
          {ACTS.map((act) => {
            const key = PERSON[act];
            return (
              <label key={act} className="block">
                <span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{t(`proc.act.${act}`)} — {t(`proc.who.${act}`)} *</span>
                {list[act].length === 0 ? (
                  <span data-no-candidates={act} className="text-sm" style={{ color: "var(--red)" }}>{t("proc.noCandidates")}</span>
                ) : (
                  <select data-pick={act} value={pick[key]} required style={field}
                    onChange={(e) => setPick((p) => ({ ...p, [key]: e.target.value }))}>
                    <option value="" />
                    {list[act].map((c) => (
                      <option key={c.email} value={c.email}>{who(c)}{c.basis ? ` — ${t(`proc.basis.${c.basis}`)}` : ""}</option>
                    ))}
                  </select>
                )}
              </label>
            );
          })}
          {coincide.length > 0 && (
            <div data-coincide-warning style={warn}>
              <b>{t("proc.coincide")}:</b> {coincide.map((c) => t(`proc.coincide.${c}`)).join(", ")}.
              <label className="block mt-2">
                <span className="block text-xs mb-0.5">{t("proc.justification")}</span>
                <textarea data-justification value={justification} onChange={(e) => setJustification(e.target.value)} required
                  minLength={MIN_JUSTIFICATION} maxLength={MAX_JUSTIFICATION} rows={3} className="w-full" style={{ ...field, width: "100%" }} />
                <span className="block text-xs mt-0.5">{t("proc.justificationHint")}</span>
              </label>
            </div>
          )}
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary" disabled={pending}>{t("proc.save")}</button>
            <button type="button" className="btn" disabled={pending} onClick={() => { setEditing(false); setErr(""); }}>{t("proc.cancel")}</button>
          </div>
        </form>
      )}
    </section>
  );
}

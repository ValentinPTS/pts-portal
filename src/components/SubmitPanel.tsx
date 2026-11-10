"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { submitResultsAction, type SubmitReceipt } from "@/lib/actions";
import { SUBMIT_PROBLEM_TEXT } from "@/lib/submission-model";
import { blocking, type CheckProblem } from "@/lib/results-model";
import CheckReport from "./CheckReport";

// «Прегледай и подай» (plan part 6.4; Zadanie §7; D1): the draft saved first; the checks (6.3) — a
// blocking problem stops here, the notices go on; a summary of what will be submitted; the
// confirmations (the results ours, as entered; a part subcontracted — which; calibration: the
// computed errors confirmed); «Подай» → the receipt: the version, the date and hour, the account,
// the receipt's number, the configuration's version.

export default function SubmitPanel({ schemeId, participantId, lang, kind, flush, problems, summary, labelOf, open }: {
  schemeId: string; participantId: string; lang: "bg" | "en"; kind: "T" | "C";
  /** save the draft now — its revision, or null when it could not be saved */
  flush: () => Promise<number | null>;
  /** the checks as the form is now */
  problems: () => CheckProblem[];
  summary: () => ReactNode;
  labelOf: (p: CheckProblem) => string;
  /** the form takes a submission now (before the deadline, or under PTS's unlock) */
  open: boolean;
}) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const router = useRouter();
  const [stage, setStage] = useState<"idle" | "preparing" | "review" | "sending" | "done">("idle");
  const [rev, setRev] = useState<number | null>(null);
  const [checked, setChecked] = useState<CheckProblem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<SubmitReceipt | null>(null);
  const [c, setC] = useState({ truthful: false, subcontracted: false, subcontractedPart: "", errorsConfirmed: false });

  // the review's own id for this submission — a retry after a lost answer is never a second version
  const [nonce, setNonce] = useState<string | null>(null);
  const review = async () => {
    setError(null); setReceipt(null); setStage("preparing");
    const r = await flush();
    if (r === null) { setStage("idle"); setError(L("Черновата не можа да се запише — прегледът изчаква.", "The draft could not be saved — the review waits.")); return; }
    setRev(r); setChecked(problems()); setNonce(crypto.randomUUID()); setStage("review");
  };
  const submit = async () => {
    if (rev === null || nonce === null) return;
    setStage("sending"); setError(null);
    // what was reviewed and confirmed is what goes: saved now — changed since the review (typed
    // during it, or an autosave that had failed), the review again and the confirmations again
    // (D1: the errors confirmed are the errors submitted — 6.4 review)
    const now = await flush();
    if (now === null) { setStage("review"); setError(L("Черновата не можа да се запише — подаването изчаква.", "The draft could not be saved — the submission waits.")); return; }
    if (now !== rev) {
      setRev(now); setChecked(problems()); setNonce(crypto.randomUUID());
      setC((x) => ({ ...x, truthful: false, errorsConfirmed: false }));
      setStage("review"); setError(L(SUBMIT_PROBLEM_TEXT.changed.bg, SUBMIT_PROBLEM_TEXT.changed.en));
      return;
    }
    let r: Awaited<ReturnType<typeof submitResultsAction>>;
    try { r = await submitResultsAction(schemeId, participantId, rev, c, nonce); }
    catch { setStage("review"); setError(L(SUBMIT_PROBLEM_TEXT.unknown.bg, SUBMIT_PROBLEM_TEXT.unknown.en)); router.refresh(); return; }
    if ("ok" in r) { setReceipt(r.receipt); setStage("done"); router.refresh(); return; }
    setStage("review");
    if (r.error === "checks" && "problems" in r && r.problems) setChecked(r.problems);
    const t = SUBMIT_PROBLEM_TEXT[r.error];
    setError(t ? L(t.bg, t.en) : L("Подаването НЕ е записано.", "The submission was NOT recorded."));
  };
  const when = (iso: string) => new Intl.DateTimeFormat(lang === "bg" ? "bg-BG" : "en-GB", { timeZone: "Europe/Sofia", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "short" }).format(new Date(iso));

  if (!open) return null;
  const blocks = checked ? blocking(checked) : [];
  return (
    <section className="card" data-submit-panel={stage} style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
      {stage === "done" && receipt ? (
        <div role="status" data-receipt={receipt.id} data-receipt-version={receipt.version} style={{ fontSize: 13.5 }}>
          <b style={{ color: "var(--green-dark)" }}>{L(`Подадено — версия ${receipt.version}`, `Submitted — version ${receipt.version}`)}</b>
          <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 4 }}>
            {L("Разписка", "Receipt")} № <span style={{ fontFamily: "monospace" }}>{receipt.id}</span> · {when(receipt.submittedAt)} · {receipt.account === "lab" ? L("акаунтът на лабораторията", "the laboratory's account") : L("вашият акаунт", "your account")}{receipt.configVersion ? ` · ${L("конфигурация", "configuration")} v.${receipt.configVersion}` : ""}{receipt.unlocked ? ` · ${L("след срока, отключено от PTS", "after the deadline, unlocked by PTS")}` : ""}
          </div>
          {/* a later version, while the form is open — from here, without a reload (6.4 review) */}
          <button type="button" className="btn btn-sm" style={{ marginTop: 8 }} data-submit-again onClick={() => { setReceipt(null); setError(null); setC((x) => ({ ...x, truthful: false, errorsConfirmed: false })); setStage("idle"); }}>{L("Подай нова версия", "Submit a new version")}</button>
        </div>
      ) : stage === "idle" || stage === "preparing" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-primary btn-sm" data-review onClick={review} disabled={stage === "preparing"}>{stage === "preparing" ? L("Записва се…", "Saving…") : L("Прегледай и подай", "Review and submit")}</button>
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{L("Подаването записва версия с разписка. До срока може да подадете отново — като нова версия; старите се пазят.", "Submitting records a version with a receipt. Until the deadline you may submit again — as a new version; the old ones are kept.")}</span>
        </div>
      ) : (
        <>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{L("Преглед преди подаване", "Review before submitting")}</h2>
          <CheckReport problems={checked} lang={lang} labelOf={labelOf} />
          {blocks.length === 0 && (
            <>
              <div data-submit-summary style={{ fontSize: 13 }}>{summary()}</div>
              <fieldset style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
                <legend style={{ fontWeight: 700, padding: "0 4px" }}>{L("Потвърждения", "Confirmations")}</legend>
                <label style={{ display: "flex", gap: 8 }}><input type="checkbox" checked={c.truthful} onChange={(e) => setC({ ...c, truthful: e.target.checked })} data-confirm="truthful" />{L("Потвърждавам, че резултатите са получени от нашата лаборатория и са въведени, както са получени.", "I confirm the results were obtained by our laboratory and are entered as obtained.")}</label>
                {kind === "C" && <label style={{ display: "flex", gap: 8 }}><input type="checkbox" checked={c.errorsConfirmed} onChange={(e) => setC({ ...c, errorsConfirmed: e.target.checked })} data-confirm="errors" />{L("Потвърждавам изчислените грешки (измерена − референтна стойност) по-горе.", "I confirm the computed errors (measured − reference value) above.")}</label>}
                <label style={{ display: "flex", gap: 8 }}><input type="checkbox" checked={c.subcontracted} onChange={(e) => setC({ ...c, subcontracted: e.target.checked })} data-confirm="subcontracted" />{L("Част от работата е възложена на подизпълнител.", "Part of the work is subcontracted.")}</label>
                {c.subcontracted && <label style={{ display: "grid", gap: 3, fontSize: 12, color: "var(--muted)" }}>{L("Коя част", "Which part")}<input value={c.subcontractedPart} onChange={(e) => setC({ ...c, subcontractedPart: e.target.value })} maxLength={300} data-confirm="part" style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "5px 8px", fontSize: 13 }} /></label>}
              </fieldset>
            </>
          )}
          {error && <p role="alert" data-submit-error style={{ margin: 0, fontSize: 13, color: "#8f2f2f" }}>{error}</p>}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {blocks.length === 0 && <button type="button" className="btn btn-primary btn-sm" data-submit onClick={submit} disabled={stage === "sending"}>{stage === "sending" ? L("Подава се…", "Submitting…") : L("Подай", "Submit")}</button>}
            <button type="button" className="btn btn-sm" onClick={() => { setStage("idle"); setError(null); }} disabled={stage === "sending"}>{L("Назад към формуляра", "Back to the form")}</button>
          </div>
        </>
      )}
    </section>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { lifecycleActAction, stageTickAction } from "@/lib/actions";
import type { ActKey } from "@/lib/lifecycle-model";

// The scheme's 19 stages and its state (part 3.2; Zadanie §3). Each stage says how it
// is done — a dated tick by its role, an act that moves the scheme to its next state,
// or the portal's own record — and, once done, who and when. The acts are the scheme
// manager's; each asks for its note where one is required, and confirms first.

export interface StageRow {
  no: number;
  done: boolean;
  title: string;
  way: "tick" | "act" | "record";
  inPortal: boolean;
  doneDay?: string;
  doneBy?: string;
  note?: string;
  afterResults?: boolean;
  detail?: string;
  current: boolean;
  skipped: boolean;
  who: string;
  mayTick: boolean;
  tickBlocked?: string;
  mayUntick: boolean;
  later?: string;
}

export interface ActButton {
  act: ActKey;
  label: string;
  note: "required" | "optional" | "none";
  blocked?: string;
  /** shown under the acts; the act is still offered (5.2: below the minimum) */
  warn?: string;
  confirm: string;
  danger?: boolean;
}

export default function SchemeLifecycle({
  schemeId, lang, stateLabel, stages, acts, history,
}: {
  schemeId: string;
  lang: "bg" | "en";
  stateLabel: string;
  stages: StageRow[];
  acts: ActButton[];
  history: { label: string; day: string; by: string; note?: string }[];
}) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: true } | { error: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if ("error" in r) setError(r.error);
      else router.refresh();
    });

  const doAct = (a: ActButton) => {
    if (!window.confirm(a.confirm)) return;
    let note = "";
    if (a.note !== "none") {
      const typed = window.prompt(a.note === "required"
        ? L("Основание (задължително):", "The reason (required):")
        : L("Бележка (по желание):", "A note (optional):"), "");
      if (typed === null) return;
      note = typed;
    }
    run(() => lifecycleActAction(schemeId, a.act, note));
  };
  const tick = (row: StageRow, done: boolean) => {
    let note = "";
    if (done) {
      const typed = window.prompt(L(`Етап ${row.no} — бележка (по желание):`, `Stage ${row.no} — a note (optional):`), "");
      if (typed === null) return;
      note = typed;
    } else if (!window.confirm(L(`Да се оттегли ли отметката на етап ${row.no}? Остава в журнала.`, `Withdraw the tick of stage ${row.no}? It stays in the journal.`))) return;
    run(() => stageTickAction(schemeId, row.no, done, note));
  };

  const wayLabel = (r: StageRow) =>
    r.way === "act" ? L("акт", "act") : r.way === "record" ? L("от портала", "from the portal") : L("отметка", "tick");

  return (
    <section id="stages" data-lifecycle className="card" style={{ padding: "16px 18px", margin: "14px 0", background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", justifyContent: "space-between" }}>
        <h2 style={{ fontWeight: 800, fontSize: 17, color: "var(--green-dark)", margin: 0 }}>{L("Етапи", "Stages")}</h2>
        <div style={{ fontSize: 13 }}>
          {L("Състояние: ", "State: ")}<b data-state>{stateLabel}</b>
        </div>
      </div>

      {acts.length > 0 && (
        <div data-acts style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          {acts.map((a) => (
            <button
              key={a.act}
              type="button"
              data-act={a.act}
              className={a.danger ? "btn" : "btn btn-primary"}
              disabled={pending || !!a.blocked}
              title={a.blocked}
              onClick={() => doAct(a)}
              style={{ fontSize: 13, ...(a.danger ? { color: "#8f2f2f", borderColor: "#e3c8c8" } : {}) }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
      {acts.some((a) => a.warn) && (
        <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12, color: "#8a5a00" }}>
          {acts.filter((a) => a.warn).map((a) => <li key={a.act} data-act-warn={a.act}>{a.label}: {a.warn}</li>)}
        </ul>
      )}
      {acts.some((a) => a.blocked) && (
        <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12, color: "var(--muted)" }}>
          {acts.filter((a) => a.blocked).map((a) => <li key={a.act} data-act-blocked={a.act}>{a.label}: {a.blocked}</li>)}
        </ul>
      )}
      {error && (
        <div role="alert" data-lifecycle-error style={{ marginTop: 10, background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}>
          {error}
        </div>
      )}

      <ol style={{ listStyle: "none", padding: 0, margin: "14px 0 0", display: "grid", gap: 4 }}>
        {stages.map((r) => {
          const done = r.done;
          return (
            <li
              key={r.no}
              data-stage={r.no}
              data-done={done ? "1" : "0"}
              data-skipped={r.skipped ? "1" : "0"}
              style={{
                display: "grid", gridTemplateColumns: "28px 1fr auto", gap: 10, alignItems: "start",
                padding: "7px 8px", borderRadius: 8,
                background: r.current ? "var(--green-soft)" : "transparent",
                opacity: r.skipped ? 0.45 : 1,
              }}
            >
              <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, color: done ? "var(--green-dark)" : "var(--muted)" }}>
                {done ? "✓" : r.no}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: r.current ? 700 : 500 }}>
                  {r.no}. {r.title}{" "}
                  <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500 }}>
                    · {wayLabel(r)}{r.way === "tick" ? ` — ${r.who}` : ""}{r.later ? ` · ${L("в портала от част", "in the portal from part")} ${r.later}` : ""}
                  </span>
                </div>
                {(done || r.detail || r.note) && (
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                    {done && r.doneDay && <span data-stage-when>{r.doneDay}</span>}
                    {done && r.doneBy && <span data-stage-who> · {r.doneBy}</span>}
                    {r.detail && <span> {done ? "· " : ""}{r.detail}</span>}
                    {r.note && <span> · „{r.note}“</span>}
                    {r.afterResults && (
                      <span data-after-results style={{ color: "#8f2f2f", fontWeight: 700 }}> · {L("одобрен след първия резултат", "approved after the first result")}</span>
                    )}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {r.way === "tick" && !done && r.mayTick && (
                  <button type="button" className="btn" data-tick={r.no} disabled={pending || !!r.tickBlocked} title={r.tickBlocked}
                    onClick={() => tick(r, true)} style={{ fontSize: 12, height: 28, padding: "0 10px" }}>
                    {L("Отбележи", "Tick")}
                  </button>
                )}
                {r.way === "tick" && done && r.mayUntick && (
                  <button type="button" className="btn" data-untick={r.no} disabled={pending}
                    onClick={() => tick(r, false)} style={{ fontSize: 12, height: 28, padding: "0 10px", color: "var(--muted)" }}>
                    {L("Оттегли", "Withdraw")}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {history.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700 }}>{L("Смени на състоянието", "Changes of state")} ({history.length})</summary>
          <ul data-state-history style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12.5 }}>
            {history.map((h, i) => (
              <li key={i}>{h.day} · {h.label} · {h.by}{h.note ? ` — „${h.note}“` : ""}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

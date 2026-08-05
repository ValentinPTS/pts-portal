"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setChainAction, setChainPaceAction, confirmChainDispatchAction, confirmChainReturnAction } from "@/lib/actions";

// The calibration chain, from the only screen that sees the whole of it.
//
// He sets the order once. After that the app does the boring part — each
// laboratory is shown its next address automatically when the device reaches it,
// because the order was already his decision.
//
// Stops the device has ALREADY reached are frozen: they are the traceability
// record. Everything still to come can be reordered, dropped or added at any
// moment, with the device wherever it is. It happens rarely, so it stays quiet.

export interface ChainRow {
  id: string;
  kind: "lab" | "ref";
  code?: string;
  frozen: boolean;      // the device has been here — history
  holding: boolean;     // it is here right now
  receivedAt?: string;
  sentAt?: string;
}

export default function SchemeChainPanel({
  schemeId, lang, rows, participantCodes, refLabName, daysPerLab, dispatchedAt, returnedAt,
}: {
  schemeId: string;
  lang: "bg" | "en";
  rows: ChainRow[];
  participantCodes: string[];
  refLabName: string;
  daysPerLab?: number;
  dispatchedAt?: string;
  returnedAt?: string;
}) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const [draft, setDraft] = useState<ChainRow[]>(rows);
  const [pace, setPace] = useState(String(daysPerLab ?? ""));
  const seq = useRef(0);

  const pending = draft.filter((r) => !r.frozen);
  const frozen = draft.filter((r) => r.frozen);
  const dirty = JSON.stringify(draft.map((r) => r.id)) !== JSON.stringify(rows.map((r) => r.id))
    || draft.length !== rows.length;

  function run(fn: () => Promise<{ ok?: boolean; error?: string }>, ask?: string) {
    if (ask && !window.confirm(ask)) return;
    setBusy(true);
    startTransition(async () => {
      const r = await fn();
      setBusy(false);
      if (r?.error) { alert(r.error); return; }
      router.refresh();
    });
  }

  const move = (i: number, d: -1 | 1) => {
    const p = [...pending];
    const j = i + d;
    if (j < 0 || j >= p.length) return;
    [p[i], p[j]] = [p[j], p[i]];
    setDraft([...frozen, ...p]);
  };
  const drop = (id: string) => setDraft([...frozen, ...pending.filter((r) => r.id !== id)]);
  // A counter, not a random id: these are throwaway keys for rows that do not
  // exist yet — the server mints the real id when the order is saved.
  const add = (kind: "lab" | "ref", code?: string) => {
    seq.current += 1;
    setDraft([...frozen, ...pending, { id: `new-${seq.current}`, kind, code, frozen: false, holding: false }]);
  };

  const save = () => run(() => setChainAction(schemeId, pending.map((r) => ({
    id: r.id.startsWith("new-") ? undefined : r.id, kind: r.kind, code: r.code,
  }))));

  const used = new Set(draft.filter((r) => r.kind === "lab").map((r) => r.code));
  const free = participantCodes.filter((c) => !used.has(c));
  const fmt = (iso?: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? ""); return m ? `${m[3]}.${m[2]}` : ""; };

  return (
    <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 16px", margin: "10px 0 6px", opacity: busy ? 0.6 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{L("Веригата", "The chain")}</span>
        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
          {L("Всяка лаборатория вижда само следващия адрес, и то щом уредът е при нея.",
             "Each laboratory sees only the next address, and only once the device is with it.")}
        </span>
        <span style={{ flex: 1 }} />
        {dirty && (
          <button className="btn btn-primary btn-sm" style={{ fontSize: 12 }} disabled={busy} onClick={save}>
            {L("Запази реда", "Save the order")}
          </button>
        )}
      </div>

      {draft.length === 0 && (
        <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 8px" }}>
          {L("Още няма верига — добавете спирките в реда, в който уредът ще обиколи.",
             "No chain yet — add the stops in the order the device will travel.")}
        </p>
      )}

      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        {draft.map((r, idx) => {
          const pi = pending.findIndex((x) => x.id === r.id);
          return (
            <li key={r.id} style={{
              display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
              padding: "6px 10px", borderRadius: 8,
              background: r.holding ? "#faf2e0" : r.frozen ? "#f4f7f2" : "var(--surface-2,#f9fbf8)",
              border: `1px solid ${r.holding ? "#ecd9ae" : "var(--line)"}`,
            }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", minWidth: 18, fontVariantNumeric: "tabular-nums" }}>{idx + 1}</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>
                {r.kind === "ref" ? `⌾ ${refLabName || L("Реферативна лаборатория", "Reference laboratory")}` : r.code}
              </span>
              {r.holding && <span className="chip" style={{ background: "#9a6b22" }}>{L("уредът е тук", "device is here")}</span>}
              {r.frozen && !r.holding && (
                <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
                  {fmt(r.receivedAt)}{r.sentAt ? ` → ${fmt(r.sentAt)}` : ""}
                </span>
              )}
              <span style={{ flex: 1 }} />
              {r.frozen ? (
                <span style={{ fontSize: 11, color: "var(--muted)" }}>{L("минала спирка", "past stop")}</span>
              ) : (
                <span style={{ display: "flex", gap: 3 }}>
                  <button className="btn btn-sm" style={miniBtn} disabled={pi <= 0} onClick={() => move(pi, -1)} aria-label="up">↑</button>
                  <button className="btn btn-sm" style={miniBtn} disabled={pi < 0 || pi >= pending.length - 1} onClick={() => move(pi, 1)} aria-label="down">↓</button>
                  <button className="btn btn-sm" style={{ ...miniBtn, color: "var(--red)" }} onClick={() => drop(r.id)} aria-label="remove">✕</button>
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
        {free.length > 0 && (
          <select defaultValue="" disabled={busy} onChange={(e) => { if (e.target.value) { add("lab", e.target.value); e.target.value = ""; } }}
            style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "5px 8px", fontSize: 12.5, background: "#fff", fontFamily: "inherit" }}>
            <option value="">+ {L("добави лаборатория", "add a laboratory")}</option>
            {free.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <button className="btn btn-sm" style={{ fontSize: 12 }} disabled={busy} onClick={() => add("ref")}>
          + {L("реферативна лаборатория", "reference laboratory")}
        </button>
        <span style={{ flex: 1 }} />
        <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
          {L("обичайно дни при лаборатория", "typical days at a laboratory")}
          <input type="number" min={0} max={365} value={pace} disabled={busy}
            onChange={(e) => setPace(e.target.value)}
            onBlur={() => { if (String(daysPerLab ?? "") !== pace) run(() => setChainPaceAction(schemeId, Number(pace || 0))); }}
            style={{ width: 62, border: "1px solid var(--line)", borderRadius: 8, padding: "4px 6px", fontSize: 12.5, fontFamily: "inherit" }} />
        </label>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10, paddingTop: 9, borderTop: "1px solid var(--line)" }}>
        {dispatchedAt ? (
          <span style={{ fontSize: 12, color: "var(--muted)" }}>✓ {L("изпратен на", "dispatched")} {fmt(dispatchedAt)}</span>
        ) : (
          <button className="btn btn-sm" style={{ fontSize: 12 }} disabled={busy || draft.length === 0 || dirty}
            onClick={() => run(() => confirmChainDispatchAction(schemeId), L(
              "Потвърждавате, че сте изпратили уреда на първата спирка. Тя ще получи известие. Да продължа ли?",
              "This confirms you have sent the device to the first stop, and notifies it. Continue?"))}>
            📦 {L("Изпратих уреда на първата спирка", "I have sent it to the first stop")}
          </button>
        )}
        {returnedAt ? (
          <span style={{ fontSize: 12, color: "var(--green-dark,#3d6b47)", fontWeight: 700 }}>✓ {L("върнат на", "returned")} {fmt(returnedAt)}</span>
        ) : (
          <button className="btn btn-sm" style={{ fontSize: 12 }} disabled={busy || !dispatchedAt}
            onClick={() => run(() => confirmChainReturnAction(schemeId), L(
              "Потвърждавате, че уредът се е върнал при вас. Да продължа ли?",
              "This confirms the device is back with you. Continue?"))}>
            {L("Уредът се върна при мен", "The device is back with me")}
          </button>
        )}
      </div>
    </div>
  );
}

const miniBtn: React.CSSProperties = { fontSize: 11, height: 24, minWidth: 24, padding: "0 6px", lineHeight: 1 };

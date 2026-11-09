"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setChainAction, setChainPaceAction, setChainWindowAction, confirmChainDispatchAction, confirmChainReturnAction, stampChainStopAction } from "@/lib/actions";
import { CHAIN_STAMP_SOURCES, fmtStamp, sofiaWallToIso, stampSourceLabel, type StampWhat } from "@/lib/chain";
import type { ChainStampSource } from "@/lib/types";
import { sofiaNowWallShifted } from "@/lib/clock";

// The calibration chain, from the only screen that sees the whole of it.
//
// He sets the order once. After that the app does the boring part — each
// laboratory is shown its next address automatically when the device reaches it,
// because the order was already his decision.
//
// Stops the device has ALREADY reached are frozen: they are the traceability
// record. Everything still to come can be reordered, dropped or added at any
// moment, with the device wherever it is. It happens rarely, so it stays quiet.
//
// PTS can also record any stop's arrival or handover itself (part 0.10): the
// reference laboratory has no account, and a laboratory may phone instead of
// pressing its button. Recording sends nothing — a notice to the next laboratory
// waits in «Известия» like every other.

export interface ChainRow {
  id: string;
  kind: "lab" | "ref";
  code?: string;
  frozen: boolean;      // the device has been here — history
  holding: boolean;     // it is here right now
  receivedAt?: string;
  sentAt?: string;
  received?: StampView; // who recorded the arrival
  sent?: StampView;     // who recorded the handover
  // its window (3.4): to hand on by — from its receipt, in working days, or its extension
  due?: { text: string; orderNo?: string; overdue: boolean; late: boolean };
}

export interface StampView { by: "lab" | "pts"; source?: ChainStampSource; note?: string }

export default function SchemeChainPanel({
  schemeId, lang, rows, participantCodes, refLabName, daysPerLab, dispatchedAt, returnedAt, clockOffsetMs = 0, windowDays, windowEditable = false,
}: {
  windowDays?: number; // working days per laboratory from its receipt (3.4)
  windowEditable?: boolean; // only while the scheme is prepared; then by extension
  schemeId: string;
  lang: "bg" | "en";
  rows: ChainRow[];
  participantCodes: string[];
  refLabName: string;
  daysPerLab?: number;
  dispatchedAt?: string;
  returnedAt?: string;
  clockOffsetMs?: number; // the round's clock, moved in the test environment only (1.3)
}) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const [draft, setDraft] = useState<ChainRow[]>(rows);
  const [pace, setPace] = useState(String(daysPerLab ?? ""));
  const [win, setWin] = useState(String(windowDays ?? 3));
  const seq = useRef(0);
  // the one stop being stamped right now, with its form
  const [stamping, setStamping] = useState<{ id: string; what: StampWhat; at: string; source: ChainStampSource | ""; note: string } | null>(null);
  // a stamp was recorded and the refreshed chain has not arrived yet — until it
  // does, the stale buttons must not be pressable a second time
  const [awaitingRows, setAwaitingRows] = useState(false);
  const working = busy || awaitingRows;

  // Take the server's version whenever the chain actually changes. Saving mints
  // real ids for the stops added here as `new-…`, so without this the draft stays
  // permanently unequal to `rows`: "Запази реда" never clears, and the dispatch
  // button — disabled while dirty — can never be pressed at all. Compared by VALUE,
  // not array identity (which is new on every server render), so a refresh caused by
  // something else on the page cannot throw away an order he is still arranging.
  const rowsKey = JSON.stringify(rows);
  const [syncedKey, setSyncedKey] = useState(rowsKey);
  if (rowsKey !== syncedKey) {
    setSyncedKey(rowsKey);
    setDraft(rows);
    setStamping(null); // the stop it was open on has moved on
    setAwaitingRows(false);
  }

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
      if (r?.error) { alert(stampError(r.error)); return; }
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
  const refCount = draft.filter((r) => r.kind === "ref").length;

  // Where PTS may record a step: the arrival at the next stop due (once the stop
  // before it — or PTS itself, for the first — has sent the device), and the
  // handover at any stop that holds it. The server checks the same (stampProblem).
  const nextIdx = draft.findIndex((r) => !r.frozen);
  const canStamp = !working && !dirty && !returnedAt;
  const canReceive = (idx: number) => canStamp && idx === nextIdx && (idx === 0 ? !!dispatchedAt : !!draft[idx - 1]?.sentAt);
  const canSend = (r: ChainRow) => canStamp && r.holding;
  // the device can come home only once every stop has handed it on (returnProblem)
  const allDone = rows.length > 0 && rows.every((r) => !!r.sentAt);

  // the time is typed and read as BULGARIAN wall-clock time, whatever the browser's zone
  const openStamp = (id: string, what: StampWhat) => setStamping({ id, what, at: sofiaNowWallShifted(clockOffsetMs), source: "", note: "" });
  const stampError = (code: string) => ({
    closed: L("Веригата е затворена — уредът вече е върнат.", "The chain is closed — the device is back."),
    missing: L("Спирката не е намерена. Презаредете страницата.", "That stop was not found. Reload the page."),
    already: L("Това вече е отбелязано.", "That is already recorded."),
    order: L("Уредът минава по реда на веригата. Ако е отишъл другаде, първо пренаредете спирките.",
             "The device travels in the chain's order. If it went elsewhere, reorder the stops first."),
    "not-dispatched": L("Първо потвърдете, че сте изпратили уреда на първата спирка.", "First confirm you sent the device to the first stop."),
    "previous-holding": L("Предишната спирка още не е предала уреда — отбележете първо нейното предаване.",
                          "The stop before has not handed the device on — record its handover first."),
    "not-received": L("Първо отбележете получаването.", "Record the arrival first."),
    time: L("Невалидна дата или час.", "That date or time is not valid."),
    future: L("Датата и часът не може да са в бъдещето.", "The date and time cannot be in the future."),
    "before-receipt": L("Предаването не може да е преди получаването.", "The handover cannot be before the arrival."),
    "before-dispatch": L("Получаването не може да е преди изпращането от PTS.", "The arrival cannot be before PTS sent the device."),
    "before-previous": L("Получаването не може да е преди предаването от предишната спирка.", "The arrival cannot be before the previous stop handed the device on."),
    "after-next-arrival": L("Предаването не може да е след получаването на следващата спирка.", "The handover cannot be after the next stop's arrival."),
    "not-saved": L("Записът НЕ е запазен в базата. Опитайте пак.", "The step was NOT saved to the database. Try again."),
    "not-reached": L("Не стигнах до хранилището на самоличността — нищо не е записано. Опитайте пак.", "Could not reach the identity store — nothing was recorded. Try again."),
    "before-handover": L("Уредът не може да се е върнал преди последното предаване. Ако часовникът на кръга е местен, върнете го напред.", "The device cannot be back before the last handover. If this round's clock was moved, move it forward."),
    "open-stops": L("Има спирки, които още не са предали уреда. Отбележете ги или махнете неизминатите от реда.",
                    "Some stops have not handed the device on. Record them, or drop the ones it will not reach."),
    source: L("Изберете откъде знаете.", "Choose how you know."),
  } as Record<string, string>)[code] ?? code;
  const saveStamp = () => {
    const st = stamping;
    if (!st) return;
    if (!st.source) { alert(stampError("source")); return; }
    const iso = sofiaWallToIso(st.at);
    if (!iso) { alert(stampError("time")); return; }
    // a step cannot be changed once recorded — say exactly what will be kept
    if (!window.confirm(`${st.what === "received" ? L("Получен", "Arrived") : L("Предаден", "Handed on")} ${fmtStamp(iso)} (${L("българско време", "Bulgarian time")}), ${stampSourceLabel(st.source, lang)}.\n${L("Записът не може да се промени после. Да запиша ли?", "It cannot be changed afterwards. Record it?")}`)) return;
    setBusy(true);
    startTransition(async () => {
      const r = await stampChainStopAction(schemeId, {
        stopId: st.id, what: st.what, at: st.at, source: st.source, note: st.note,
      });
      setBusy(false);
      if (r?.error) { alert(stampError(r.error)); return; }
      // the form closes when the refreshed chain arrives (see the sync above)
      setAwaitingRows(true);
      router.refresh();
      setTimeout(() => setAwaitingRows(false), 10_000); // never stuck if it does not
    });
  };
  const by = (v?: StampView) => (v?.by === "pts" ? ` (PTS${v.source ? `, ${stampSourceLabel(v.source, lang)}` : ""})` : "");

  return (
    <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 16px", margin: "10px 0 6px", opacity: working ? 0.6 : 1 }}>
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
          // the reference laboratory measures before the round and after it (Zadanie §8)
          const refWhen = r.kind !== "ref" ? "" : idx === 0 ? L("преди кръга", "before the round")
            : idx === draft.length - 1 ? L("след кръга", "after the round") : "";
          // an order being rearranged must be saved first — the form waits for that
          const form = !dirty && stamping?.id === r.id ? stamping : null;
          const nextRow = draft[idx + 1];
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
              {refWhen && <span style={{ fontSize: 11.5, color: "var(--muted)" }}>· {refWhen}</span>}
              {r.holding && <span className="chip" style={{ background: "#9a6b22" }}>{L("уредът е тук", "device is here")}</span>}
              {r.frozen && (
                <span style={{ fontSize: 11.5, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }} data-chain-times
                  title={[r.received?.note, r.sent?.note].filter(Boolean).join(" · ") || undefined}>
                  {L("получен", "arrived")} {fmtStamp(r.receivedAt)}{by(r.received)}
                  {r.sentAt ? ` → ${L("предаден", "handed on")} ${fmtStamp(r.sentAt)}${by(r.sent)}` : ""}
                </span>
              )}
              {r.due && (
                <span data-chain-due={r.code} data-overdue={r.due.overdue ? "1" : "0"} style={{ fontSize: 11.5, color: r.due.overdue ? "#8f2f2f" : "var(--muted)", fontWeight: r.due.overdue ? 700 : 400 }}>
                  · {L("до", "by")} {r.due.text}{r.due.orderNo ? ` (${L("удължен, Заповед №", "extended, Order No.")} ${r.due.orderNo})` : ""}
                  {r.due.overdue ? ` — ${L("просрочен", "overdue")}` : r.due.late ? ` — ${L("предаден след срока", "handed on late")}` : ""}
                </span>
              )}
              <span style={{ flex: 1 }} />
              {!form && canReceive(idx) && (
                <button className="btn btn-sm" style={{ fontSize: 11.5 }} onClick={() => openStamp(r.id, "received")}>
                  {L("Отбележи получаване", "Record arrival")}
                </button>
              )}
              {!form && canSend(r) && (
                <button className="btn btn-sm" style={{ fontSize: 11.5 }} onClick={() => openStamp(r.id, "sent")}>
                  {L("Отбележи предаване", "Record handover")}
                </button>
              )}
              {r.frozen ? (
                <span style={{ fontSize: 11, color: "var(--muted)" }}>{L("минала спирка", "past stop")}</span>
              ) : (
                <span style={{ display: "flex", gap: 3 }}>
                  <button className="btn btn-sm" style={miniBtn} disabled={pi <= 0} onClick={() => move(pi, -1)} aria-label="up">↑</button>
                  <button className="btn btn-sm" style={miniBtn} disabled={pi < 0 || pi >= pending.length - 1} onClick={() => move(pi, 1)} aria-label="down">↓</button>
                  <button className="btn btn-sm" style={{ ...miniBtn, color: "var(--red)" }} onClick={() => drop(r.id)} aria-label="remove">✕</button>
                </span>
              )}
              {form && (
                <div data-chain-stamp style={{ flexBasis: "100%", display: "flex", flexDirection: "column", gap: 6, marginTop: 6, paddingTop: 8, borderTop: "1px dashed var(--line)" }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>
                    {form.what === "received"
                      ? L("PTS отбелязва, че уредът е пристигнал тук", "PTS records that the device arrived here")
                      : L("PTS отбелязва, че уредът е предаден нататък", "PTS records that the device was handed on")}
                  </span>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <label style={stampLabel}>
                      {L("Кога (българско време)", "When (Bulgarian time)")}
                      <input type="datetime-local" name="at" value={form.at} max={sofiaNowWallShifted(clockOffsetMs)} disabled={working}
                        onChange={(e) => setStamping({ ...form, at: e.target.value })} style={stampInput} />
                    </label>
                    <label style={stampLabel}>
                      {L("Откъде знаете", "How you know")}
                      <select name="source" value={form.source} disabled={working}
                        onChange={(e) => setStamping({ ...form, source: e.target.value as ChainStampSource | "" })} style={stampInput}>
                        <option value="">—</option>
                        {CHAIN_STAMP_SOURCES.map((src) => <option key={src} value={src}>{stampSourceLabel(src, lang)}</option>)}
                      </select>
                    </label>
                    <label style={{ ...stampLabel, flex: 1, minWidth: 180 }}>
                      {L("Бележка (по избор)", "Note (optional)")}
                      <input name="note" value={form.note} maxLength={300} disabled={working}
                        onChange={(e) => setStamping({ ...form, note: e.target.value })} style={{ ...stampInput, width: "100%" }} />
                    </label>
                  </div>
                  <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
                    {form.what === "sent" && nextRow?.kind === "lab"
                      ? L("Нищо не се изпраща само: известието „уредът пътува“ към следващата лаборатория чака във «Известия», докато го пуснете.",
                          "Nothing is sent by itself: the “device on its way” notice to the next laboratory waits in «Notices» until you release it.")
                      : L("Нищо не се изпраща.", "Nothing is sent.")}
                    {" "}{L("Записът остава в историята на веригата.", "The record stays in the chain's history.")}
                  </span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-primary btn-sm" style={{ fontSize: 12 }} disabled={working} onClick={saveStamp}>{L("Запиши", "Record")}</button>
                    <button className="btn btn-sm" style={{ fontSize: 12 }} disabled={working} onClick={() => setStamping(null)}>{L("Откажи", "Cancel")}</button>
                  </div>
                </div>
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
        {refCount < 2 && (
          <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
            {L("Реферативната лаборатория мери преди и след кръга — сложете я в началото и в края.",
               "The reference laboratory measures before and after the round — put it first and last.")}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <label data-chain-window-days style={{ fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}
          title={windowEditable ? undefined : L("След отварянето прозорецът се мести само с индивидуално удължаване със заповед.", "Once open, a window moves only by an individual extension with its order.")}>
          {L("работни дни при лаборатория (срок)", "working days at a laboratory (deadline)")}
          <input type="number" min={1} max={60} value={win} disabled={busy || !windowEditable}
            onChange={(e) => setWin(e.target.value)}
            onBlur={() => { if (String(windowDays ?? 3) !== win) run(() => setChainWindowAction(schemeId, Number(win || 0))); }}
            style={{ width: 56, border: "1px solid var(--line)", borderRadius: 8, padding: "4px 6px", fontSize: 12.5, fontFamily: "inherit" }} />
        </label>
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
          <span style={{ fontSize: 12, color: "var(--muted)" }}>✓ {L("изпратен на", "dispatched")} {fmtStamp(dispatchedAt)}</span>
        ) : (
          <button className="btn btn-sm" style={{ fontSize: 12 }} disabled={busy || draft.length === 0 || dirty}
            onClick={() => run(() => confirmChainDispatchAction(schemeId), draft[0]?.kind === "lab" ? L(
              "Потвърждавате, че сте изпратили уреда на първата спирка. Известието към нея чака във «Известия», докато го пуснете. Да продължа ли?",
              "This confirms you have sent the device to the first stop. The notice to it waits in «Notices» until you release it. Continue?") : L(
              "Потвърждавате, че сте изпратили уреда на реферативната лаборатория. Да продължа ли?",
              "This confirms you have sent the device to the reference laboratory. Continue?"))}>
            📦 {L("Изпратих уреда на първата спирка", "I have sent it to the first stop")}
          </button>
        )}
        {returnedAt ? (
          <span style={{ fontSize: 12, color: "var(--green-dark,#3d6b47)", fontWeight: 700 }}>✓ {L("върнат на", "returned")} {fmtStamp(returnedAt)}</span>
        ) : (
          <>
            <button className="btn btn-sm" style={{ fontSize: 12 }} disabled={working || !dispatchedAt || !allDone || dirty}
              onClick={() => run(() => confirmChainReturnAction(schemeId), L(
                "Потвърждавате, че уредът се е върнал при вас. Веригата се затваря. Да продължа ли?",
                "This confirms the device is back with you, and closes the chain. Continue?"))}>
              {L("Уредът се върна при мен", "The device is back with me")}
            </button>
            {dispatchedAt && !allDone && (
              <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
                {L("— след като всяка спирка е предала уреда.", "— once every stop has handed the device on.")}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const miniBtn: React.CSSProperties = { fontSize: 11, height: 24, minWidth: 24, padding: "0 6px", lineHeight: 1 };
const stampLabel: React.CSSProperties = { fontSize: 11.5, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 3 };
const stampInput: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 8, padding: "4px 6px", fontSize: 12.5, background: "#fff", fontFamily: "inherit" };

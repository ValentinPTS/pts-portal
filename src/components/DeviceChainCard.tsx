"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { labConfirmDeviceReceiptAction, labHandOverDeviceAction } from "@/lib/actions";
import { ordinalSuffixBg } from "@/lib/chain";

// What ONE laboratory sees of the calibration chain. Three states and nothing else.
//
// The props already carry only what this laboratory is entitled to — the server
// resolved a single next address, and only while the device is in its hands. This
// component must never be given the stop list; if it had one it could show it.

export interface ChainNext {
  kind: "lab" | "ref" | "pts";
  name?: string;
  address?: string;
  contact?: string;
  phone?: string;
}

export default function DeviceChainCard({
  schemeId, lang, state, position, wait, started, closed, incoming, next, handOnBy,
}: {
  /** its own window while it holds the instrument (3.4): the day it ends, in working
   *  days from its receipt — or its extension; overdue said, never a block */
  handOnBy?: { dueText: string; days: number; orderNo?: string; overdue: boolean };
  schemeId: string;
  lang: "bg" | "en";
  state: "waiting" | "holding" | "done";
  position?: number;
  wait?: string;
  started: boolean;
  /** PTS has closed the chain — the device is back; nothing more is recorded. */
  closed?: boolean;
  /** Nobody is holding it and this is the next stop due — it is travelling HERE. */
  incoming?: boolean;
  next: ChainNext | null;
}) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok?: boolean; error?: string }>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    startTransition(async () => {
      const r = await fn();
      setBusy(false);
      if (r?.error) { alert(problem(r.error)); return; }
      router.refresh();
    });
  }

  // what the server's refusal means for this laboratory (lib/chain.ts stampProblem)
  const problem = (code: string) => ({
    "no-stop": L("Нямате спирка, която чака уреда.", "You have no stop waiting for the device."),
    "not-dispatched": L("Уредът още не е тръгнал от PTS.", "The device has not left PTS yet."),
    order: L("Уредът още не е отбелязан при спирките преди вас. Ако вече е при вас, обадете се на PTS — те ще го отбележат.",
             "The device has not yet been recorded at the stops before you. If it is already with you, call PTS and they will record it."),
    closed: L("Веригата е приключена.", "The chain is finished."),
    "not-received": L("Първо потвърдете, че уредът е пристигнал.", "First confirm the device has arrived."),
  } as Record<string, string>)[code] ?? L("Не успяхме да го запишем. Опитайте пак или се обадете на PTS.", "That could not be recorded. Try again, or call PTS.");

  const shell: React.CSSProperties = {
    borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6,
    opacity: busy ? 0.6 : 1,
  };
  const label = <span className="field-label" style={{ marginBottom: 0 }}>{L("Уредът", "The device")}</span>;

  // ── it is here, and it is this laboratory's turn ───────────────────────────
  if (state === "holding") {
    const heading = next?.kind === "pts"
      ? L("Вие сте последната спирка — върнете уреда на ПТС.", "You are the last stop — send the device back to PTS.")
      : L("Уредът е при вас. След вас го изпратете на:", "The device is with you. Send it on to:");
    return (
      <div style={{ ...shell, background: "#faf2e0", border: "1px solid #ecd9ae" }}>
        {label}
        <span style={{ fontSize: 13.5, fontWeight: 700, color: "#7a5416" }}>{heading}</span>
        {next && next.kind !== "pts" && (
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>
            <div style={{ fontWeight: 700 }}>{next.name || "—"}</div>
            {next.address && <div>{next.address}</div>}
            {(next.contact || next.phone) && (
              <div style={{ color: "var(--muted)" }}>{[next.contact, next.phone].filter(Boolean).join(" · ")}</div>
            )}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
          <button className="btn btn-primary btn-sm" style={{ fontSize: 12 }} disabled={busy || closed}
            onClick={() => run(() => labHandOverDeviceAction(schemeId), L(
              "Потвърждавате, че сте изпратили уреда нататък. Да продължа ли?",
              "This confirms you have sent the device on. Continue?"))}>
            ✓ {L("Предадох уреда", "I have sent it on")}
          </button>
        </div>
        {handOnBy ? (
          <span data-chain-window style={{ fontSize: 12, color: handOnBy.overdue ? "#8f2f2f" : "var(--muted)", fontWeight: handOnBy.overdue ? 700 : 400 }}>
            {handOnBy.orderNo
              ? L(`Срок за предаване: ${handOnBy.dueText} — удължен по Заповед № ${handOnBy.orderNo}.`, `To hand on by: ${handOnBy.dueText} — extended by Order No. ${handOnBy.orderNo}.`)
              : L(`Срок за предаване: ${handOnBy.dueText} (${handOnBy.days} работни дни от получаването).`, `To hand on by: ${handOnBy.dueText} (${handOnBy.days} working days from the receipt).`)}
            {handOnBy.overdue && L(" Срокът е изтекъл — свържете се с PTS. Порталът не блокира нищо.", " The deadline has passed — contact PTS. The portal blocks nothing.")}
          </span>
        ) : (
          <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{L("Порталът не блокира нищо.", "The portal blocks nothing.")}</span>
        )}
      </div>
    );
  }

  // ── it is on its way, or the round has not started ─────────────────────────
  if (state === "waiting") {
    return (
      <div style={{ ...shell, background: "#f7faf8" }}>
        {label}
        <span style={{ fontSize: 13 }}>
          {position
            ? L(`Вие сте ${position}-${ordinalSuffixBg(position)} в реда.`, `You are number ${position} in the queue.`)
            : L("Вие сте във веригата.", "You are in the chain.")}
        </span>
        <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
          {/* Once nobody is ahead, the device is in transit to THIS laboratory — saying
              "it is with another participant" then contradicts the notice it was just
              sent ("изпратен към вас") and hides the one thing it has to do next. */}
          {!started
            ? L("Уредът още не е тръгнал.", "The device has not set off yet.")
            : incoming
              ? L("Уредът пътува към вас. Потвърдете получаването, когато пристигне.",
                  "The device is on its way to you. Confirm receipt when it arrives.")
              : wait
                ? L(`Уредът е при друг участник — ${wait} до вас.`, `The device is with another participant — ${wait} until it reaches you.`)
                : L("Уредът е при друг участник.", "The device is with another participant.")}
        </span>
        {/* only once the device has left PTS, and while the chain is open — a press
            before that would record an arrival that cannot have happened */}
        {started && !closed && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
            <button className="btn btn-sm" style={{ fontSize: 12 }} disabled={busy}
              onClick={() => run(() => labConfirmDeviceReceiptAction(schemeId))}>
              {L("Уредът пристигна при мен", "The device has arrived")}
            </button>
          </div>
        )}
        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
          {L("Приблизително — не е срок и нищо не зависи от него.",
             "An estimate — not a deadline, and nothing depends on it.")}
        </span>
      </div>
    );
  }

  // ── its part is over ───────────────────────────────────────────────────────
  return (
    <div style={{ ...shell, background: "#f7faf8" }}>
      {label}
      <span style={{ fontSize: 13, color: "var(--muted)" }}>
        {L("Вашата част от веригата е приключена.", "Your part of the chain is finished.")}
      </span>
    </div>
  );
}

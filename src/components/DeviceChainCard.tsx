"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { labConfirmDeviceReceiptAction, labHandOverDeviceAction } from "@/lib/actions";

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
  schemeId, lang, state, position, total, wait, started, next,
}: {
  schemeId: string;
  lang: "bg" | "en";
  state: "waiting" | "holding" | "done";
  position?: number;
  total?: number;
  wait?: string;
  started: boolean;
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
      if (r?.error) { alert(r.error); return; }
      router.refresh();
    });
  }

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
          <button className="btn btn-primary btn-sm" style={{ fontSize: 12 }} disabled={busy}
            onClick={() => run(() => labHandOverDeviceAction(schemeId), L(
              "Потвърждавате, че сте изпратили уреда нататък. Да продължа ли?",
              "This confirms you have sent the device on. Continue?"))}>
            ✓ {L("Предадох уреда", "I have sent it on")}
          </button>
        </div>
        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
          {L("Няма срок — задръжте уреда толкова, колкото ви е нужно.",
             "There is no deadline — keep the device as long as you need.")}
        </span>
      </div>
    );
  }

  // ── it is on its way, or the round has not started ─────────────────────────
  if (state === "waiting") {
    return (
      <div style={{ ...shell, background: "#f7faf8" }}>
        {label}
        <span style={{ fontSize: 13 }}>
          {position && total
            ? L(`Вие сте ${position}-и от ${total} в реда.`, `You are ${position} of ${total} in the queue.`)
            : L("Вие сте във веригата.", "You are in the chain.")}
        </span>
        <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
          {!started
            ? L("Уредът още не е тръгнал.", "The device has not set off yet.")
            : wait
              ? L(`Уредът е при друг участник — ${wait} до вас.`, `The device is with another participant — ${wait} until it reaches you.`)
              : L("Уредът е при друг участник.", "The device is with another participant.")}
        </span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
          <button className="btn btn-sm" style={{ fontSize: 12 }} disabled={busy}
            onClick={() => run(() => labConfirmDeviceReceiptAction(schemeId))}>
            {L("Уредът пристигна при мен", "The device has arrived")}
          </button>
        </div>
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

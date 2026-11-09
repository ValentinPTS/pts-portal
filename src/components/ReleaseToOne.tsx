"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { releaseDocToAction, releaseUsersAction, withdrawReleaseAction } from "@/lib/actions";

// A document to ONE participation or ONE user (plan part 5.4; Zadanie «Три нива на
// пускане на документ»): as an edition, the same rules as «Изпрати» — from edition 2
// on, the person says what changed and why. A participation is told by its code; one
// user, by PTS directly. Confirmed first; kept on record, withdrawn by a date.

export interface TargetOption { value: string; label: string }

export default function ReleaseToOne({ lang, schemeId, docKey, participations, usersAllowed }: {
  lang: "bg" | "en";
  schemeId: string;
  docKey: string;
  /** the participations in the round, by code — no names */
  participations: TargetOption[];
  /** may this person send to one user by name (names.view)? The users are opened only when chosen. */
  usersAllowed: boolean;
}) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const router = useRouter();
  const [busy, start] = useTransition();
  const [level, setLevel] = useState<"participation" | "user">("participation");
  const [target, setTarget] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [users, setUsers] = useState<TargetOption[] | null>(null);
  const options = level === "participation" ? participations : users ?? [];
  const chooseLevel = (v: "participation" | "user") => {
    setLevel(v); setTarget("");
    // the users' names are opened only now, on record (§4.2)
    if (v === "user" && users === null) start(async () => { setUsers(await releaseUsersAction(schemeId).catch(() => [])); });
  };

  const send = () => {
    if (!target) return;
    const label = options.find((o) => o.value === target)?.label ?? "";
    if (!window.confirm(L(`Документът отива като редакция само до ${level === "participation" ? `участие ${label}` : `потребител ${label}`}. Продължаваме?`, `The document goes as an edition only to ${level === "participation" ? `participation ${label}` : `user ${label}`}. Go ahead?`))) return;
    start(async () => {
      setMsg(null);
      const t = level === "participation" ? { level, participantId: target } : { level, userId: target };
      let r = await releaseDocToAction(schemeId, docKey, t).catch(() => ({ error: L("Не стана — опитайте отново.", "It did not go through — try again.") }));
      if ("needsNote" in r && r.needsNote) {
        const reason = window.prompt(L(`Редакция № ${r.needsNote.no}: какво и защо е променено (задължително)`, `Edition No. ${r.needsNote.no}: what changed and why (required)`), "");
        if (!reason?.trim()) { setMsg(L("Не е изпратено — нужна е бележка какво и защо е променено.", "Not sent — a note of what changed and why is needed.")); return; }
        const scope = window.prompt(L("Обхват (по желание)", "Scope (optional)"), "") ?? "";
        r = await releaseDocToAction(schemeId, docKey, t, { reason, scope }).catch(() => ({ error: L("Не стана — опитайте отново.", "It did not go through — try again.") }));
      }
      if ("error" in r && r.error) { setMsg(r.error); return; }
      if ("needsNote" in r && r.needsNote) { setMsg(L("Не е изпратено — нужна е бележка какво и защо е променено.", "Not sent — a note of what changed and why is needed.")); return; }
      const withheld = "namesWithheld" in r && (r.namesWithheld || r.scoresWithheld) ? L(" Таблица с имена или оценки на портала в документа не се показват на лабораторията.", " A names table or portal scores in the document are not shown to the laboratory.") : "";
      setMsg((level === "participation" ? L("Изпратено — участието е уведомено.", "Sent — the participation is told.") : L("Изпратено — съобщете на потребителя.", "Sent — tell the user.")) + withheld);
      setTarget("");
      router.refresh();
    });
  };

  return (
    <div data-release-to-one={docKey} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8, fontSize: 13 }}>
      <span style={{ color: "var(--muted)" }}>{L("Изпрати само до:", "Send only to:")}</span>
      <select value={level} onChange={(e) => chooseLevel(e.target.value as "participation" | "user")} data-release-level style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "4px 6px" }}>
        <option value="participation">{L("едно участие", "one participation")}</option>
        {usersAllowed && <option value="user">{L("един потребител", "one user")}</option>}
      </select>
      <select value={target} onChange={(e) => setTarget(e.target.value)} data-release-target style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "4px 6px", minWidth: 160 }}>
        <option value="">—</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <button type="button" className="btn btn-sm" data-release-send disabled={busy || !target} onClick={send}>{L("Изпрати", "Send")}</button>
      {msg && <span role="status" data-release-msg style={{ color: "var(--muted)" }}>{msg}</span>}
    </div>
  );
}

/** Withdraw a release to one participation or one user — it stays on record, with the date. */
export function WithdrawRelease({ lang, schemeId, releaseId }: { lang: "bg" | "en"; schemeId: string; releaseId: string }) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <button type="button" className="btn btn-sm" data-release-withdraw={releaseId} disabled={busy} style={{ fontSize: 11, padding: "1px 8px" }}
      onClick={() => {
        if (!window.confirm(L("Да се оттегли ли? Остава записано кога е било изпратено и кога оттеглено.", "Withdraw it? When it was sent and when withdrawn stay on record."))) return;
        start(async () => { const r = await withdrawReleaseAction(schemeId, releaseId).catch(() => null); if (r && "error" in r) window.alert(r.error); router.refresh(); });
      }}>
      {L("Оттегли", "Withdraw")}
    </button>
  );
}

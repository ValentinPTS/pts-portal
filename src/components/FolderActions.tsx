"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { renameSchemeAction, deleteSchemeAction } from "@/lib/actions";
import { useLang } from "@/components/LangProvider";

// Rename / delete a scheme folder, from the scheme page header. Rename edits the
// friendly name inline; Delete confirms first (it removes the scheme + its
// documents, applications and participants) and the action redirects to the year
// folder. Owner-gated server-side (requireOwner inside the actions).
export default function FolderActions({ schemeId, name }: { schemeId: string; name: string }) {
  const { t } = useLang();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(name);
  const [pending, start] = useTransition();

  function saveName() {
    const clean = val.trim();
    setEditing(false);
    if (!clean || clean === name) { setVal(name); return; }
    start(async () => { await renameSchemeAction(schemeId, clean); router.refresh(); });
  }
  function del() {
    if (!window.confirm(t("folder.deleteConfirm"))) return;
    start(async () => { await deleteSchemeAction(schemeId); });
  }

  if (editing) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <input
          autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") { setEditing(false); setVal(name); } }}
          placeholder={t("folder.newName")}
          style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "6px 9px", fontSize: 13, minWidth: 200 }}
        />
        <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={saveName} disabled={pending}>{t("common.save")}</button>
        <button className="btn" style={{ fontSize: 13 }} onClick={() => { setEditing(false); setVal(name); }}>{t("common.cancel")}</button>
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button className="btn" style={{ fontSize: 13 }} onClick={() => { setVal(name); setEditing(true); }} disabled={pending}>✎ {t("folder.rename")}</button>
      <button
        className="btn"
        style={{ fontSize: 13, borderColor: "var(--red)", color: "var(--red)" }}
        onClick={del}
        disabled={pending}
      >
        {t("folder.deleteFolder")}
      </button>
    </span>
  );
}

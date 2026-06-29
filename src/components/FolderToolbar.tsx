"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { renameFolderAction, deleteFolderAction } from "@/lib/actions";
import { useLang } from "@/components/LangProvider";

// Rename / delete a real folder, from the folder page header. Rename edits the
// name inline; Delete confirms first and only succeeds when the folder is empty
// (the action enforces it) — then navigates to the parent. Writer-gated server-side.
export default function FolderToolbar({ folderId, name, parentHref }: { folderId: string; name: string; parentHref: string }) {
  const { t } = useLang();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(name);
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");

  function save() {
    const clean = val.trim();
    setEditing(false);
    if (!clean || clean === name) { setVal(name); return; }
    setErr("");
    start(async () => {
      const r = await renameFolderAction(folderId, clean);
      if (r?.error) { setErr(r.error); setVal(name); } else router.refresh();
    });
  }
  function del() {
    if (!window.confirm(t("folder.fDeleteConfirm"))) return;
    setErr("");
    start(async () => {
      const r = await deleteFolderAction(folderId);
      if (r?.error) { setErr(r.error); return; }
      router.push(parentHref);
    });
  }

  if (editing) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <input
          autoFocus value={val} onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setEditing(false); setVal(name); } }}
          placeholder={t("folder.newName")}
          style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "6px 9px", fontSize: 13, minWidth: 180 }}
        />
        <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={save} disabled={pending}>{t("common.save")}</button>
        <button className="btn" style={{ fontSize: 13 }} onClick={() => { setEditing(false); setVal(name); }}>{t("common.cancel")}</button>
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <button className="btn" style={{ fontSize: 13 }} onClick={() => { setVal(name); setEditing(true); }} disabled={pending}>✎ {t("folder.rename")}</button>
      <button className="btn" style={{ fontSize: 13, borderColor: "var(--red)", color: "var(--red)" }} onClick={del} disabled={pending}>{t("folder.deleteFolder")}</button>
      {err && <span style={{ color: "var(--red)", fontSize: 12 }}>{err}</span>}
    </span>
  );
}

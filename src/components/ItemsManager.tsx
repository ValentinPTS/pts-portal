"use client";

import { useMemo, useState } from "react";
import type { LibraryItem } from "@/lib/library-store";
import { addLibraryItemAction, updateLibraryItemAction, deleteLibraryItemAction, translateAction } from "@/lib/actions";
import { useLang } from "@/components/LangProvider";

type Editing = { id: string | "new"; name: string; category: string; bg: string; en: string } | null;

const inputStyle: React.CSSProperties = { width: "100%", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontSize: 14, background: "#fff" };
const stripTags = (s: string) => s.replace(/<[^>]+>/g, "").trim();

// "My items" management — list the owner's reusable snippets grouped by category,
// with add / edit / delete and BG⇄EN auto-translate. The editor's inline quick-add
// writes to the same library, so anything created there appears here too.
export default function ItemsManager({ initial }: { initial: LibraryItem[] }) {
  const { t } = useLang();
  const [items, setItems] = useState<LibraryItem[]>(initial);
  const [edit, setEdit] = useState<Editing>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const categories = useMemo(() => [...new Set(items.map((i) => i.category || "My items"))], [items]);
  const groups = useMemo(() => {
    const m = new Map<string, LibraryItem[]>();
    for (const it of items) {
      const c = it.category || "My items";
      if (!m.has(c)) m.set(c, []);
      m.get(c)!.push(it);
    }
    return [...m.entries()];
  }, [items]);

  function openNew() { setErr(""); setEdit({ id: "new", name: "", category: "My items", bg: "", en: "" }); }
  function openEdit(it: LibraryItem) { setErr(""); setEdit({ id: it.id, name: it.name, category: it.category || "My items", bg: it.bg, en: it.en }); }

  async function translate() {
    if (!edit?.bg.trim()) return;
    setBusy("tr");
    const r = await translateAction(edit.bg.trim(), "bg", "en");
    setBusy("");
    if (r.error) return setErr(r.error);
    setEdit((e) => (e ? { ...e, en: r.text ?? "" } : e));
  }
  async function save() {
    if (!edit) return;
    setBusy("save"); setErr("");
    if (edit.id === "new") {
      const r = await addLibraryItemAction(edit.name, edit.bg, edit.en, edit.category);
      setBusy("");
      if (r.error) return setErr(r.error);
      if (r.item) setItems((x) => [...x, r.item!]);
    } else {
      const r = await updateLibraryItemAction(edit.id, edit.name, edit.bg, edit.en, edit.category);
      setBusy("");
      if (r.error) return setErr(r.error);
      if (r.item) setItems((x) => x.map((i) => (i.id === r.item!.id ? r.item! : i)));
    }
    setEdit(null);
  }
  async function del(it: LibraryItem) {
    if (!window.confirm(t("items.deleteConfirm"))) return;
    setItems((x) => x.filter((i) => i.id !== it.id));
    await deleteLibraryItemAction(it.id);
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <button className="btn btn-primary" onClick={openNew}>＋ {t("items.new")}</button>
      </div>

      {edit && (
        <div className="card p-4 mb-5" style={{ borderColor: "var(--green-line)" }}>
          <div className="font-bold mb-3" style={{ color: "var(--green-dark)" }}>{edit.id === "new" ? t("items.newTitle") : t("items.editTitle")}</div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "2fr 1fr" }}>
            <label className="block"><span className="block text-xs mb-1" style={{ color: "var(--muted)" }}>{t("items.name")}</span>
              <input style={inputStyle} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus /></label>
            <label className="block"><span className="block text-xs mb-1" style={{ color: "var(--muted)" }}>{t("items.category")}</span>
              <input style={inputStyle} list="item-cats" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} />
              <datalist id="item-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist></label>
          </div>
          <label className="block mt-3"><span className="block text-xs mb-1" style={{ color: "var(--muted)" }}>{t("items.bg")}</span>
            <textarea style={{ ...inputStyle, resize: "vertical" }} rows={3} value={edit.bg} onChange={(e) => setEdit({ ...edit, bg: e.target.value })} /></label>
          <button className="btn mt-2" style={{ fontSize: 12, padding: "5px 12px" }} onClick={translate} disabled={busy === "tr"}>{busy === "tr" ? "…" : "⇄ БГ → EN"}</button>
          <label className="block mt-3"><span className="block text-xs mb-1" style={{ color: "var(--muted)" }}>{t("items.en")}</span>
            <textarea style={{ ...inputStyle, resize: "vertical" }} rows={3} value={edit.en} onChange={(e) => setEdit({ ...edit, en: e.target.value })} /></label>
          {err && <p className="text-sm mt-2" style={{ color: "var(--red)" }}>{err}</p>}
          <div className="flex gap-2 mt-3">
            <button className="btn btn-primary" onClick={save} disabled={busy === "save"}>{busy === "save" ? "…" : t("common.save")}</button>
            <button className="btn" onClick={() => setEdit(null)}>{t("common.cancel")}</button>
          </div>
        </div>
      )}

      {items.length === 0 && !edit && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>{t("items.empty")}</p>
      )}

      {groups.map(([cat, list]) => (
        <div key={cat} className="mb-5">
          <div className="text-xs font-bold mb-2" style={{ letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)" }}>{cat}</div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))" }}>
            {list.map((it) => (
              <div key={it.id} className="card p-3" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div className="font-bold" style={{ fontSize: 14 }}>{it.name}</div>
                <div style={{ fontSize: 12.5, color: "var(--ink)", lineHeight: 1.5 }}>{stripTags(it.bg).slice(0, 120) || "—"}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>{stripTags(it.en).slice(0, 120)}</div>
                <div className="flex gap-2 mt-1">
                  <button className="btn" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => openEdit(it)}>✎ {t("common.edit")}</button>
                  <button className="btn" style={{ fontSize: 12, padding: "4px 10px", borderColor: "var(--red)", color: "var(--red)" }} onClick={() => del(it)}>{t("common.delete")}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import type { LibraryItem } from "@/lib/library-store";
import { addLibraryItemAction, updateLibraryItemAction, deleteLibraryItemAction, translateAction } from "@/lib/actions";
import { useLang } from "@/components/LangProvider";
import { esc } from "@/lib/doc-css";
import { sanitizeDocHtml } from "@/lib/sanitize-html";

type Editing = { id: string | "new"; name: string; category: string; bg: string; en: string } | null;
type Builtin = { id: string; name: string; category: string; bg: string; en: string };

const DEFAULT_CAT = "My items";
const inputStyle: React.CSSProperties = { width: "100%", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontSize: 14, background: "#fff" };

// "My items" management — the owner's reusable snippets (the MY ITEMS group in the
// document editor). Category filter chips (add via the item form, remove reassigns to
// the default bucket), a live RENDERED preview of each element, and add / edit / delete
// with BG⇄EN auto-translate. The editor's inline quick-add writes to the same library.
export default function ItemsManager({ initial, builtins = [] }: { initial: LibraryItem[]; builtins?: Builtin[] }) {
  const { lang, t } = useLang();
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const [items, setItems] = useState<LibraryItem[]>(initial);
  const [edit, setEdit] = useState<Editing>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState<string>(""); // "" = show all categories

  // Tidy ordering: "My items" (the catch-all) first, then categories A→Z; items A→Z
  // within each category.
  const cmpCat = (a: string, b: string) => (a === b ? 0 : a === DEFAULT_CAT ? -1 : b === DEFAULT_CAT ? 1 : a.localeCompare(b));
  const categories = useMemo(() => [...new Set(items.map((i) => i.category || DEFAULT_CAT))].sort(cmpCat), [items]);
  // Built-in starter elements the owner hasn't customized yet (matched by name — once
  // a built-in is added it becomes an editable item and drops out of this list). Ordered
  // by category then name so related clauses sit together.
  const customNames = useMemo(() => new Set(items.map((i) => i.name.trim().toLowerCase())), [items]);
  const availableBuiltins = useMemo(
    () => builtins.filter((b) => !customNames.has(b.name.trim().toLowerCase())).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)),
    [builtins, customNames],
  );
  const countIn = (cat: string) => items.filter((i) => (i.category || DEFAULT_CAT) === cat).length;
  const shown = useMemo(() => items.filter((i) => !filter || (i.category || DEFAULT_CAT) === filter), [items, filter]);
  const groups = useMemo(() => {
    const m = new Map<string, LibraryItem[]>();
    for (const it of shown) {
      const c = it.category || DEFAULT_CAT;
      if (!m.has(c)) m.set(c, []);
      m.get(c)!.push(it);
    }
    const entries = [...m.entries()].sort((a, b) => cmpCat(a[0], b[0]));
    for (const [, list] of entries) list.sort((x, y) => x.name.localeCompare(y.name));
    return entries;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  // A faithful preview of what gets inserted into a document: the snippet text wrapped
  // as a paragraph (exactly as the editor inserts it), escaped + sanitized.
  const previewHtml = (it: LibraryItem) =>
    sanitizeDocHtml(`<p>${esc((lang === "bg" ? it.bg : it.en || it.bg) || "")}</p>`);

  function openNew() { setErr(""); setEdit({ id: "new", name: "", category: filter || DEFAULT_CAT, bg: "", en: "" }); }
  function openEdit(it: LibraryItem) { setErr(""); setEdit({ id: it.id, name: it.name, category: it.category || DEFAULT_CAT, bg: it.bg, en: it.en }); }

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
    const cat = edit.category.trim() || DEFAULT_CAT;
    if (edit.id === "new") {
      const r = await addLibraryItemAction(edit.name, edit.bg, edit.en, cat);
      setBusy("");
      if (r.error) return setErr(r.error);
      if (r.item) setItems((x) => [...x, r.item!]);
    } else {
      const r = await updateLibraryItemAction(edit.id, edit.name, edit.bg, edit.en, cat);
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
  // Add a built-in starter element to the editable library (a "fork" — it becomes an
  // ordinary editable item the owner can change or delete; the original built-in stays
  // as a fallback in code). Matched by name, so it then drops out of the built-in list.
  async function addBuiltin(b: Builtin) {
    setBusy("bi:" + b.id); setErr("");
    const r = await addLibraryItemAction(b.name, b.bg, b.en, b.category);
    setBusy("");
    if (r.error) return setErr(r.error);
    if (r.item) setItems((x) => [...x, r.item!]);
  }
  async function addAllBuiltins() {
    setBusy("bi:all"); setErr("");
    for (const b of availableBuiltins) {
      const r = await addLibraryItemAction(b.name, b.bg, b.en, b.category);
      if (r.item) setItems((x) => [...x, r.item!]);
      else if (r.error) { setErr(r.error); break; }
    }
    setBusy("");
  }

  // Remove a category → reassign its items to the default bucket. (Categories are just
  // a field on each item — there's no separate category store — so an empty category
  // can't persist; reassigning keeps the items and drops the now-unused category.)
  async function removeCategory(cat: string) {
    if (cat === DEFAULT_CAT) return;
    const inCat = items.filter((i) => (i.category || DEFAULT_CAT) === cat);
    if (!window.confirm(L(
      `Да премахна ли категорията „${cat}“? ${inCat.length} елемент(а) ще се преместят в „${DEFAULT_CAT}“.`,
      `Remove the “${cat}” category? Its ${inCat.length} item(s) will move to “${DEFAULT_CAT}”.`))) return;
    setBusy("cat");
    for (const it of inCat) {
      const r = await updateLibraryItemAction(it.id, it.name, it.bg, it.en, DEFAULT_CAT);
      if (r.item) setItems((x) => x.map((i) => (i.id === r.item!.id ? r.item! : i)));
    }
    setBusy("");
    if (filter === cat) setFilter("");
  }

  const chip = (active: boolean): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px",
    borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 600,
    border: "1px solid " + (active ? "var(--green-line)" : "var(--line)"),
    background: active ? "var(--green-soft)" : "#fff",
    color: active ? "var(--green-dark)" : "var(--ink)",
  });

  return (
    <div>
      {/* toolbar: add + category filter chips */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button className="btn btn-primary" onClick={openNew}>＋ {t("items.new")}</button>
        <span style={{ width: 1, height: 24, background: "var(--line)", margin: "0 4px" }} />
        <button style={chip(!filter)} onClick={() => setFilter("")}>{L("Всички", "All")} <span style={{ opacity: .6 }}>({items.length})</span></button>
        {categories.map((c) => (
          <span key={c} style={chip(filter === c)}>
            <span onClick={() => setFilter(filter === c ? "" : c)} style={{ cursor: "pointer" }}>{c} <span style={{ opacity: .6 }}>({countIn(c)})</span></span>
            {c !== DEFAULT_CAT && (
              <button
                title={L("Премахни категорията", "Remove category")}
                onClick={() => removeCategory(c)}
                disabled={busy === "cat"}
                style={{ border: 0, background: "none", cursor: "pointer", color: "var(--muted)", fontSize: 13, lineHeight: 1, padding: 0, marginLeft: 2 }}
              >✕</button>
            )}
          </span>
        ))}
      </div>

      {edit && (
        <div className="card p-4 mb-5" style={{ borderColor: "var(--green-line)" }}>
          <div className="font-bold mb-3" style={{ color: "var(--green-dark)" }}>{edit.id === "new" ? t("items.newTitle") : t("items.editTitle")}</div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "2fr 1fr" }}>
            <label className="block"><span className="block text-xs mb-1" style={{ color: "var(--muted)" }}>{t("items.name")}</span>
              <input style={inputStyle} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus /></label>
            <label className="block"><span className="block text-xs mb-1" style={{ color: "var(--muted)" }}>{t("items.category")} <span style={{ opacity: .7 }}>· {L("изберете или напишете нова", "choose or type a new one")}</span></span>
              <input style={inputStyle} list="item-cats" value={edit.category} placeholder={DEFAULT_CAT} onChange={(e) => setEdit({ ...edit, category: e.target.value })} />
              <datalist id="item-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist></label>
          </div>
          <label className="block mt-3"><span className="block text-xs mb-1" style={{ color: "var(--muted)" }}>{t("items.bg")}</span>
            <textarea style={{ ...inputStyle, resize: "vertical" }} rows={3} value={edit.bg} onChange={(e) => setEdit({ ...edit, bg: e.target.value })} /></label>
          <button className="btn mt-2" style={{ fontSize: 12, padding: "5px 12px" }} onClick={translate} disabled={busy === "tr"}>{busy === "tr" ? "…" : "⇄ БГ → EN"}</button>
          <label className="block mt-3"><span className="block text-xs mb-1" style={{ color: "var(--muted)" }}>{t("items.en")}</span>
            <textarea style={{ ...inputStyle, resize: "vertical" }} rows={3} value={edit.en} onChange={(e) => setEdit({ ...edit, en: e.target.value })} /></label>
          {/* live preview of the element as it will be inserted */}
          {(edit.bg || edit.en) && (
            <div className="mt-3">
              <span className="block text-xs mb-1" style={{ color: "var(--muted)" }}>{L("Преглед", "Preview")}</span>
              <div style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px", background: "#fff", fontFamily: "'PT Serif',Georgia,serif", fontSize: 13, lineHeight: 1.5 }}
                dangerouslySetInnerHTML={{ __html: sanitizeDocHtml(`<p>${esc((lang === "bg" ? edit.bg : edit.en || edit.bg) || "")}</p>`) }} />
            </div>
          )}
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
          <div className="flex items-center gap-2 mb-2">
            <div className="text-xs font-bold" style={{ letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)" }}>{cat}</div>
            <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
            <div className="text-xs" style={{ color: "var(--muted)" }}>{list.length}</div>
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))" }}>
            {list.map((it) => (
              <div key={it.id} className="card p-3" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="font-bold" style={{ fontSize: 14 }}>{it.name}</div>
                {/* rendered preview (what gets inserted), in the current UI language */}
                <div style={{ border: "1px solid var(--line)", borderRadius: 6, padding: "8px 10px", background: "#fff", fontFamily: "'PT Serif',Georgia,serif", fontSize: 12.5, lineHeight: 1.5, maxHeight: 108, overflow: "auto" }}
                  dangerouslySetInnerHTML={{ __html: previewHtml(it) }} />
                <div className="flex gap-2 mt-auto">
                  <button className="btn" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => openEdit(it)}>✎ {t("common.edit")}</button>
                  <button className="btn" style={{ fontSize: 12, padding: "4px 10px", borderColor: "var(--red)", color: "var(--red)" }} onClick={() => del(it)}>{t("common.delete")}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* built-in starter elements — add any to make it an editable item */}
      {availableBuiltins.length > 0 && !filter && (
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-2">
            <div className="text-xs font-bold" style={{ letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)" }}>{L("Вградени елементи", "Built-in elements")}</div>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{L("готови за добавяне и редактиране", "ready to add & edit")}</span>
            <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
            <button className="btn" style={{ fontSize: 12, padding: "5px 12px" }} onClick={addAllBuiltins} disabled={busy === "bi:all"}>{busy === "bi:all" ? "…" : L("Добави всички", "Add all")}</button>
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))" }}>
            {availableBuiltins.map((b) => (
              <div key={b.id} className="card p-3" style={{ display: "flex", flexDirection: "column", gap: 8, borderStyle: "dashed" }}>
                <div className="font-bold" style={{ fontSize: 14 }}>{b.name} <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>· {b.category}</span></div>
                <div style={{ border: "1px solid var(--line)", borderRadius: 6, padding: "8px 10px", background: "#fff", fontFamily: "'PT Serif',Georgia,serif", fontSize: 12.5, lineHeight: 1.5, maxHeight: 108, overflow: "auto" }}
                  dangerouslySetInnerHTML={{ __html: sanitizeDocHtml(`<p>${esc((lang === "bg" ? b.bg : b.en) || "")}</p>`) }} />
                <button className="btn btn-primary" style={{ fontSize: 12.5, padding: "5px 12px", marginTop: "auto" }} disabled={busy === "bi:" + b.id} onClick={() => addBuiltin(b)}>{busy === "bi:" + b.id ? "…" : L("＋ Добави за редакция", "＋ Add for editing")}</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

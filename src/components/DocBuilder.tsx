"use client";

import { useState } from "react";
import { translateAction, saveComposedAction } from "@/lib/actions";
import type { Block } from "@/lib/types";
import { LIBRARY, FIELDS } from "@/lib/blocks";

let seq = 0;
const newId = () => `b${Date.now()}_${seq++}`;
const fieldLabel = (k: string) => FIELDS.find((f) => f.key === k)?.en ?? k;

const ta = { width: "100%", border: "1px solid var(--line)", borderRadius: 6, padding: "6px 8px", fontSize: 14, fontFamily: "inherit" } as const;

export default function DocBuilder({
  schemeId,
  docKey,
  docNameEn,
  initial,
  defaultBlocks = [],
}: {
  schemeId: string;
  docKey: string;
  docNameEn: string;
  initial: Block[];
  defaultBlocks?: Block[];
}) {
  const [blocks, setBlocks] = useState<Block[]>(initial);
  const [started, setStarted] = useState(initial.length > 0); // false → show template chooser
  const [saved, setSaved] = useState(true);
  const [ver, setVer] = useState(0); // bump to refresh preview iframe after save
  const [lang, setLang] = useState<"bg" | "en">("bg");
  const [busy, setBusy] = useState<string>("");

  const touch = () => setSaved(false);
  const update = (id: string, patch: Partial<Block>) => { setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b))); touch(); };
  const add = (b: Block) => { setBlocks((bs) => [...bs, b]); touch(); };
  const remove = (id: string) => { setBlocks((bs) => bs.filter((b) => b.id !== id)); touch(); };
  const move = (id: string, dir: 1 | -1) =>
    setBlocks((bs) => {
      const i = bs.findIndex((b) => b.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= bs.length) return bs;
      const c = [...bs];
      [c[i], c[j]] = [c[j], c[i]];
      touch();
      return c;
    });

  async function translate(id: string, dir: "bg2en" | "en2bg") {
    const b = blocks.find((x) => x.id === id);
    if (!b) return;
    setBusy(id);
    const r = dir === "bg2en" ? await translateAction(b.bg ?? "", "bg", "en") : await translateAction(b.en ?? "", "en", "bg");
    setBusy("");
    if (r.error) return alert("Translation: " + r.error);
    update(id, dir === "bg2en" ? { en: r.text } : { bg: r.text });
  }

  async function save() {
    setBusy("save");
    await saveComposedAction(schemeId, docKey, JSON.stringify(blocks));
    setBusy("");
    setSaved(true);
    setVer((v) => v + 1);
  }

  // Translate the whole document BG→EN in one click (each text/heading block).
  async function translateAll() {
    setBusy("all");
    const out: Block[] = [];
    for (const b of blocks) {
      if ((b.type === "text" || b.type === "heading") && (b.bg ?? "").trim()) {
        const r = await translateAction(b.bg ?? "", "bg", "en");
        out.push(r.error ? b : { ...b, en: r.text });
      } else out.push(b);
    }
    setBlocks(out);
    setSaved(false);
    setBusy("");
    setLang("en");
  }

  async function downloadPdf() {
    setBusy("pdf");
    try {
      const res = await fetch("/api/pdf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: schemeId, doc: docKey, lang, composed: true }),
      });
      if (!res.ok) throw new Error(await res.text());
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `${schemeId}_${docKey}_${lang}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("PDF failed: " + (e as Error).message);
    }
    setBusy("");
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button className="btn btn-primary" onClick={save} disabled={busy === "save"}>
          {busy === "save" ? "Saving…" : saved ? "Saved ✓" : "Save"}
        </button>
        <span className="text-sm" style={{ color: "var(--muted)" }}>Preview:</span>
        {(["bg", "en"] as const).map((l) => (
          <button key={l} className="btn" onClick={() => setLang(l)} style={lang === l ? { background: "var(--green)", color: "#fff", borderColor: "var(--green)" } : {}}>
            {l === "bg" ? "БГ" : "EN"}
          </button>
        ))}
        <button className="btn" onClick={translateAll} disabled={busy === "all"} title="Translate every paragraph BG→EN — then review/edit the English">
          {busy === "all" ? "Translating…" : "⇄ Translate whole doc → EN"}
        </button>
        <button className="btn ml-auto" onClick={downloadPdf} disabled={busy === "pdf"}>{busy === "pdf" ? "…" : "⬇ PDF"}</button>
      </div>

      {!started && (
        <div className="card p-4 mb-3" style={{ borderLeft: "4px solid var(--green)" }}>
          <div className="font-bold" style={{ color: "var(--green-dark)" }}>Start this document from…</div>
          <div className="flex gap-2 mt-2 flex-wrap">
            {defaultBlocks.length > 0 && (
              <button className="btn btn-primary" onClick={() => { setBlocks(defaultBlocks); setStarted(true); setSaved(false); }}>
                📄 Default template (full {docNameEn})
              </button>
            )}
            <button className="btn" onClick={() => { setBlocks([]); setStarted(true); setSaved(false); }}>＋ Plain (blank)</button>
          </div>
          {defaultBlocks.length === 0 && (
            <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
              No default template for this document yet — start plain and insert items, or save your own template later.
            </p>
          )}
        </div>
      )}

      {started && (
      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {/* editor */}
        <div>
          {blocks.length === 0 && (
            <div className="card p-4" style={{ color: "var(--muted)" }}>Empty document — add blocks below, or insert a snippet / field.</div>
          )}
          {blocks.map((b, i) => (
            <div key={b.id} className="card p-3 mb-2" style={{ borderLeft: `3px solid ${b.type === "field" ? "var(--green-dark)" : "var(--green)"}` }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold" style={{ color: "var(--muted)" }}>
                  {b.type === "field" ? `⚙ FIELD · ${fieldLabel(b.field ?? "")}` : b.type.toUpperCase()}
                </span>
                <span className="ml-auto flex gap-1">
                  <button className="btn" style={{ padding: "2px 8px" }} onClick={() => move(b.id, -1)} disabled={i === 0}>↑</button>
                  <button className="btn" style={{ padding: "2px 8px" }} onClick={() => move(b.id, 1)} disabled={i === blocks.length - 1}>↓</button>
                  <button className="btn" style={{ padding: "2px 8px", color: "var(--red)", borderColor: "var(--red)" }} onClick={() => remove(b.id)}>✕</button>
                </span>
              </div>

              {b.type === "field" ? (
                <div className="text-sm" style={{ color: "var(--green-dark)" }}>Fills automatically from the scheme — always consistent.</div>
              ) : (
                <>
                  <div className="text-xs mb-1" style={{ color: "var(--muted)" }}>Български</div>
                  {b.type === "heading" ? (
                    <input value={b.bg ?? ""} onChange={(e) => update(b.id, { bg: e.target.value })} style={ta} />
                  ) : (
                    <textarea value={b.bg ?? ""} onChange={(e) => update(b.id, { bg: e.target.value })} rows={3} style={ta} />
                  )}
                  <div className="flex gap-2 my-1">
                    <button className="btn" style={{ padding: "2px 8px", fontSize: 12 }} onClick={() => translate(b.id, "bg2en")} disabled={busy === b.id}>
                      {busy === b.id ? "…" : "БГ → EN ⇣"}
                    </button>
                    <button className="btn" style={{ padding: "2px 8px", fontSize: 12 }} onClick={() => translate(b.id, "en2bg")} disabled={busy === b.id}>
                      EN → БГ ⇡
                    </button>
                  </div>
                  <div className="text-xs mb-1" style={{ color: "var(--muted)" }}>English (draft — edit freely)</div>
                  {b.type === "heading" ? (
                    <input value={b.en ?? ""} onChange={(e) => update(b.id, { en: e.target.value })} style={ta} />
                  ) : (
                    <textarea value={b.en ?? ""} onChange={(e) => update(b.id, { en: e.target.value })} rows={3} style={ta} />
                  )}
                </>
              )}
            </div>
          ))}

          {/* add bar */}
          <div className="flex gap-2 flex-wrap mt-3">
            <button className="btn" onClick={() => add({ id: newId(), type: "text", bg: "", en: "" })}>＋ Text</button>
            <button className="btn" onClick={() => add({ id: newId(), type: "heading", bg: "", en: "" })}>＋ Heading</button>
            <select className="btn" style={{ background: "#fff" }} defaultValue="" onChange={(e) => {
              const el = LIBRARY.find((x) => x.id === e.target.value);
              if (el) add({ id: newId(), type: "text", bg: el.bg, en: el.en });
              e.target.value = "";
            }}>
              <option value="">＋ From library ▾</option>
              {LIBRARY.map((el) => <option key={el.id} value={el.id}>{el.name} ({el.category})</option>)}
            </select>
            <select className="btn" style={{ background: "#fff" }} defaultValue="" onChange={(e) => {
              if (e.target.value) add({ id: newId(), type: "field", field: e.target.value });
              e.target.value = "";
            }}>
              <option value="">＋ Field ▾</option>
              {FIELDS.map((f) => <option key={f.key} value={f.key}>{f.en}</option>)}
            </select>
          </div>
        </div>

        {/* preview */}
        <div className="card overflow-hidden" style={{ height: "78vh" }}>
          <iframe
            key={`${lang}-${ver}`}
            title="preview"
            src={`/schemes/${schemeId}/build/${docKey}/print?lang=${lang}&v=${ver}`}
            style={{ width: "100%", height: "100%", border: 0, background: "#fff" }}
          />
        </div>
      </div>
      )}
      <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
        The preview shows the last <b>saved</b> version. Save to refresh it. “{docNameEn}” · fields fill from the scheme automatically.
      </p>
    </div>
  );
}

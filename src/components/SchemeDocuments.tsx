"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { uploadSchemeDocAction, removeSchemeDocUploadAction, setDocSourceAction } from "@/lib/actions";

export type DocSource = "built" | "uploaded" | "none";
export interface DocRow {
  key: string;
  name: string;
  form: string;
  isForm: boolean;
  hasBuilt: boolean;
  hasUpload: boolean;
  active: DocSource;      // which version is shown/official
  uploadName?: string;
  buildHref: string;      // open/create in the app editor (or fill view)
}
export interface DocStageView { key: string; label: string; docs: DocRow[] }

const ACCEPT = "application/pdf,image/png,image/jpeg";

export default function SchemeDocuments({ schemeId, lang, stages }: { schemeId: string; lang: "bg" | "en"; stages: DocStageView[] }) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingKey = useRef<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const [viewer, setViewer] = useState<DocRow | null>(null);
  const [, startTransition] = useTransition();

  function pickFile(docKey: string) {
    setMenuKey(null);
    pendingKey.current = docKey;
    fileRef.current?.click();
  }
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const docKey = pendingKey.current;
    e.target.value = "";
    if (!file || !docKey) return;
    if (file.size > 15_000_000) { alert(L("Файлът е твърде голям (макс. 15 MB).", "File too large (max 15 MB).")); return; }
    setBusyKey(docKey);
    const fd = new FormData();
    fd.append("schemeId", schemeId);
    fd.append("docKey", docKey);
    fd.append("file", file);
    const r = await uploadSchemeDocAction(fd);
    setBusyKey(null);
    if (r?.error) { alert(r.error); return; }
    router.refresh();
  }
  function removeUpload(docKey: string) {
    setMenuKey(null);
    if (!window.confirm(L("Да премахна ли качения файл?", "Remove the uploaded file?"))) return;
    setBusyKey(docKey);
    startTransition(async () => {
      const fd = new FormData(); fd.append("schemeId", schemeId); fd.append("docKey", docKey);
      await removeSchemeDocUploadAction(fd);
      setBusyKey(null);
      setViewer(null);
      router.refresh();
    });
  }
  function switchSource(docKey: string, source: "built" | "uploaded") {
    setMenuKey(null);
    setBusyKey(docKey);
    startTransition(async () => {
      await setDocSourceAction(schemeId, docKey, source);
      setBusyKey(null);
      router.refresh();
    });
  }

  // status pill per active source
  function pill(d: DocRow) {
    if (d.active === "uploaded") return <span style={{ ...pillBase, background: "#e4eef3", color: "#2f6f8f" }}>{L("Качен", "Uploaded")}</span>;
    if (d.active === "built") return <span style={{ ...pillBase, background: "#e3eeda", color: "#456b2c" }}>{L("Готов", "Ready")}</span>;
    return <span style={{ ...pillBase, background: "#eef1ee", color: "#666" }}>{L("Незапочнат", "Not started")}</span>;
  }

  return (
    <div>
      <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={onFile} />
      {stages.map((st) => (
        <div key={st.key} style={{ marginTop: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, margin: "0 2px 10px" }}>
            <span style={stageIdx}>{st.key}</span>
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".02em" }}>{st.label}</span>
            <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{st.docs.length} {L("док.", "docs")}</span>
            <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {st.docs.map((d) => {
              const busy = busyKey === d.key;
              const tone = d.active === "uploaded" ? { bg: "#e4eef3", bd: "#b9d5e2", fg: "#2f6f8f", ext: "PDF" }
                : d.active === "built" ? { bg: "#eef3ea", bd: "#cbd9be", fg: "#57823c", ext: "DOC" }
                : { bg: "var(--surface-2,#f5f8f2)", bd: "var(--line)", fg: "#98a291", ext: "—" };
              return (
                <div key={d.key} style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: "#fff", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px", opacity: busy ? 0.6 : 1 }}>
                  {/* file glyph */}
                  <span style={{ width: 34, height: 40, flex: "0 0 auto", borderRadius: 5, position: "relative", display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 5, background: tone.bg, border: `1px solid ${tone.bd}` }}>
                    <span style={{ fontSize: 8, fontWeight: 800, color: tone.fg }}>{tone.ext}</span>
                  </span>
                  <div style={{ flex: "1 1 210px", minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: "-.005em", lineHeight: 1.2 }}>{d.name}</div>
                    <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span>{d.form}</span>
                      {d.active === "uploaded" && d.uploadName && (<><span>·</span><span style={{ color: "#2f6f8f", fontWeight: 600 }}>📎 {d.uploadName}</span></>)}
                      {d.hasBuilt && d.hasUpload && (
                        <>
                          <span>·</span>
                          <button onClick={() => switchSource(d.key, d.active === "uploaded" ? "built" : "uploaded")}
                            style={{ border: 0, background: "none", cursor: "pointer", color: "var(--green-dark,#3d6b47)", fontWeight: 700, fontSize: 11.5, padding: 0, textDecoration: "underline", textUnderlineOffset: 2 }}>
                            {d.active === "uploaded" ? L("↺ Използвай създадения", "↺ Use the built one") : L("↺ Използвай качения", "↺ Use the uploaded one")}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {/* status + actions stay together and wrap under the title on narrow widths */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
                    {pill(d)}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "0 0 auto" }}>
                      {d.active === "uploaded" ? (
                        <button className="btn" style={btnSm} onClick={() => setViewer(d)}>{L("Виж", "View")} ↗</button>
                      ) : d.active === "built" ? (
                        <Link className="btn" style={btnSm} href={d.buildHref}>{L("Отвори", "Open")}</Link>
                      ) : (
                        <>
                          <button className="btn" style={btnSm} onClick={() => pickFile(d.key)}>＋ {L("Качи", "Upload")}</button>
                          <Link className="btn btn-primary" style={btnSm} href={d.buildHref}>{L("Създай", "Create")}</Link>
                        </>
                      )}
                      {d.active !== "none" && (
                        <button aria-label="More" style={kebab} onClick={() => setMenuKey(menuKey === d.key ? null : d.key)}>⋯</button>
                      )}
                    </div>
                  </div>

                  {menuKey === d.key && (
                    <>
                      <div style={{ position: "fixed", inset: 0, zIndex: 19 }} onClick={() => setMenuKey(null)} />
                      <div role="menu" style={rowMenu}>
                        {d.active === "uploaded" ? (
                          <>
                            <button style={menuItem} onClick={() => { setMenuKey(null); setViewer(d); }}>◱ {L("Виж файла", "View file")}</button>
                            <a style={menuItem} href={`/schemes/${schemeId}/uploaded/${d.key}?download=1`} target="_blank" rel="noopener" onClick={() => setMenuKey(null)}>⬇ {L("Свали", "Download")}</a>
                            <button style={menuItem} onClick={() => pickFile(d.key)}>⟳ {L("Замени файла", "Replace file")}</button>
                            {d.hasBuilt && <button style={menuItem} onClick={() => switchSource(d.key, "built")}>✎ {L("Използвай създадения", "Use the built version")}</button>}
                            <Link style={menuItem} href={d.buildHref}>✎ {L("Отвори в редактора", "Open in editor")}</Link>
                            <div style={menuSep} />
                            <button style={{ ...menuItem, color: "var(--red,#9e2b2b)" }} onClick={() => removeUpload(d.key)}>🗑 {L("Премахни файла", "Remove file")}</button>
                          </>
                        ) : (
                          <>
                            <Link style={menuItem} href={d.buildHref}>✎ {L("Отвори в редактора", "Open in editor")}</Link>
                            <button style={menuItem} onClick={() => pickFile(d.key)}>＋ {L("Качи готов файл", "Upload a ready file")}</button>
                            {d.hasUpload && <button style={menuItem} onClick={() => switchSource(d.key, "uploaded")}>◱ {L("Използвай качения", "Use the uploaded file")}</button>}
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* inline viewer */}
      {viewer && (
        <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) setViewer(null); }}>
          <div style={sheet}>
            <div style={sheetH}>
              <span style={{ fontSize: 15, fontWeight: 750 }}>{viewer.name}</span>
              {viewer.uploadName && <span style={{ fontSize: 12, color: "var(--muted)" }}>· {viewer.uploadName}</span>}
              <button aria-label="Close" onClick={() => setViewer(null)} style={{ marginLeft: "auto", border: 0, background: "none", cursor: "pointer", fontSize: 18, color: "var(--muted)" }}>✕</button>
            </div>
            <iframe title={viewer.name} src={`/schemes/${schemeId}/uploaded/${viewer.key}`} style={{ width: "100%", flex: 1, minHeight: 420, border: 0, background: "#f5f8f2" }} />
            <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--line)", flexWrap: "wrap" }}>
              <button className="btn" style={btnSm} onClick={() => pickFile(viewer.key)}>⟳ {L("Замени", "Replace")}</button>
              <a className="btn" style={btnSm} href={`/schemes/${schemeId}/uploaded/${viewer.key}?download=1`} target="_blank" rel="noopener">⬇ {L("Свали", "Download")}</a>
              {viewer.hasBuilt && <button className="btn" style={btnSm} onClick={() => { switchSource(viewer.key, "built"); setViewer(null); }}>✎ {L("Използвай създадения", "Use built version")}</button>}
              <button className="btn" style={{ ...btnSm, borderColor: "var(--red,#9e2b2b)", color: "var(--red,#9e2b2b)" }} onClick={() => removeUpload(viewer.key)}>🗑 {L("Премахни", "Remove")}</button>
              <button className="btn" style={{ ...btnSm, marginLeft: "auto" }} onClick={() => setViewer(null)}>{L("Затвори", "Close")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const pillBase: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap" };
const btnSm: React.CSSProperties = { fontSize: 12.5, height: 32, padding: "0 11px" };
const kebab: React.CSSProperties = { width: 34, height: 34, borderRadius: 8, border: "1px solid transparent", background: "transparent", color: "var(--muted)", cursor: "pointer", fontSize: 17, lineHeight: 1 };
const stageIdx: React.CSSProperties = { width: 24, height: 24, borderRadius: 7, background: "#e7f0e6", color: "#3d6b47", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, flex: "0 0 auto" };
const rowMenu: React.CSSProperties = { position: "absolute", right: 10, top: "calc(100% - 4px)", zIndex: 20, minWidth: 226, background: "#fff", border: "1px solid var(--line)", borderRadius: 12, boxShadow: "0 14px 38px rgba(15,30,22,.18)", padding: 6, display: "flex", flexDirection: "column", gap: 1 };
const menuItem: React.CSSProperties = { display: "flex", alignItems: "center", gap: 9, border: 0, background: "transparent", color: "var(--ink)", fontFamily: "inherit", fontSize: 13, fontWeight: 500, padding: "9px 11px", borderRadius: 8, cursor: "pointer", textAlign: "left", textDecoration: "none", width: "100%" };
const menuSep: React.CSSProperties = { height: 1, background: "var(--line)", margin: "4px 2px" };
const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(18,28,18,.5)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 26 };
const sheet: React.CSSProperties = { width: "100%", maxWidth: 720, height: "86vh", background: "#fff", border: "1px solid var(--line)", borderRadius: 16, boxShadow: "0 24px 60px rgba(0,0,0,.3)", display: "flex", flexDirection: "column", overflow: "hidden" };
const sheetH: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, padding: "13px 16px", borderBottom: "1px solid var(--line)" };

"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { uploadSchemeDocAction, removeSchemeDocUploadAction, setDocSourceAction, saveDocHtmlAction, setDocSentAction } from "@/lib/actions";

export type DocSource = "built" | "uploaded" | "none";
export interface DocRow {
  key: string;
  name: string;
  form: string;
  isForm: boolean;
  isList?: boolean;       // an auto register (F 7.2.1-4/-5/-6) — no lifecycle
  hasBuilt: boolean;
  hasUpload: boolean;
  active: DocSource;      // which version is shown/official
  done: boolean;          // counts as ready (isDocDone — editor docs need the explicit flag)
  uploadName?: string;
  buildHref: string;      // open/create in the app editor (or fill view)
  viewHref?: string;      // lists: the live auto view (preview + PDF)
  sendable?: boolean;     // one of the documents participants may receive
  sentAt?: string;        // dd.mm.yyyy when it was released to them (absent = not sent)
  sentCopy?: boolean;     // the edition they were sent is on record and can be opened (part 3.0)
  edition?: { no: number; date: string }; // the latest edition (3.0)
  sentEdition?: number;   // the edition the participants hold
  editionsHref?: string;  // the document's editions; absent: it has none (the lists, the certificate)
}
export interface DocStageView { key: string; label: string; docs: DocRow[] }

const ACCEPT = "application/pdf,image/png,image/jpeg";

export default function SchemeDocuments({ schemeId, lang, stages, lists = [], canWrite = true, canSend = true }: { schemeId: string; lang: "bg" | "en"; stages: DocStageView[]; lists?: DocRow[]; /** may upload a file (UR-1) */ canWrite?: boolean; /** may send it to the participants (round 2, R2U-2) */ canSend?: boolean }) {
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
  // Release / withdraw. Sending is the deliberate act that puts the document in
  // every participant's portal and tells them — nothing else does, which is why it
  // asks first and reports how many participations were told.
  function setSent(d: DocRow, sent: boolean) {
    setMenuKey(null);
    // the plan, sent, is also public — on the scheme's page, before applying (D15, 5.4)
    const pub = d.key === "plan";
    const ask = sent
      ? L(`Да изпратя ли „${d.name}“ на участниците? Те ще го видят в портала и ще получат известие.${pub ? " Планът става и публичен — на страницата на схемата в сайта, преди заявяването." : ""}`,
          `Send “${d.name}” to the participants? They will see it in their portal and be notified.${pub ? " The plan also becomes public — on the scheme's page, before applying." : ""}`)
      : L(`Да спра ли споделянето на „${d.name}“? Участниците няма да го виждат повече.${pub ? " Планът престава да е и публичен." : ""}`,
          `Stop sharing “${d.name}”? The participants will no longer see it.${pub ? " The plan stops being public too." : ""}`);
    if (!window.confirm(ask)) return;
    setBusyKey(d.key);
    startTransition(async () => {
      let r = await setDocSentAction(schemeId, d.key, sent);
      // changed since its latest edition: it goes out as the next one, with what
      // changed and why (part 3.0 — a change is never silent)
      if (r?.needsNote) {
        const reason = window.prompt(L(
          `„${d.name}“ е променен след редакция № ${r.needsNote.since} и ще се изпрати като редакция № ${r.needsNote.no}. Какво е променено и защо?`,
          `“${d.name}” has changed since edition No. ${r.needsNote.since} and will go out as edition No. ${r.needsNote.no}. What changed, and why?`,
        ));
        if (!reason?.trim()) { setBusyKey(null); return; }
        const scope = window.prompt(L("Обхват — кои части (по желание):", "Scope — which parts (optional):")) ?? "";
        r = await setDocSentAction(schemeId, d.key, sent, { reason, scope });
      }
      setBusyKey(null);
      if (r?.error) { alert(r.error); return; }
      if (r?.stillTargeted) {
        alert(L(`Споделянето с всички е спряно. Остават ${r.stillTargeted} изпращания само до едно участие или потребител — оттеглят се от «Редакции».`,
          `Sharing with everyone is stopped. ${r.stillTargeted} release(s) to one participation or one user remain — withdraw them in «Editions».`));
      }
      // It went out either way — this only tells him what they will actually see.
      if (r?.scoresWithheld) {
        alert(L(
          `„${d.name}“ е изпратен. Съдържа оценки, изчислени от портала — те НЕ се показват на лабораториите (Реш. 135). Те виждат на тяхно място бележка.`,
          `“${d.name}” has been sent. It contains scores computed by the portal — those are NOT shown to the laboratories (Decision 135). They see a note in their place.`,
        ));
      }
      if (r?.namesWithheld) {
        alert(L(
          `„${d.name}“ е изпратен. Съдържа таблица с имената на участниците — тя НЕ се показва на лабораториите (поверително, §4.2). Те виждат на нейно място бележка.`,
          `“${d.name}” has been sent. It contains a table of participant names — that table is NOT shown to the laboratories (confidential, §4.2). They see a note in its place.`,
        ));
      }
      router.refresh();
    });
  }

  // A customized list back to fully automatic: clear the saved body (the old
  // version stays recoverable from the document's revision history).
  function resetList(docKey: string) {
    setMenuKey(null);
    if (!window.confirm(L("Да върна ли автоматичния изглед? Персонализацията се маха (пази се в историята).", "Restore the automatic view? The customization is removed (kept in history)."))) return;
    setBusyKey(docKey);
    startTransition(async () => {
      await saveDocHtmlAction(schemeId, docKey, "", "");
      setBusyKey(null);
      router.refresh();
    });
  }

  // status pill per active source. A built document with content shows "Готов"
  // only when the owner marked it so in the editor; until then it's "Започнат".
  function pill(d: DocRow) {
    if (d.active === "uploaded") return <span style={{ ...pillBase, background: "#e4eef3", color: "#2f6f8f" }}>{L("Качен", "Uploaded")}</span>;
    if (d.active === "built") {
      return d.done
        ? <span style={{ ...pillBase, background: "#e3eeda", color: "#456b2c" }}>{L("Готов ✓", "Ready ✓")}</span>
        : <span style={{ ...pillBase, background: "#faf2e0", color: "#9a6b22" }}>{L("Започнат", "Started")}</span>;
    }
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
                <div key={d.key} data-doc-row={d.key} style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: "#fff", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px", opacity: busy ? 0.6 : 1 }}>
                  {/* file glyph */}
                  <span style={{ width: 34, height: 40, flex: "0 0 auto", borderRadius: 5, position: "relative", display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 5, background: tone.bg, border: `1px solid ${tone.bd}` }}>
                    <span style={{ fontSize: 8, fontWeight: 800, color: tone.fg }}>{tone.ext}</span>
                  </span>
                  <div style={{ flex: "1 1 210px", minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: "-.005em", lineHeight: 1.2 }}>{d.name}</div>
                    <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span>{d.form}</span>
                      {d.active === "uploaded" && d.uploadName && (<><span>·</span><span style={{ color: "#2f6f8f", fontWeight: 600 }}>📎 {d.uploadName}</span></>)}
                      {d.edition && d.editionsHref && (<><span>·</span><Link href={d.editionsHref} data-edition-label={d.edition.no} title={L("Всички редакции на документа", "Every edition of the document")} style={{ color: "var(--muted)", fontWeight: 600 }}>{L("ред.", "ed.")} № {d.edition.no} · {d.edition.date}</Link></>)}
                      {d.sentAt && (<><span>·</span>{d.sentCopy
                        // opens exactly what the participants hold — its edition — whatever was edited since
                        ? <a href={`/schemes/${schemeId}/released/${d.key}?lang=${lang}`} target="_blank" rel="noreferrer" title={L("Отвори редакцията, която участниците получиха", "Open the edition the participants received")} style={{ color: "#3d6b47", fontWeight: 700 }}>📨 {L("изпратен", "sent")} {d.sentAt}{d.sentEdition ? ` (${L("ред.", "ed.")} № ${d.sentEdition})` : ""} ↗</a>
                        : <span style={{ color: "#3d6b47", fontWeight: 700 }}>📨 {L("изпратен", "sent")} {d.sentAt}</span>}</>)}
                      {canWrite && d.hasBuilt && d.hasUpload && (
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
                          {canWrite && <button className="btn" style={btnSm} onClick={() => pickFile(d.key)}>＋ {L("Качи", "Upload")}</button>}
                          <Link className="btn btn-primary" style={btnSm} href={d.buildHref}>{L("Създай", "Create")}</Link>
                        </>
                      )}
                      {/* the clear line: a document with something in it can be
                          released to the participants, and only then do they see it */}
                      {canSend && d.sendable && d.active !== "none" && !d.sentAt && (
                        <button className="btn" style={{ ...btnSm, borderColor: "#cbd9be", color: "#3d6b47", fontWeight: 700 }} onClick={() => setSent(d, true)}>
                          📨 {L("Изпрати", "Send")}
                        </button>
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
                        {canSend && d.sendable && (
                          <>
                            {d.sentAt ? (
                              <button style={menuItem} onClick={() => setSent(d, false)}>🚫 {L("Спри споделянето", "Stop sharing")}</button>
                            ) : (
                              <button style={menuItem} onClick={() => setSent(d, true)}>📨 {L("Изпрати на участниците", "Send to the participants")}</button>
                            )}
                            <div style={menuSep} />
                          </>
                        )}
                        {d.active === "uploaded" ? (
                          <>
                            <button style={menuItem} onClick={() => { setMenuKey(null); setViewer(d); }}>◱ {L("Виж файла", "View file")}</button>
                            <a style={menuItem} href={`/schemes/${schemeId}/uploaded/${d.key}?download=1`} target="_blank" rel="noopener" onClick={() => setMenuKey(null)}>⬇ {L("Свали", "Download")}</a>
                            {canWrite && <button style={menuItem} onClick={() => pickFile(d.key)}>⟳ {L("Замени файла", "Replace file")}</button>}
                            {canWrite && d.hasBuilt && <button style={menuItem} onClick={() => switchSource(d.key, "built")}>✎ {L("Използвай създадения", "Use the built version")}</button>}
                            <Link style={menuItem} href={d.buildHref}>✎ {L("Отвори в редактора", "Open in editor")}</Link>
                            {canWrite && <div style={menuSep} />}
                            {canWrite && <button style={{ ...menuItem, color: "var(--red,#9e2b2b)" }} onClick={() => removeUpload(d.key)}>🗑 {L("Премахни файла", "Remove file")}</button>}
                          </>
                        ) : (
                          <>
                            <Link style={menuItem} href={d.buildHref}>✎ {L("Отвори в редактора", "Open in editor")}</Link>
                            {canWrite && <button style={menuItem} onClick={() => pickFile(d.key)}>＋ {L("Качи готов файл", "Upload a ready file")}</button>}
                            {canWrite && d.hasUpload && <button style={menuItem} onClick={() => switchSource(d.key, "uploaded")}>◱ {L("Използвай качения", "Use the uploaded file")}</button>}
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

      {/* ── Automatic lists (F 7.2.1-4/-5/-6): generated live from the data ── */}
      {lists.length > 0 && (
        <div style={{ marginTop: 30 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, margin: "0 2px 4px" }}>
            <span style={{ ...stageIdx, background: "#e2edf2", color: "#2f6f8f" }}>⟳</span>
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".02em" }}>{L("Автоматични списъци", "Automatic lists")}</span>
            <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", margin: "0 2px 10px 37px" }}>
            {L("Попълват се сами от данните на участниците и резултатите — винаги актуални. При нужда могат да се персонализират в редактора.",
               "Fill themselves from the participants and results data — always up to date. They can be customized in the editor when needed.")}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {lists.map((d) => {
              const busy = busyKey === d.key;
              return (
                <div key={d.key} style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: "#fbfdfe", border: "1px solid #d7e5ec", borderRadius: 12, padding: "12px 14px", opacity: busy ? 0.6 : 1 }}>
                  <span style={{ width: 34, height: 40, flex: "0 0 auto", borderRadius: 5, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 5, background: "#e2edf2", border: "1px solid #c4d9e3" }}>
                    <span style={{ fontSize: 8, fontWeight: 800, color: "#2f6f8f" }}>AUTO</span>
                  </span>
                  <div style={{ flex: "1 1 210px", minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: "-.005em", lineHeight: 1.2 }}>{d.name}</div>
                    <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{d.form}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
                    {d.hasBuilt
                      ? <span style={{ ...pillBase, background: "#efe9f6", color: "#5b4a8f" }}>{L("Персонализиран", "Customized")}</span>
                      : <span style={{ ...pillBase, background: "#e2edf2", color: "#2f6f8f" }}>{L("Автоматичен ⟳", "Automatic ⟳")}</span>}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "0 0 auto" }}>
                      <Link className="btn" style={btnSm} href={d.viewHref ?? d.buildHref}>{L("Отвори", "Open")}</Link>
                      <button aria-label="More" style={kebab} onClick={() => setMenuKey(menuKey === d.key ? null : d.key)}>⋯</button>
                    </div>
                  </div>
                  {menuKey === d.key && (
                    <>
                      <div style={{ position: "fixed", inset: 0, zIndex: 19 }} onClick={() => setMenuKey(null)} />
                      <div role="menu" style={rowMenu}>
                        <Link style={menuItem} href={d.viewHref ?? d.buildHref} onClick={() => setMenuKey(null)}>◱ {L("Виж / PDF", "View / PDF")}</Link>
                        <Link style={menuItem} href={d.buildHref} onClick={() => setMenuKey(null)}>✎ {L("Персонализирай в редактора", "Customize in the editor")}</Link>
                        {d.hasBuilt && (
                          <>
                            <div style={menuSep} />
                            <button style={{ ...menuItem, color: "var(--red,#9e2b2b)" }} onClick={() => resetList(d.key)}>↺ {L("Върни автоматичния изглед", "Restore the automatic view")}</button>
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
      )}

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
              {canWrite && <button className="btn" style={btnSm} onClick={() => pickFile(viewer.key)}>⟳ {L("Замени", "Replace")}</button>}
              <a className="btn" style={btnSm} href={`/schemes/${schemeId}/uploaded/${viewer.key}?download=1`} target="_blank" rel="noopener">⬇ {L("Свали", "Download")}</a>
              {canWrite && viewer.hasBuilt && <button className="btn" style={btnSm} onClick={() => { switchSource(viewer.key, "built"); setViewer(null); }}>✎ {L("Използвай създадения", "Use built version")}</button>}
              {canWrite && <button className="btn" style={{ ...btnSm, borderColor: "var(--red,#9e2b2b)", color: "var(--red,#9e2b2b)" }} onClick={() => removeUpload(viewer.key)}>🗑 {L("Премахни", "Remove")}</button>}
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

"use client";

import { useEffect, useRef, useState } from "react";
import { saveDocHtmlAction, translateDocHtmlAction, translateAction, addLibraryItemAction, saveDocTemplateAction, deleteDocTemplateAction } from "@/lib/actions";
import { useLang } from "@/components/LangProvider";

type Snippet = { id: string; name: string; bg: string; en: string };
type Field = { key: string; label: string; bg: string; en: string };
type Tmpl = { id: string; name: string; bg: string; en: string };
type CopyItem = { id: string; number: string; title: string; bg: string; en: string };

const EDITOR_CSS = `
  .we-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 10px;background:var(--green-soft);border:1px solid var(--green-line);border-radius:10px;}
  .we-tool{display:inline-flex;align-items:center;justify-content:center;min-width:38px;height:36px;padding:0 11px;border:1px solid var(--line);background:#fff;border-radius:8px;cursor:pointer;font-weight:700;font-size:15px;color:var(--ink);transition:background .12s,border-color .12s;}
  .we-tool:hover{background:var(--green-soft);border-color:var(--green-line);}
  .we-sep{width:1px;height:24px;background:var(--green-line);margin:0 3px;}

  .we-body{display:flex;gap:24px;align-items:flex-start;background:var(--canvas);border:1px solid var(--line);border-radius:14px;padding:28px;}
  .we-col{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:16px;}

  .we-page{width:100%;max-width:820px;background:#fff;color:var(--ink);border:1px solid var(--line);border-radius:6px;
    padding:48px 64px;min-height:60vh;box-shadow:0 8px 28px rgba(15,30,22,.10);
    font-family:'PT Serif',Georgia,serif;font-size:12.5pt;line-height:1.7;outline:none;}
  .we-page:focus{box-shadow:0 8px 28px rgba(15,30,22,.12),0 0 0 2px var(--green-light);}
  .we-page h2{font-family:'Sofia Sans Condensed',sans-serif;font-weight:700;font-size:16pt;color:var(--green-dark);border-bottom:1px solid var(--line);padding-bottom:8px;margin:22px 0 10px;}
  .we-page p{margin:8px 0;} .we-page ul,.we-page ol{margin:8px 0 8px 24px;}
  .we-page img{max-width:100%;height:auto;border-radius:4px;cursor:move;}
  .we-page img.we-imgsel{outline:2px solid var(--green-dark);outline-offset:2px;}
  .we-page table{border-collapse:collapse;width:100%;font-family:'Sofia Sans Condensed',sans-serif;font-size:10.5pt;margin:10px 0;}
  .we-page table td,.we-page table th{border:1px solid var(--line);padding:6px 9px;text-align:left;vertical-align:top;}
  .we-page table th{background:var(--green-soft);color:var(--green-dark);}
  .we-page:empty:before{content:"Start typing, or insert an item from the panel →";color:var(--muted);}

  .we-imgbar{display:inline-flex;align-items:center;gap:12px;flex-wrap:wrap;background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px 16px;box-shadow:0 4px 16px rgba(15,30,22,.10);}
  .we-imgbar input[type=range]{accent-color:var(--green-dark);}
  .we-pill{display:inline-flex;align-items:center;height:30px;padding:0 12px;border:1px solid var(--line);background:#fff;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;color:var(--ink);}
  .we-pill:hover{background:var(--green-soft);}
  .we-pill.active{background:var(--green-soft);border-color:var(--green-line);color:var(--green-dark);}
  .we-pill.danger{color:var(--red);border-color:var(--red-soft);background:#fdf5f4;}

  .we-panel{width:330px;flex-shrink:0;background:var(--white);border:1px solid var(--line);border-radius:14px;box-shadow:0 4px 14px rgba(15,30,22,.06);padding:16px;max-height:82vh;overflow:auto;}
  .we-panelhdr{display:flex;align-items:center;gap:8px;margin-bottom:10px;}
  .we-panelhdr .ttl{font-weight:700;font-size:16px;color:var(--ink);}
  .we-collapse{margin-left:auto;border:0;background:none;cursor:pointer;color:var(--muted);font-size:14px;line-height:1;padding:4px;}
  .we-seclabel{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);}
  .we-item{border:1px solid transparent;border-radius:10px;margin-bottom:2px;overflow:hidden;}
  .we-item>button{width:100%;text-align:left;background:none;border:0;padding:12px;cursor:pointer;font-size:15px;font-weight:600;color:var(--ink);display:flex;gap:10px;align-items:center;border-radius:9px;}
  .we-item>button:hover{background:var(--green-soft);}
  .we-item.open{border-color:var(--green-line);}
  .we-item.open>button{background:var(--green-soft);color:var(--green-dark);}
  .we-addown{width:100%;display:inline-flex;align-items:center;justify-content:center;padding:13px;border:1.5px dashed var(--green-line);border-radius:9px;background:none;color:var(--green-dark);font-weight:700;font-size:14px;cursor:pointer;}
  .we-addown:hover{background:var(--green-soft);}
  .we-prev{background:#fff;border:1px solid var(--line);border-radius:6px;padding:10px;font-family:'PT Serif',Georgia,serif;font-size:9.5pt;line-height:1.45;max-height:220px;overflow:auto;}
  .we-prev h2{font-family:'Sofia Sans Condensed',sans-serif;font-weight:700;font-size:10pt;color:var(--green-dark);margin:4px 0;}
  .we-prev p{margin:3px 0;} .we-prev img{max-width:100%;height:auto;} .we-prev ul,.we-prev ol{margin:3px 0 3px 18px;}
  .we-prev table{border-collapse:collapse;width:100%;font-family:'Sofia Sans Condensed',sans-serif;font-size:8pt;}
  .we-prev td,.we-prev th{border:1px solid var(--line);padding:3px 5px;text-align:left;} .we-prev th{background:var(--green-soft);color:var(--green-dark);}

  /* faithful rendering of the real document markup inside the editor */
  .we-page h2.sec{font-size:14pt;color:var(--ink);border-bottom:2.5px solid var(--red);padding-bottom:5px;}
  .we-page h2.sec .n{color:var(--green-dark);}
  .we-page h3.sub{font-family:'Sofia Sans Condensed',sans-serif;font-weight:700;font-size:12pt;color:var(--green-dark);margin:12px 0 3px;}
  .we-page .body{margin-bottom:6px;} .we-page .muted{color:var(--muted);font-size:.9em;}
  .we-page .note{font-size:.82em;color:var(--muted);margin:4px 0 2px;}
  .we-page .example{font-size:.82em;font-style:italic;color:var(--muted);margin:3px 0;}
  .we-page .imp{font-family:'Sofia Sans Condensed',sans-serif;font-weight:700;color:var(--red);margin:8px 0 4px;}
  .we-page table.ptable th{background:var(--green-soft);color:var(--green-dark);}
  .we-page .team{display:grid;grid-template-columns:1fr 1fr;gap:6px;}
  .we-page .role{background:var(--green-soft);border-radius:6px;padding:5px 9px;}
  .we-page .role .rl{display:block;font-family:'Sofia Sans Condensed',sans-serif;font-weight:700;font-size:.86em;color:var(--green-dark);}
  .we-page .partner{display:flex;gap:12px;align-items:flex-start;} .we-page .partner img{height:46px;} .we-page .partner ul{margin:4px 0 0;padding-left:18px;font-size:.9em;}
  .we-page .cals{display:flex;gap:8px;flex-wrap:wrap;}
  .we-page .cal{width:96px;border:1px solid var(--green-line);border-radius:8px;overflow:hidden;text-align:center;}
  .we-page .cal .bar{display:block;height:10px;background:var(--green-dark);}
  .we-page .cal .d{font-family:'Sofia Sans Condensed',sans-serif;font-weight:700;color:var(--red);font-size:1.15em;padding:4px 0 0;}
  .we-page .cal .lbl{font-size:.72em;color:var(--muted);padding:2px 4px 6px;line-height:1.15;}
  .we-page .fld{margin:7px 0;} .we-page .fld .fl{font-family:'Sofia Sans Condensed',sans-serif;font-weight:700;font-size:.9em;}
  .we-page .blank{display:inline-block;min-width:220px;border-bottom:1px solid var(--line);height:15px;vertical-align:bottom;}
  .we-page .selbox{display:inline-block;border:1px solid var(--green-dark);border-radius:5px;padding:1px 10px;font-family:'Sofia Sans Condensed',sans-serif;font-weight:700;color:var(--green-dark);font-size:.9em;}
  .we-page .sig{display:flex;justify-content:space-between;gap:24px;margin-top:22px;}
  .we-page .sig .col{flex:1;border-top:1px solid #999;padding-top:3px;font-size:.82em;color:var(--muted);text-align:center;}
  .we-page .formula{background:var(--green-soft);border-left:3px solid var(--green-dark);padding:7px 12px;font-family:'Sofia Sans Condensed',sans-serif;margin:7px 0;}
  .we-page .internal{border:1px dashed var(--green-dark);background:var(--green-soft);border-radius:6px;padding:9px 12px;margin:8px 0 4px;color:var(--green-dark);font-family:'Sofia Sans Condensed',sans-serif;font-size:.9em;}
  .we-page ul.tight{margin:4px 0;padding-left:20px;} .we-page ul.tight li{margin:3px 0;}
  /* Order memo */
  .we-page .ohead{display:flex;align-items:center;gap:14px;border-bottom:2px solid var(--red);padding-bottom:8px;} .we-page .ohead .logo{height:54px;} .we-page .ohead .who{font-family:'Sofia Sans Condensed',sans-serif;font-size:.86em;color:var(--muted);margin-left:auto;text-align:right;}
  .we-page .otitle{font-family:'Sofia Sans Condensed',sans-serif;font-weight:800;color:var(--green-dark);font-size:1.7em;text-align:center;letter-spacing:3px;margin:22px 0 0;}
  .we-page .odate{text-align:center;color:var(--muted);font-family:'Sofia Sans Condensed',sans-serif;margin:2px 0 14px;}
  .we-page .orel{font-style:italic;margin:10px 0 4px;}
  .we-page .odecl{font-family:'Sofia Sans Condensed',sans-serif;font-weight:800;color:var(--red);text-align:center;font-size:1.1em;letter-spacing:2px;margin:12px 0 10px;}
  .we-page .oitem{margin:9px 0;} .we-page .oitem .lbl{font-family:'Sofia Sans Condensed',sans-serif;font-weight:700;} .we-page .oitem ul{margin:4px 0 0;padding-left:20px;}
  .we-page .oteam{margin:5px 0 0;padding-left:0;list-style:none;} .we-page .oteam .role{background:none;padding:0;color:var(--green-dark);}
  .we-page .osign .ln{width:260px;border-top:1px solid #999;padding-top:3px;margin-top:36px;}
  .we-page .osign .nm{font-family:'Sofia Sans Condensed',sans-serif;font-weight:700;} .we-page .osign .rl{color:var(--muted);font-size:.86em;}
  /* Certificate (decorative — shown compact in the editor) */
  .we-page .frame{border:2px solid var(--green-line);border-radius:10px;padding:28px;display:flex;flex-direction:column;align-items:center;text-align:center;}
  .we-page .frame .logo{height:70px;margin:8px 0 2px;}
  .we-page .ctitle{font-family:'Sofia Sans Condensed',sans-serif;font-weight:800;color:var(--green-dark);font-size:2.4em;letter-spacing:2px;margin:18px 0 2px;}
  .we-page .csub{font-family:'Sofia Sans Condensed',sans-serif;font-weight:600;font-size:1.3em;letter-spacing:3px;}
  .we-page .crule{width:120px;height:3px;background:var(--red);margin:6px 0 18px;}
  .we-page .labname{font-family:'Sofia Sans Condensed',sans-serif;font-weight:700;font-size:1.8em;border-bottom:1.5px solid var(--green-line);padding:0 30px 6px;}
  .we-page .schemeno,.we-page .schemename{font-family:'Sofia Sans Condensed',sans-serif;}
  .we-page .marks{display:flex;gap:24px;justify-content:center;align-items:center;margin:18px 0 8px;} .we-page .marks .ilac{height:64px;}
  .we-page .compiledby{margin-top:22px;font-family:'Sofia Sans Condensed',sans-serif;font-size:.9em;} .we-page .compiledby .ln{display:inline-block;border-bottom:1px solid #999;min-width:220px;}
  .we-page .code{font-family:'Sofia Sans Condensed',sans-serif;font-weight:700;color:var(--green-dark);} .we-page .empty{color:var(--muted);font-style:italic;text-align:center;}
`;

// crisp monochrome line icons (replace the old colour emoji)
const IconImage = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green-dark)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <circle cx="8.5" cy="10" r="1.6" fill="var(--green-dark)" stroke="none" />
    <path d="M5.5 17.5 10 13l3 3 3.5-3.5 2.5 2.5" />
  </svg>
);
const IconItems = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green-dark)" strokeWidth={2} aria-hidden>
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.8" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.8" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.8" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.8" />
  </svg>
);

export default function WordEditor({
  schemeId,
  docKey,
  docNameEn,
  initialBg,
  initialEn,
  defaultBg,
  defaultEn,
  hasDefault,
  schemeType = "T",
  snippets,
  fields,
  customItems = [],
  savedTemplates = [],
  copyFrom = [],
}: {
  schemeId: string;
  docKey: string;
  docNameEn: string;
  initialBg: string;
  initialEn: string;
  defaultBg: string;
  defaultEn: string;
  hasDefault: boolean;
  schemeType?: "T" | "C";
  snippets: Snippet[];
  fields: Field[];
  customItems?: Snippet[];
  savedTemplates?: Tmpl[];
  copyFrom?: CopyItem[];
}) {
  const { lang: uiLang } = useLang();
  const L = (bg: string, en: string) => (uiLang === "bg" ? bg : en);
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [lang, setLang] = useState<"bg" | "en">("bg");
  const [bg, setBg] = useState(initialBg);
  const [en, setEn] = useState(initialEn);
  const [started, setStarted] = useState(initialBg !== "" || initialEn !== "");
  const [saved, setSaved] = useState(true);
  const [busy, setBusy] = useState("");
  const [panel, setPanel] = useState(true);
  const [expanded, setExpanded] = useState(""); // which item is previewed
  const [custom, setCustom] = useState<Snippet[]>(customItems);
  const [adding, setAdding] = useState(false);
  const [naym, setNaym] = useState("");
  const [abg, setAbg] = useState("");
  const [aen, setAen] = useState("");
  const [imgSel, setImgSel] = useState<HTMLImageElement | null>(null);
  const [imgW, setImgW] = useState(50);
  const [imgAlign, setImgAlign] = useState<"left" | "center" | "right" | "inline">("inline");
  const [tmpls, setTmpls] = useState<Tmpl[]>(savedTemplates);

  // load content into the editor when it first appears / when started flips on
  useEffect(() => {
    if (started && ref.current) ref.current.innerHTML = lang === "bg" ? bg : en;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  const exec = (cmd: string, val?: string) => { ref.current?.focus(); document.execCommand(cmd, false, val); setSaved(false); };
  const insertHtml = (html: string) => { ref.current?.focus(); document.execCommand("insertHTML", false, html); setSaved(false); };
  const current = () => ref.current?.innerHTML ?? "";

  // ── image manipulation: click to select, then resize / align / move / remove ──
  function onEditorClick(e: React.MouseEvent) {
    ref.current?.querySelectorAll("img.we-imgsel").forEach((el) => el.classList.remove("we-imgsel"));
    const tgt = e.target as HTMLElement;
    if (tgt && tgt.tagName === "IMG") {
      const img = tgt as HTMLImageElement;
      img.classList.add("we-imgsel");
      setImgSel(img);
      const w = parseInt(img.style.width || "50", 10);
      setImgW(Number.isFinite(w) ? w : 50);
      const st = img.style;
      setImgAlign(st.cssFloat === "left" ? "left" : st.cssFloat === "right" ? "right" : st.display === "block" ? "center" : "inline");
    } else {
      setImgSel(null);
    }
  }
  function setImgWidth(pct: number) {
    if (!imgSel) return;
    imgSel.style.width = pct + "%";
    setImgW(pct);
    setSaved(false);
  }
  function alignImg(a: "left" | "center" | "right" | "inline") {
    if (!imgSel) return;
    imgSel.style.cssFloat = "";
    imgSel.style.display = "";
    imgSel.style.margin = "";
    if (a === "left") { imgSel.style.cssFloat = "left"; imgSel.style.margin = "4px 12px 8px 0"; }
    else if (a === "right") { imgSel.style.cssFloat = "right"; imgSel.style.margin = "4px 0 8px 12px"; }
    else if (a === "center") { imgSel.style.display = "block"; imgSel.style.margin = "8px auto"; }
    else { imgSel.style.display = "inline"; }
    setImgAlign(a);
    setSaved(false);
  }
  function removeImg() {
    imgSel?.remove();
    setImgSel(null);
    setSaved(false);
  }

  function fold() {
    // strip the selection-marker class so it never lands in the saved HTML
    ref.current?.querySelectorAll("img.we-imgsel").forEach((el) => el.classList.remove("we-imgsel"));
    const cur = current();
    const nb = lang === "bg" ? cur : bg;
    const ne = lang === "en" ? cur : en;
    setBg(nb);
    setEn(ne);
    return { nb, ne };
  }
  function switchLang(l: "bg" | "en") {
    if (l === lang) return;
    const { nb, ne } = fold();
    setLang(l);
    if (ref.current) ref.current.innerHTML = l === "bg" ? nb : ne;
  }
  async function save() {
    const { nb, ne } = fold();
    setBusy("save");
    await saveDocHtmlAction(schemeId, docKey, nb, ne);
    setBusy("");
    setSaved(true);
  }
  async function translate() {
    const { nb } = fold();
    setBusy("tr");
    const r = await translateDocHtmlAction(nb);
    setBusy("");
    if (r.error) return alert(L("Превод: ", "Translation: ") + r.error);
    setEn(r.html ?? "");
    setSaved(false);
    if (lang === "en" && ref.current) ref.current.innerHTML = r.html ?? "";
    else alert(L("Английската чернова е готова — превключете към EN, за да я прегледате/редактирате.", "English draft ready — switch to EN to review/edit it."));
  }
  async function downloadPdf() {
    await save();
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
      alert(L("Грешка при PDF: ", "PDF failed: ") + (e as Error).message);
    }
    setBusy("");
  }
  function onImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => insertHtml(`<img src="${rd.result}" alt="" style="width:50%">`);
    rd.readAsDataURL(f);
    e.target.value = "";
  }
  // begin editing from any source (default / blank / a saved template / another scheme)
  function startWith(b: string, e: string) {
    setBg(b);
    setEn(e);
    setLang("bg");
    setStarted(true);
    setSaved(false);
  }

  // save the current document (both languages) as a reusable template
  async function saveAsTemplate() {
    const name = window.prompt(
      L(
        `Наименувайте този шаблон „${docNameEn}“ (ще се предлага при стартиране на този документ във всяка ${schemeType === "C" ? "калибровъчна" : "изпитвателна"} схема):`,
        `Name this “${docNameEn}” template (it'll be offered when starting this document in any ${schemeType === "C" ? "calibration" : "testing"} scheme):`,
      ),
      docNameEn,
    );
    if (name === null) return;
    const { nb, ne } = fold();
    setBusy("tmpl");
    const r = await saveDocTemplateAction(docKey, schemeType, name, nb, ne);
    setBusy("");
    if (r.error) return alert(r.error);
    if (r.item) setTmpls((t) => [...t, { id: r.item!.id, name: r.item!.name, bg: r.item!.bg, en: r.item!.en }]);
    alert(L("Запазено като шаблон.", "Saved as a template."));
  }
  async function deleteTemplate(id: string) {
    if (!window.confirm(L("Да изтрия ли този запазен шаблон?", "Delete this saved template?"))) return;
    setTmpls((t) => t.filter((x) => x.id !== id));
    await deleteDocTemplateAction(id);
  }

  const escapeHtml = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  async function translateAddForm() {
    if (!abg.trim()) return;
    setBusy("addtr");
    const r = await translateAction(abg.trim(), "bg", "en");
    setBusy("");
    if (r.error) return alert(L("Превод: ", "Translation: ") + r.error);
    setAen(r.text ?? "");
  }
  async function saveOwnItem() {
    setBusy("additem");
    const r = await addLibraryItemAction(naym, abg, aen);
    setBusy("");
    if (r.error) return alert(r.error);
    if (r.item) {
      setCustom((c) => [...c, { id: r.item!.id, name: r.item!.name, bg: `<p>${escapeHtml(r.item!.bg)}</p>`, en: `<p>${escapeHtml(r.item!.en || r.item!.bg)}</p>` }]);
    }
    setNaym(""); setAbg(""); setAen(""); setAdding(false);
  }

  // an expandable item: click to preview, then Insert
  function itemCard(idKey: string, label: string, html: string) {
    const open = expanded === idKey;
    return (
      <div key={idKey} className={"we-item" + (open ? " open" : "")}>
        <button onClick={() => setExpanded(open ? "" : idKey)}>
          <span style={{ color: "var(--green-dark)" }}>{open ? "▾" : "▸"}</span> {label}
        </button>
        {open && (
          <div style={{ padding: "0 12px 12px" }}>
            <div className="we-prev" dangerouslySetInnerHTML={{ __html: html || L("<p style='color:#999'>(празно — попълнете го)</p>", "<p style='color:#999'>(empty — fill it in)</p>") }} />
            <button className="btn btn-primary mt-2" style={{ fontSize: 13 }} onClick={() => insertHtml(html)}>{L("Вмъкни ↩", "Insert ↩")}</button>
          </div>
        )}
      </div>
    );
  }

  if (!started) {
    const startRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--line)", borderRadius: 9, padding: "8px 10px" };
    return (
      <>
        <style>{EDITOR_CSS}</style>
        <div className="card p-5" style={{ borderLeft: "4px solid var(--green-dark)", maxWidth: 640 }}>
          <div className="font-bold" style={{ color: "var(--green-dark)", fontSize: 18 }}>{L(`Започни „${docNameEn}“ от…`, `Start “${docNameEn}” from…`)}</div>
          <div className="flex gap-2 mt-4 flex-wrap">
            {hasDefault && <button className="btn btn-primary" onClick={() => startWith(defaultBg, defaultEn)}>{L("Шаблон по подразбиране", "Default template")}</button>}
            <button className="btn" onClick={() => startWith("", "")}>{L("＋ Празна страница", "＋ Blank page")}</button>
          </div>

          {tmpls.length > 0 && (
            <div className="mt-5">
              <div className="we-seclabel">{L("ВАШИТЕ ЗАПАЗЕНИ ШАБЛОНИ", "YOUR SAVED TEMPLATES")}</div>
              <div className="mt-2" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {tmpls.map((t) => (
                  <div key={t.id} style={startRow}>
                    <span style={{ fontWeight: 600, flex: 1, minWidth: 0 }}>{t.name}</span>
                    <button className="btn" style={{ fontSize: 13, padding: "6px 12px" }} onClick={() => startWith(t.bg, t.en)}>{L("Използвай", "Use")}</button>
                    <button title={L("Изтрий шаблона", "Delete template")} onClick={() => deleteTemplate(t.id)} style={{ border: 0, background: "none", cursor: "pointer", color: "var(--muted)", fontSize: 15, lineHeight: 1 }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {copyFrom.length > 0 && (
            <div className="mt-5">
              <div className="we-seclabel">{L("КОПИРАЙ ОТ ПРЕДИШНА СХЕМА", "COPY FROM A PREVIOUS SCHEME")}</div>
              <div className="mt-2" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {copyFrom.map((c) => (
                  <div key={c.id} style={startRow}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: "var(--green-dark)" }}>{c.number}</div>
                      <div className="text-xs" style={{ color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</div>
                    </div>
                    <button className="btn" style={{ fontSize: 13, padding: "6px 12px" }} onClick={() => startWith(c.bg, c.en)}>{L("Копирай", "Copy")}</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs mt-4" style={{ color: "var(--muted)" }}>
            {L(
              "Можете да редактирате всичко след като започнете. Запазете завършен документ като шаблон за повторна употреба от лентата с инструменти (★ Запази като шаблон).",
              "You can edit everything after you start. Save a finished document as a reusable template from the toolbar (★ Save as template).",
            )}
          </p>
        </div>
      </>
    );
  }

  const tool = (label: string, title: string, fn: () => void) => (
    <button type="button" className="we-tool" title={title} onMouseDown={(e) => e.preventDefault()} onClick={fn}>{label}</button>
  );
  const alignPill = (a: "left" | "center" | "right" | "inline", label: string, title: string) => (
    <button type="button" className={"we-pill" + (imgAlign === a ? " active" : "")} title={title} onMouseDown={(e) => e.preventDefault()} onClick={() => alignImg(a)}>{label}</button>
  );

  return (
    <div>
      <style>{EDITOR_CSS}</style>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onImage} />

      {/* action bar */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button className="btn btn-primary" onClick={save} disabled={busy === "save"}>{busy === "save" ? L("Запазване…", "Saving…") : saved ? L("Запазено ✓", "Saved ✓") : L("Запази", "Save")}</button>
        <span className="text-sm" style={{ color: "var(--muted)", marginLeft: 6 }}>{L("Преглед:", "Preview:")}</span>
        {(["bg", "en"] as const).map((l) => (
          <button key={l} className="btn" onClick={() => switchLang(l)} style={lang === l ? { background: "var(--green-soft)", color: "var(--green-dark)", borderColor: "var(--green-line)" } : {}}>{l === "bg" ? "БГ" : "EN"}</button>
        ))}
        <button className="btn" onClick={translate} disabled={busy === "tr"} title={L("Преведи целия документ BG→EN", "Translate the whole document BG→EN")}>{busy === "tr" ? L("Превеждане…", "Translating…") : "⇄ BG → EN"}</button>
        <button className="btn" onClick={downloadPdf} disabled={busy === "pdf"}>{busy === "pdf" ? "…" : "⬇ PDF"}</button>
        <button className="btn" onClick={saveAsTemplate} disabled={busy === "tmpl"} title={L("Запази този документ като шаблон за повторна употреба за този тип схема", "Save this document as a reusable template for this scheme type")}>{busy === "tmpl" ? "…" : L("★ Запази като шаблон", "★ Save as template")}</button>
        <button className="btn ml-auto" onClick={() => setPanel((p) => !p)}>{panel ? L("Елементи ▸", "Items ▸") : L("Елементи ◂", "Items ◂")}</button>
      </div>

      {/* formatting toolbar */}
      <div className="we-toolbar mb-3">
        {tool("B", L("Получер", "Bold"), () => exec("bold"))}
        {tool("I", L("Курсив", "Italic"), () => exec("italic"))}
        {tool("U", L("Подчертан", "Underline"), () => exec("underline"))}
        <span className="we-sep" />
        {tool("H2", L("Заглавие", "Heading"), () => exec("formatBlock", "h2"))}
        {tool("¶", L("Нормален текст", "Normal text"), () => exec("formatBlock", "p"))}
        <span className="we-sep" />
        {tool(L("•  Списък", "•  List"), L("Списък с водещи символи", "Bullet list"), () => exec("insertUnorderedList"))}
        {tool(L("1.  Списък", "1.  List"), L("Номериран списък", "Numbered list"), () => exec("insertOrderedList"))}
        <span className="we-sep" />
        {tool(L("Изображение", "Image"), L("Вмъкни изображение / лого", "Insert image / logo"), () => fileRef.current?.click())}
        <span className="we-sep" />
        {tool(L("Отмени", "Undo"), L("Отмени", "Undo"), () => exec("undo"))}
        {tool(L("Върни", "Redo"), L("Върни", "Redo"), () => exec("redo"))}
        <span className="text-xs" style={{ marginLeft: "auto", color: "var(--muted)" }}>{L("Редактиране:", "Editing:")} <b style={{ color: "var(--green-dark)" }}>{lang === "bg" ? L("Български", "Bulgarian") : L("Английски", "English")}</b></span>
      </div>

      <div className="we-body">
        <div className="we-col">
          {/* image controls — appear (floating, above the page) when an image is selected */}
          {imgSel && (
            <div className="we-imgbar">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 14, color: "var(--ink)" }}><IconImage /> {L("Изображение", "Image")}</span>
              <span className="text-xs" style={{ color: "var(--muted)" }}>{L("Размер", "Size")}</span>
              <input type="range" min={10} max={100} step={5} value={imgW} onChange={(e) => setImgWidth(parseInt(e.target.value, 10))} />
              <span style={{ fontSize: 13, fontWeight: 700, width: 38 }}>{imgW}%</span>
              {alignPill("left", L("Ляво", "Left"), L("Подравни вляво (текстът обтича отдясно)", "Float left (text wraps right)"))}
              {alignPill("center", L("Център", "Centre"), L("Центрирай", "Centre"))}
              {alignPill("right", L("Дясно", "Right"), L("Подравни вдясно (текстът обтича отляво)", "Float right (text wraps left)"))}
              {alignPill("inline", L("В реда", "Inline"), L("В реда с текста", "Inline with text"))}
              <button className="we-pill danger" onMouseDown={(e) => e.preventDefault()} onClick={removeImg}>{L("✕  Премахни", "✕  Remove")}</button>
              <span className="we-sep" />
              <span className="text-xs" style={{ color: "var(--muted)" }}>{L("Съвет: плъзнете изображението, за да го преместите", "Tip: drag the image to move it")}</span>
            </div>
          )}
          <div
            ref={ref}
            className="we-page"
            contentEditable
            suppressContentEditableWarning
            onInput={() => setSaved(false)}
            onClick={onEditorClick}
          />
        </div>

        {panel && (
          <aside className="we-panel">
            <div className="we-panelhdr">
              <IconItems />
              <span className="ttl">{L("Елементи", "Items")}</span>
              <button className="we-collapse" title={L("Скрий панела", "Hide panel")} onClick={() => setPanel(false)}>▸</button>
            </div>

            <div className="we-seclabel" style={{ margin: "8px 0 4px" }}>{L("АВТО-ПОЛЕТА", "AUTO-FIELDS")}</div>
            {fields.map((f) => itemCard(`f:${f.key}`, f.label, lang === "bg" ? f.bg : f.en))}

            <div className="we-seclabel" style={{ margin: "14px 0 4px" }}>{L("ФРАГМЕНТИ", "SNIPPETS")}</div>
            {snippets.map((s) => itemCard(`s:${s.id}`, s.name, lang === "bg" ? s.bg : s.en))}

            {custom.length > 0 && <div className="we-seclabel" style={{ margin: "14px 0 4px", color: "var(--gold)" }}>{L("МОИ ЕЛЕМЕНТИ", "MY ITEMS")}</div>}
            {custom.map((c) => itemCard(`c:${c.id}`, c.name, lang === "bg" ? c.bg : c.en))}

            <div className="mt-3">
              {adding ? (
                <div className="card p-3" style={{ background: "var(--green-soft)", borderColor: "var(--green-line)" }}>
                  <input placeholder={L("Име на елемента", "Item name")} value={naym} onChange={(e) => setNaym(e.target.value)} style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 7, padding: "7px 9px", fontSize: 13, marginBottom: 6 }} />
                  <textarea placeholder={L("Текст (български)", "Text (Bulgarian)")} value={abg} onChange={(e) => setAbg(e.target.value)} rows={3} style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 7, padding: "7px 9px", fontSize: 13 }} />
                  <button className="btn mt-2" style={{ fontSize: 12, padding: "5px 12px" }} onClick={translateAddForm} disabled={busy === "addtr"}>{busy === "addtr" ? "…" : "⇄ БГ → EN"}</button>
                  <textarea placeholder={L("Текст (английски)", "Text (English)")} value={aen} onChange={(e) => setAen(e.target.value)} rows={3} style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 7, padding: "7px 9px", fontSize: 13, marginTop: 6 }} />
                  <div className="flex gap-2 mt-2">
                    <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={saveOwnItem} disabled={busy === "additem"}>{busy === "additem" ? L("Запазване…", "Saving…") : L("Запази елемента", "Save item")}</button>
                    <button className="btn" style={{ fontSize: 13 }} onClick={() => setAdding(false)}>{L("Отказ", "Cancel")}</button>
                  </div>
                </div>
              ) : (
                <button className="we-addown" onClick={() => setAdding(true)}>{L("＋  Добави собствен елемент", "＋  Add your own item")}</button>
              )}
            </div>

            <p className="text-xs mt-3" style={{ color: "var(--muted)" }}>{L("Кликнете върху елемент, за да го прегледате, след това Вмъкни. Вашите собствени елементи се запазват за всяка схема.", "Click an item to preview it, then Insert. Your own items are saved for every scheme.")}</p>
          </aside>
        )}
      </div>
      <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
        {L(
          "Редактирайте като документ. Брандираната титулна/заглавна страница и шрифтовете се прилагат автоматично в PDF файла, в съответствие с реалните Ви документи.",
          "Edit like a document. The branded cover/head page + fonts are applied automatically in the PDF, matching your real documents.",
        )}
      </p>
    </div>
  );
}

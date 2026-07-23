import type { NextRequest } from "next/server";
import { getScheme, updateScheme } from "@/lib/store";
import { getDoc } from "@/lib/documents";
import { withSkin, stripBodyMarkers, esc } from "@/lib/doc-shell";
import { withFormCtx } from "@/lib/form-fields";
import { docPrintHtml, docDefaultBody } from "@/lib/doc-template";
import { hydrateFormBody, retagFormBody } from "@/lib/form-hydrate";
import { resolveSkinAsync } from "@/skins";
import { requireStaff, requireWriter } from "@/lib/roles";

// The Fill view for a document: renders it with real, editable form controls
// inside a <form>, with a Save bar. POST persists the field values to the scheme
// (scheme.formData[doc]); the preview + PDF then render those saved values.
export const dynamic = "force-dynamic";

const FIELD_ID = /^[A-Za-z0-9_]{1,60}$/;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; doc: string }> }) {
  await requireStaff(); // read/render — any internal role
  const { id, doc } = await ctx.params;
  const scheme = await getScheme(id);
  const def = getDoc(doc);
  if (!scheme || !def?.render) return new Response("Not found", { status: 404 });

  const lang = req.nextUrl.searchParams.get("lang") === "en" ? "en" : "bg";
  const saved = req.nextUrl.searchParams.get("saved") === "1";
  const values = scheme.formData?.[doc] ?? {};
  const skin = await resolveSkinAsync(scheme);

  // WYSIWYG: when the owner has rebuilt this document in the Word editor, the
  // locked Fill view shows THAT body (their edits) — its static form controls
  // re-hydrated into live inputs via the data-ff identity they carry
  // (lib/form-hydrate). Only when nothing was built does it fall back to the
  // auto template rendered directly in fill mode.
  const savedBody = scheme.docs?.[doc]?.[lang] ?? "";
  const composed = !!savedBody.trim();
  // Bodies saved before data-ff existed get their control identity re-attached
  // from the template (retagFormBody) so they hydrate into live inputs too.
  let html = composed
    ? docPrintHtml(
        scheme, doc, lang,
        hydrateFormBody(retagFormBody(savedBody, docDefaultBody(scheme, doc, lang)), values),
        undefined, skin
      )
    : stripBodyMarkers(
        withSkin(skin, () => withFormCtx({ fill: true, values }, () => def.render!(scheme, lang)))
      );

  const action = `/schemes/${encodeURIComponent(id)}/fill/${encodeURIComponent(doc)}?lang=${lang}`;
  const tt = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const docName = esc(lang === "bg" ? def.nameBg : def.nameEn);

  // Light, redesigned fill chrome + A4 "sheet" look (canvas bg, shadow, embroidery
  // attached to the sheet) + real page-break gaps so a form reads like the editor —
  // the cover becomes a distinct title page.
  const css = `<style>
    body{background:#fff;}
    .page{position:relative;background:#fff;margin:24px auto 60px;box-shadow:0 1px 6px rgba(15,30,22,.08);border-radius:4px;}
    /* the sheet geometry + embroidery strip come from DOC_CSS's @media screen
       A4 simulation — no duplicates here so the two can never drift apart */
    .we-gap{position:relative;z-index:2;}
    .we-gap::before{content:"";position:absolute;left:calc(-14mm - 50px - 12px);right:calc(-14mm - 30px - 12px);bottom:0;height:calc(34mm + 24px);background:#fff;}
    .we-gapsep{position:absolute;left:calc(-14mm - 50px - 12px);right:calc(-14mm - 30px - 12px);bottom:16mm;height:24px;background:linear-gradient(#eef1ea,#e3e8dd);display:flex;align-items:center;justify-content:center;}
    .we-gaplabel{font-size:10px;font-weight:700;color:#456b2c;background:#fff;border:1.5px solid #8fa97e;border-radius:999px;padding:1px 12px;}
    .ff-bar{position:sticky;top:0;z-index:60;display:flex;align-items:center;gap:14px;background:#fff;border-bottom:1px solid #e3e3e3;padding:10px 18px;font-family:'Open Sans','Segoe UI',sans-serif;box-shadow:0 1px 8px rgba(15,30,22,.07);}
    .ff-bar a{color:#666;text-decoration:none;font-weight:600;font-size:14px;}
    .ff-bar .t{font-weight:800;font-size:15px;color:#3e3e3e;} .ff-bar .t b{color:#57823c;}
    .ff-bar .ok{background:#eef3ea;color:#456b2c;border:1px solid #cbd9be;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:700;}
    .ff-bar .edit{color:#57823c;border:1px solid #cbd9be;border-radius:8px;padding:6px 12px;font-weight:700;}
    .ff-bar .edit:hover{background:#eef3ea;}
    .ff-bar .pdf{margin-left:auto;background:#fff;color:#456b2c;border:1px solid #cbd9be;border-radius:9px;padding:9px 16px;font-weight:700;font-size:14px;cursor:pointer;}
    .ff-bar .pdf:hover{background:#eef3ea;}
    .ff-bar .save{background:#57823c;color:#fff;border:none;border-radius:9px;padding:9px 22px;font-weight:800;font-size:14px;cursor:pointer;}
    .ff-bar .save:hover{background:#456b2c;}
  </style>`;
  const bar =
    `<div class="ff-bar"><a href="/schemes/${encodeURIComponent(id)}">← ${tt("Назад", "Back")}</a>` +
    `<a class="edit" href="/schemes/${encodeURIComponent(id)}/build/${encodeURIComponent(doc)}">✎ ${tt("Редактирай", "Edit")}</a>` +
    `<span class="t">${tt("Попълване (заключено)", "Fill (locked)")} · <b>${docName}</b></span>` +
    (saved ? `<span class="ok">${tt("Запазено ✓", "Saved ✓")}</span>` : "") +
    `<button class="pdf" type="button" id="ff-pdf">⬇ PDF</button>` +
    `<button class="save" type="submit">${tt("Запази", "Save")}</button></div>`;

  // Progressive-enhancement pagination: the cover gets its own page, then content
  // breaks at A4 boundaries with a "page N/N+1" label. Wrapped in try/catch so the
  // form always works even if measurement fails.
  const pageScript = `<script>(function(){try{
    // Same geometry as the editor: sheet padding includes the 16mm printed top
    // margin (offsets are padding-edge relative), so page 1 ends at 16mm+263mm;
    // each gap = rest of page + 18mm bottom margin + seam + 16mm top margin.
    var LANG=${JSON.stringify(lang)},PXMM=96/25.4,pageH=263*PXMM,MTOP=16*PXMM,gapH=Math.round(34*PXMM)+24;
    var page=document.querySelector('.page'); if(!page) return;
    function mkgap(n){var d=document.createElement('div');d.className='we-gap';var sep=document.createElement('div');sep.className='we-gapsep';var s=document.createElement('span');s.className='we-gaplabel';s.textContent=(LANG==='bg'?'стр. ':'page ')+n+' / '+(n+1);sep.appendChild(s);d.appendChild(sep);return d;}
    function run(){
      var olds=page.querySelectorAll('.we-gap'); for(var i=0;i<olds.length;i++){olds[i].parentNode.removeChild(olds[i]);}
      var pageNum=1, boundary=MTOP+pageH;
      // walk the page's blocks; an owner-built body sits inside a .pts-docbody
      // wrapper (position:relative), so descend into it — keeping the PARENT so
      // its offset is read LIVE (a cover gap inserted before the wrapper shifts
      // it; a stale offset would misplace every later seam).
      var kids=[];
      [].slice.call(page.children).forEach(function(c){
        var cls=String(c.className||'');
        if(cls.indexOf('we-gap')>=0 || getComputedStyle(c).position==='absolute') return;
        if(cls.indexOf('pts-docbody')>=0){
          [].slice.call(c.children).forEach(function(k){
            var kc=String(k.className||'');
            if(kc.indexOf('we-gap')>=0 || getComputedStyle(k).position==='absolute') return;
            kids.push({el:k, parent:c});
          });
        } else kids.push({el:c, parent:null});
      });
      for(var j=0;j<kids.length;j++){
        var el=kids[j].el, base=kids[j].parent?kids[j].parent.offsetTop:0, top=base+el.offsetTop, h=el.offsetHeight;
        if(el.className&&String(el.className).indexOf('cover')>=0){
          var rest=Math.max(0, boundary-(top+h)); var g=mkgap(pageNum); g.style.height=(rest+gapH)+'px';
          if(el.nextSibling) el.parentNode.insertBefore(g, el.nextSibling); else el.parentNode.appendChild(g);
          pageNum++; boundary=(top+h)+(rest+gapH)+pageH; continue;
        }
        if(h>=pageH){ while(boundary<top+h) boundary+=pageH; continue; }
        if(top+h>boundary){ var rem=Math.max(0, boundary-top); var g2=mkgap(pageNum); g2.style.height=(rem+gapH)+'px'; el.parentNode.insertBefore(g2, el); pageNum++; boundary=(kids[j].parent?kids[j].parent.offsetTop:0)+el.offsetTop+pageH; }
      }
      // the surface always ends on a COMPLETE sheet (like the editor): n full A4s + seams
      page.style.minHeight=Math.round(pageNum*297*PXMM+(pageNum-1)*24)+'px';
    }
    setTimeout(run,60); setTimeout(run,450);
    if(document.fonts&&document.fonts.ready)document.fonts.ready.then(run);
    var tmr; page.addEventListener('input',function(){clearTimeout(tmr);tmr=setTimeout(run,400);});
  }catch(e){}})();</script>`;

  // Download the locked/filled form as a PDF (uses the last saved values).
  const dlName = `${id}_${doc}_${lang}.pdf`;
  const pdfScript = `<script>(function(){
    var b=document.getElementById('ff-pdf'); if(!b) return;
    b.addEventListener('click',function(){
      var old=b.textContent, done=function(){b.disabled=false;b.textContent=old;};
      b.disabled=true; b.textContent='…';
      fetch('/api/pdf',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:${JSON.stringify(id)},doc:${JSON.stringify(doc)},lang:${JSON.stringify(lang)},composed:${composed}})})
        .then(function(r){if(!r.ok)throw 0;return r.blob();})
        .then(function(bl){var u=URL.createObjectURL(bl),a=document.createElement('a');a.href=u;a.download=${JSON.stringify(dlName)};document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(u);done();})
        .catch(function(){done();alert('PDF');});
    });
  })();</script>`;

  html = html
    .replace("</head>", `${css}</head>`)
    .replace("<body>", `<body><form method="post" action="${action}">${bar}`)
    .replace("</body>", `${pageScript}${pdfScript}</form></body>`);

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "x-content-type-options": "nosniff" },
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; doc: string }> }) {
  await requireWriter(); // saving filled values is a write — auditor blocked
  const { id, doc } = await ctx.params;
  const scheme = await getScheme(id);
  if (!scheme) return new Response("Not found", { status: 404 });

  const form = await req.formData();
  const values: Record<string, string> = {};
  let count = 0;
  for (const [k, val] of form.entries()) {
    if (++count > 500) break; // bound the payload
    if (!FIELD_ID.test(k)) continue; // only our field ids
    values[k] = String(val).slice(0, 5000);
  }
  // full replace for this doc so unchecked boxes clear correctly
  await updateScheme(id, { formData: { ...(scheme.formData ?? {}), [doc]: values } });

  const lang = req.nextUrl.searchParams.get("lang") === "en" ? "en" : "bg";
  return new Response(null, {
    status: 303,
    headers: { Location: `/schemes/${encodeURIComponent(id)}/fill/${encodeURIComponent(doc)}?lang=${lang}&saved=1` },
  });
}

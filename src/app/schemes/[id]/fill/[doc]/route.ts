import type { NextRequest } from "next/server";
import { getScheme, updateScheme } from "@/lib/store";
import { getDoc } from "@/lib/documents";
import { withSkin, stripBodyMarkers, esc } from "@/lib/doc-shell";
import { withFormCtx } from "@/lib/form-fields";
import { resolveSkinAsync } from "@/skins";
import { requireOwner } from "@/lib/auth";

// The Fill view for a document: renders it with real, editable form controls
// inside a <form>, with a Save bar. POST persists the field values to the scheme
// (scheme.formData[doc]); the preview + PDF then render those saved values.
export const dynamic = "force-dynamic";

const FIELD_ID = /^[A-Za-z0-9_]{1,60}$/;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; doc: string }> }) {
  await requireOwner();
  const { id, doc } = await ctx.params;
  const scheme = await getScheme(id);
  const def = getDoc(doc);
  if (!scheme || !def?.render) return new Response("Not found", { status: 404 });

  const lang = req.nextUrl.searchParams.get("lang") === "en" ? "en" : "bg";
  const saved = req.nextUrl.searchParams.get("saved") === "1";
  const values = scheme.formData?.[doc] ?? {};
  const skin = await resolveSkinAsync(scheme);

  let html = stripBodyMarkers(
    withSkin(skin, () => withFormCtx({ fill: true, values }, () => def.render!(scheme, lang)))
  );

  const action = `/schemes/${encodeURIComponent(id)}/fill/${encodeURIComponent(doc)}?lang=${lang}`;
  const tt = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const docName = esc(lang === "bg" ? def.nameBg : def.nameEn);

  // Light, redesigned fill chrome + A4 "sheet" look (canvas bg, shadow, embroidery
  // attached to the sheet) + real page-break gaps so a form reads like the editor —
  // the cover becomes a distinct title page.
  const css = `<style>
    body{background:#f1f1ee;}
    .page{position:relative;margin:24px auto 60px;box-shadow:0 10px 30px rgba(15,30,22,.14);border-radius:4px;}
    .doc-side{display:none;}
    .page::before{content:"";position:absolute;top:0;bottom:0;left:0;width:8mm;background:url(/brand/embroidery-side.png) top center/100% auto repeat-y;border-radius:4px 0 0 4px;z-index:0;pointer-events:none;}
    .we-gap{position:relative;z-index:2;}
    .we-gapsep{position:absolute;left:-50px;right:-30px;bottom:0;height:18px;background:#f1f1ee;display:flex;align-items:center;justify-content:center;}
    .we-gaplabel{font-size:10px;font-weight:700;color:#456b2c;background:#fff;border:1.5px solid #8fa97e;border-radius:999px;padding:1px 12px;}
    .ff-bar{position:sticky;top:0;z-index:60;display:flex;align-items:center;gap:14px;background:#fff;border-bottom:1px solid #e3e3e3;padding:10px 18px;font-family:'Open Sans','Segoe UI',sans-serif;box-shadow:0 1px 8px rgba(15,30,22,.07);}
    .ff-bar a{color:#666;text-decoration:none;font-weight:600;font-size:14px;}
    .ff-bar .t{font-weight:800;font-size:15px;color:#3e3e3e;} .ff-bar .t b{color:#57823c;}
    .ff-bar .ok{background:#eef3ea;color:#456b2c;border:1px solid #cbd9be;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:700;}
    .ff-bar .save{margin-left:auto;background:#57823c;color:#fff;border:none;border-radius:9px;padding:9px 22px;font-weight:800;font-size:14px;cursor:pointer;}
    .ff-bar .save:hover{background:#456b2c;}
  </style>`;
  const bar =
    `<div class="ff-bar"><a href="/schemes/${encodeURIComponent(id)}">← ${tt("Назад", "Back")}</a>` +
    `<span class="t">${tt("Попълване", "Fill")} · <b>${docName}</b></span>` +
    (saved ? `<span class="ok">${tt("Запазено ✓", "Saved ✓")}</span>` : "") +
    `<button class="save" type="submit">${tt("Запази", "Save")}</button></div>`;

  // Progressive-enhancement pagination: the cover gets its own page, then content
  // breaks at A4 boundaries with a "page N/N+1" label. Wrapped in try/catch so the
  // form always works even if measurement fails.
  const pageScript = `<script>(function(){try{
    var LANG=${JSON.stringify(lang)},PXMM=96/25.4,pageH=263*PXMM,gapH=18;
    var page=document.querySelector('.page'); if(!page) return;
    function mkgap(n){var d=document.createElement('div');d.className='we-gap';var sep=document.createElement('div');sep.className='we-gapsep';var s=document.createElement('span');s.className='we-gaplabel';s.textContent=(LANG==='bg'?'стр. ':'page ')+n+' / '+(n+1);sep.appendChild(s);d.appendChild(sep);return d;}
    function run(){
      var olds=page.querySelectorAll('.we-gap'); for(var i=0;i<olds.length;i++){olds[i].parentNode.removeChild(olds[i]);}
      var pageNum=1, boundary=pageH;
      var kids=[].slice.call(page.children).filter(function(c){return !(c.className&&String(c.className).indexOf('we-gap')>=0) && getComputedStyle(c).position!=='absolute';});
      for(var j=0;j<kids.length;j++){
        var el=kids[j], top=el.offsetTop, h=el.offsetHeight;
        if(el.className&&String(el.className).indexOf('cover')>=0){
          var rest=Math.max(0, boundary-(top+h)); var g=mkgap(pageNum); g.style.height=(rest+gapH)+'px';
          if(el.nextSibling) page.insertBefore(g, el.nextSibling); else page.appendChild(g);
          pageNum++; boundary=(top+h)+(rest+gapH)+pageH; continue;
        }
        if(h>=pageH){ boundary=top+Math.ceil(h/pageH)*pageH; continue; }
        if(top+h>boundary){ var rem=Math.max(0, boundary-top); var g2=mkgap(pageNum); g2.style.height=(rem+gapH)+'px'; page.insertBefore(g2, el); pageNum++; boundary=el.offsetTop+pageH; }
      }
    }
    setTimeout(run,60); setTimeout(run,450);
    if(document.fonts&&document.fonts.ready)document.fonts.ready.then(run);
    var tmr; page.addEventListener('input',function(){clearTimeout(tmr);tmr=setTimeout(run,400);});
  }catch(e){}})();</script>`;

  html = html
    .replace("</head>", `${css}</head>`)
    .replace("<body>", `<body><form method="post" action="${action}">${bar}`)
    .replace("</body>", `${pageScript}</form></body>`);

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "x-content-type-options": "nosniff" },
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; doc: string }> }) {
  await requireOwner();
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

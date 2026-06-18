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
  const barCss =
    `<style>.ff-bar{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:14px;background:#2b6744;color:#fff;` +
    `padding:10px 18px;font-family:'Sofia Sans Condensed','Segoe UI',sans-serif;box-shadow:0 1px 6px rgba(0,0,0,.15);}` +
    `.ff-bar a{color:#fff;text-decoration:none;font-weight:600;font-size:14px;}.ff-bar .t{font-weight:800;font-size:15px;}` +
    `.ff-bar .ok{background:rgba(255,255,255,.2);border-radius:999px;padding:3px 10px;font-size:12px;font-weight:700;}` +
    `.ff-bar .save{margin-left:auto;background:#fff;color:#2b6744;border:none;border-radius:9px;padding:9px 20px;font-weight:800;font-size:14px;cursor:pointer;}</style>`;
  const bar =
    `<div class="ff-bar"><a href="/schemes/${encodeURIComponent(id)}">← Back</a>` +
    `<span class="t">Fill · ${esc(def.nameEn)}</span>` +
    (saved ? `<span class="ok">Saved ✓</span>` : "") +
    `<button class="save" type="submit">Save</button></div>`;

  html = html
    .replace("</head>", `${barCss}</head>`)
    .replace("<body>", `<body><form method="post" action="${action}">${bar}`)
    .replace("</body>", `</form></body>`);

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

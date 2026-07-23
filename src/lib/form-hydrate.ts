// Re-attaches the fillable-form machinery to a SAVED, owner-edited document body.
//
// Static form controls emitted by lib/form-fields carry their identity as
// data-ff="<kind>:<id>[:<extra>]" (kinds: c=checkbox, r=radio, s=rating scale,
// t=text blank, l=writing lines). That attribute survives the Word editor's
// save/sanitize round-trip, so an edited body is still a live form:
//   • hydrateFormBody — static controls → real inputs (the Fill view), initial
//     state from scheme.formData when the field was ever fill-saved, else the
//     state baked into the edited HTML;
//   • drawFormBody   — redraw the static state from newer formData values (the
//     print/preview of an edited body after a fill-save). Fields the fill never
//     touched keep whatever the owner set in the editor.
//
// Pure string ops (no DOM), same trust boundary as lib/sanitize-html: the input
// is user-authored HTML, so ids/values are validated before they become input
// names, and everything interpolated into markup is escaped here.

const FIELD_ID = /^[A-Za-z0-9_]{1,60}$/; // same rule the fill POST accepts
const FIELD_VAL = /^[A-Za-z0-9_.-]{0,60}$/; // radio option / rating point / row count

const escText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s: string) => escText(s).replace(/"/g, "&quot;");
const decode = (s: string) =>
  s
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

interface FfNode {
  start: number; // index of "<"
  end: number; // index just past the matching close tag
  tag: string;
  attrs: string; // the opening tag's attribute text
  inner: string;
  kind: string;
  id: string;
  extra: string; // radio value / rating point / rows
}

// End index just past the close tag matching the open tag that ends at `from`.
// Counts nested same-name tags so an edited inner (e.g. spans inside spans) is fine.
function balancedEnd(html: string, tag: string, from: number): number {
  const re = new RegExp(`<${tag}\\b[^>]*>|</${tag}\\s*>`, "gi");
  re.lastIndex = from;
  let depth = 1;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0][1] === "/" ? -1 : 1;
    if (depth === 0) return m.index + m[0].length;
  }
  return -1;
}

const OPEN = /<(span|div)\b([^>]*\bdata-ff="([^"]*)"[^>]*)>/gi;

// Walk the body once, calling `fn` per valid data-ff control; a non-null return
// replaces the whole element. Nodes with malformed metadata are left untouched.
function transform(html: string, fn: (n: FfNode) => string | null): string {
  let out = "";
  let pos = 0;
  OPEN.lastIndex = 0;
  for (let m = OPEN.exec(html); m; m = OPEN.exec(html)) {
    if (m.index < pos) continue; // inside an element we already replaced/emitted
    const [kind = "", id = "", extra = ""] = m[3].split(":");
    const end = balancedEnd(html, m[1], m.index + m[0].length);
    if (end < 0 || !FIELD_ID.test(id) || !FIELD_VAL.test(extra)) continue;
    const node: FfNode = {
      start: m.index, end, tag: m[1], attrs: m[2],
      inner: html.slice(m.index + m[0].length, html.lastIndexOf("<", end - 1)),
      kind, id, extra,
    };
    const repl = fn(node);
    if (repl === null) continue;
    out += html.slice(pos, node.start) + repl;
    pos = node.end;
    OPEN.lastIndex = node.end;
  }
  return out + html.slice(pos);
}

const attr = (attrs: string, name: string): string => {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs);
  return m ? m[1] : "";
};
const hasOn = (attrs: string) => /(?:^|\s)on(?:\s|$)/.test(attr(attrs, "class"));
const has = (values: Record<string, string>, id: string) =>
  Object.prototype.hasOwnProperty.call(values, id);

// The texts of the ff-lrow rows inside an ff-lines container (trailing blanks dropped).
function rowTexts(inner: string): string[] {
  const rows: string[] = [];
  const re = /<div\b[^>]*class="[^"]*ff-lrow[^"]*"[^>]*>/gi;
  for (let m = re.exec(inner); m; m = re.exec(inner)) {
    const end = balancedEnd(inner, "div", m.index + m[0].length);
    if (end < 0) break;
    rows.push(decode(inner.slice(m.index + m[0].length, inner.lastIndexOf("<", end - 1))).trim());
    re.lastIndex = end;
  }
  while (rows.length && rows[rows.length - 1] === "") rows.pop();
  return rows;
}

// Static controls → live inputs for the Fill view. Each checkbox / radio / rating
// group gets a hidden "" companion before its first input so clearing a choice on
// the next save actually clears it (the POST does a full replace per document).
export function hydrateFormBody(html: string, values: Record<string, string>): string {
  const seeded = new Set<string>();
  const hidden = (id: string) =>
    seeded.has(id) ? "" : (seeded.add(id), `<input type="hidden" name="${id}" value="">`);

  return transform(html, (n) => {
    const saved = has(values, n.id);
    switch (n.kind) {
      case "c": {
        const on = saved ? values[n.id] === "1" : hasOn(n.attrs);
        return `${hidden(n.id)}<input class="ff-cb" type="checkbox" name="${n.id}" value="1"${on ? " checked" : ""}>`;
      }
      case "r": {
        const on = saved ? values[n.id] === n.extra : hasOn(n.attrs);
        return `${hidden(n.id)}<input class="ff-rb-in" type="radio" name="${n.id}" value="${escAttr(n.extra)}"${on ? " checked" : ""}>`;
      }
      case "s": {
        const on = saved ? values[n.id] === n.extra : hasOn(n.attrs);
        return `${hidden(n.id)}<input class="ff-rate-in" type="radio" name="${n.id}" value="${escAttr(n.extra)}"${on ? " checked" : ""}>`;
      }
      case "t": {
        const val = saved ? values[n.id] : decode(n.inner).trim();
        const style = attr(n.attrs, "style");
        return `<input class="ff-line" type="text" name="${n.id}" value="${escAttr(val)}"${style ? ` style="${escAttr(style)}"` : ""}>`;
      }
      case "l": {
        const val = saved ? values[n.id] : rowTexts(n.inner).join("\n");
        const rows = Math.max(1, parseInt(n.extra, 10) || 3);
        return `<textarea class="ff-area" name="${n.id}" rows="${rows}">${escText(val)}</textarea>`;
      }
      default:
        return null;
    }
  });
}

// Redraw the static state of an edited body from the saved values (print/preview
// after a fill-save). Only fields PRESENT in `values` are touched — everything the
// fill never saved keeps the state the owner baked in with the editor.
export function drawFormBody(html: string, values: Record<string, string>): string {
  return transform(html, (n) => {
    if (!has(values, n.id)) return null;
    const cls = attr(n.attrs, "class").split(/\s+/).filter((c) => c && c !== "on");
    const style = attr(n.attrs, "style");
    const rebuild = (on: boolean, mark: string) =>
      `<${n.tag} class="${escAttr(cls.concat(on ? ["on"] : []).join(" "))}" data-ff="${n.kind}:${n.id}${n.extra ? `:${escAttr(n.extra)}` : ""}"${style ? ` style="${escAttr(style)}"` : ""}>${on ? mark : ""}</${n.tag}>`;
    switch (n.kind) {
      case "c":
        return rebuild(values[n.id] === "1", "✓");
      case "r":
        return rebuild(values[n.id] === n.extra, cls.includes("ff-rb") ? "●" : "✓");
      case "s":
        return rebuild(values[n.id] === n.extra, "");
      case "t": {
        const val = values[n.id];
        return `<span class="ff-line"${val ? "" : ' data-empty="1"'} data-ff="t:${n.id}"${style ? ` style="${escAttr(style)}"` : ""}>${escText(val)}</span>`;
      }
      case "l": {
        const lines = values[n.id] ? escText(values[n.id]).split("\n") : [];
        const rows = Math.max(1, parseInt(n.extra, 10) || 3);
        const out: string[] = [];
        for (let i = 0; i < Math.max(rows, lines.length); i++) out.push(`<div class="ff-lrow">${lines[i] ?? ""}</div>`);
        return `<div class="ff-lines" data-ff="l:${n.id}:${rows}">${out.join("")}</div>`;
      }
      default:
        return null;
    }
  });
}

// Does this body carry any re-hydratable form controls at all? (Old documents
// saved before data-ff existed render as-is in the Fill view — locked, no inputs.)
export function hasFormFields(html: string): boolean {
  OPEN.lastIndex = 0;
  return OPEN.test(html);
}

// ── Legacy bodies: re-attach identity ────────────────────────────────────────
// Documents edited & saved BEFORE data-ff existed carry bare ff-* markup, so the
// Fill view has nothing to hydrate ("I can't interact while it's locked").
// retagFormBody() matches the saved body's untagged controls against the CURRENT
// template's tagged ones — positionally, per control shape (markers = ff-box/
// ff-rb/ff-rate, text blanks = ff-line, line areas = ff-lines) — and stamps the
// template's data-ff onto them. Deterministic and idempotent, so applying it on
// the fly (fill view, print) and persistently (editor load → next save) agree.
// Controls the owner added beyond the template stay untagged (inert), and tokens
// already present in the saved body are never assigned twice.

type FfCat = "marker" | "line" | "area";
const catOf = (cls: string): FfCat | null =>
  /(?:^|\s)ff-(?:box|rb|rate)(?:\s|$)/.test(cls) ? "marker"
  : /(?:^|\s)ff-line(?:\s|$)/.test(cls) ? "line"
  : /(?:^|\s)ff-lines(?:\s|$)/.test(cls) ? "area"
  : null;

const ANY_FF_TAG = /<(?:span|div)\b[^>]*>/g;

export function retagFormBody(html: string, template: string): string {
  if (!html || !template) return html;

  // The template's tokens in document order, per category; skip any the saved
  // body already carries (mixed old/new bodies after partial re-editing).
  const used = new Set<string>();
  for (const m of html.matchAll(/\bdata-ff="([^"]+)"/g)) used.add(m[1]);
  const queue: Record<FfCat, string[]> = { marker: [], line: [], area: [] };
  for (const m of template.matchAll(ANY_FF_TAG)) {
    const tok = attr(m[0], "data-ff");
    if (!tok || used.has(tok)) continue;
    const cat = catOf(attr(m[0], "class"));
    if (cat) queue[cat].push(tok);
  }

  // Stamp untagged controls in document order from their category's queue.
  let out = "";
  let pos = 0;
  ANY_FF_TAG.lastIndex = 0;
  for (let m = ANY_FF_TAG.exec(html); m; m = ANY_FF_TAG.exec(html)) {
    const tag = m[0];
    if (attr(tag, "data-ff")) continue;
    const cat = catOf(attr(tag, "class"));
    if (!cat) continue;
    const tok = queue[cat].shift();
    if (!tok) continue;
    out += html.slice(pos, m.index) + tag.slice(0, -1) + ` data-ff="${escAttr(tok)}">`;
    pos = m.index + tag.length;
  }
  return out + html.slice(pos);
}

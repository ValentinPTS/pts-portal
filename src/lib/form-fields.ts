import { AsyncLocalStorage } from "node:async_hooks";
import { esc } from "./doc-css";

// ─────────────────────────────────────────────────────────────────────────────
// Fillable document form fields.
//
// Document renderers emit form controls (checkbox / radio / rating / text /
// lines / select) through these helpers instead of static markup. A render
// CONTEXT decides how each control renders:
//   • fill mode  → a real <input>/<textarea>/<select> (used by the Fill view), and
//   • static     → the SAVED value drawn into the document (preview + PDF).
// Values are owner-filled and stored per scheme (scheme.formData[docKey][fieldId]).
//
// Server-only (node:async_hooks), like the skin context. The value semantics:
//   checkbox → "1" when ticked; radio/select → the chosen option value;
//   text/lines → the string; rating → "1".."5".
// ─────────────────────────────────────────────────────────────────────────────

export interface FormCtx {
  fill: boolean; // true on the Fill view (real inputs); false everywhere else
  values: Record<string, string>; // saved values for the current document
}
const ctx = new AsyncLocalStorage<FormCtx>();
export function withFormCtx<T>(c: FormCtx, fn: () => T): T {
  return ctx.run(c, fn);
}
function cur(): FormCtx {
  return ctx.getStore() ?? { fill: false, values: {} };
}
const a = (id: string) => esc(id).replace(/"/g, "");
const v = (id: string) => cur().values[id] ?? "";

// Single checkbox (independent boolean). `label` is trusted HTML built by the renderer.
export function fCheck(id: string, label: string): string {
  const on = v(id) === "1";
  if (cur().fill) {
    return `<label class="ff-opt"><input class="ff-cb" type="checkbox" name="${a(id)}" value="1"${on ? " checked" : ""}><span>${label}</span></label>`;
  }
  return `<span class="ff-opt"><span class="ff-box${on ? " on" : ""}">${on ? "✓" : ""}</span><span>${label}</span></span>`;
}

// Radio group (one choice). options = [value, labelHtml][]. `round` → circular markers.
export function fRadio(id: string, options: [string, string][], round = false): string {
  const sel = v(id);
  const mark = round ? "ff-rb" : "ff-box";
  return options
    .map(([val, label]) => {
      const on = sel === val;
      if (cur().fill) {
        return `<label class="ff-opt"><input class="ff-rb-in" type="radio" name="${a(id)}" value="${a(val)}"${on ? " checked" : ""}><span>${label}</span></label>`;
      }
      return `<span class="ff-opt"><span class="${mark}${on ? " on" : ""}">${on ? (round ? "●" : "✓") : ""}</span><span>${label}</span></span>`;
    })
    .join("");
}

// 1..5 rating scale (single choice), drawn as numbered circles.
export function fRating(id: string, lowLabel = "", highLabel = ""): string {
  const sel = v(id);
  const fill = cur().fill;
  const pts = [1, 2, 3, 4, 5]
    .map((n) => {
      const on = sel === String(n);
      const dot = fill
        ? `<input class="ff-rate-in" type="radio" name="${a(id)}" value="${n}"${on ? " checked" : ""}>`
        : `<span class="ff-rate${on ? " on" : ""}"></span>`;
      return `<span class="ff-pt"><span class="ff-pn">${n}</span>${dot}</span>`;
    })
    .join("");
  return `<span class="ff-scale">${lowLabel ? `<span class="ff-end">${lowLabel}</span>` : ""}${pts}${highLabel ? `<span class="ff-end">${highLabel}</span>` : ""}</span>`;
}

// Inline text blank (underlined). minWidth in px.
export function fText(id: string, minWidth = 220): string {
  const val = v(id);
  if (cur().fill) {
    return `<input class="ff-line" type="text" name="${a(id)}" value="${esc(val)}" style="min-width:${minWidth}px">`;
  }
  return `<span class="ff-line"${val ? "" : ' data-empty="1"'} style="min-width:${minWidth}px">${esc(val)}</span>`;
}

// Multi-line free text (rows of writing lines).
export function fLines(id: string, rows = 3): string {
  const val = v(id);
  if (cur().fill) {
    return `<textarea class="ff-area" name="${a(id)}" rows="${rows}">${esc(val)}</textarea>`;
  }
  const filled = esc(val).split("\n");
  const out: string[] = [];
  for (let i = 0; i < Math.max(rows, filled.length); i++) out.push(`<div class="ff-lrow">${filled[i] ?? ""}</div>`);
  return `<div class="ff-lines">${out.join("")}</div>`;
}

// Dropdown / pill select. options = [value, labelHtml][].
export function fSelect(id: string, options: [string, string][]): string {
  const sel = v(id);
  if (cur().fill) {
    const opts = `<option value=""></option>` + options.map(([val, label]) => `<option value="${a(val)}"${sel === val ? " selected" : ""}>${label}</option>`).join("");
    return `<select class="ff-select" name="${a(id)}">${opts}</select>`;
  }
  const chosen = options.find(([val]) => val === sel);
  return `<span class="ff-selbox${chosen ? " on" : ""}">${chosen ? chosen[1] : "&nbsp;"}</span>`;
}

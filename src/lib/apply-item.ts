import type { Lang, Scheme } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// The заявка wizard's step-3 items.
//
// Testing schemes: one item per standard (scheme.parameters) — counts are keyed
// by parameter index in Application.selections.
//
// Calibration schemes have NO standards: the participation item is the DEVICE
// (scheme.calibration — device, measured quantity, points). Its count is stored
// under the reserved non-numeric key "cal", which by design:
//   • sums into `participations` on approval (Object.values reduce),
//   • yields NO characteristic indexes (parseInt("cal") is NaN → filtered), so
//     the participant follows the "no explicit characteristics" convention, and
//   • is ignored by the T-scheme index remap (non-integer keys are dropped
//     only when a remap runs, which never happens for C — standards are hidden).
//
// Legacy fallback: older C schemes were made applyable by cramming the device
// text into a fake parameter row. Those keep working — the calibration item is
// used only when the calibration block actually carries a device/quantity.
// ─────────────────────────────────────────────────────────────────────────────

export const CAL_SELECTION_KEY = "cal";

// Does this scheme's заявка run on the calibration item (not on parameters)?
export function usesCalApplyItem(s: Scheme): boolean {
  const c = s.calibration;
  return s.type === "C" && !!c && !!(c.deviceBg || c.deviceEn || c.quantityBg || c.quantityEn);
}

// The single step-3 item for a calibration scheme, in the viewer's language.
export function calApplyItem(s: Scheme, lang: Lang): { standard: string; characteristic: string } | null {
  if (!usesCalApplyItem(s)) return null;
  const c = s.calibration!;
  const device = (lang === "bg" ? c.deviceBg : c.deviceEn) || c.deviceBg || c.deviceEn;
  const quantity = (lang === "bg" ? c.quantityBg : c.quantityEn) || c.quantityBg || c.quantityEn;
  const pts = c.points.filter(Boolean).join(` ${c.unit}, `);
  return {
    standard: device,
    characteristic: quantity + (pts ? ` (${pts} ${c.unit})` : ""),
  };
}

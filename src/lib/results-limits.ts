// The dates a participation's results are held against (plan parts 6.3, 6.4) — one place, so the
// form's «Провери» and the submission check the same:
//   testing — from the participation's first shipment (else the planned dispatch, a working date)
//             to the results deadline in force (its extension included) — under PTS's unlock after
//             it (6.4; Реш. 111), to the unlock's last day: a lab let in late may have tested late;
//   calibration — each of the laboratory's windows with the device (from each arrival to its
//             window's end, an extension included; a chain visiting it twice gives two). The
//             holiday calendar not read: no upper limit, never an empty calendar's early one.

import type { Scheme } from "./types";
import { resultsDeadline, chainWindow } from "./deadlines-model";
import { holidaySet } from "./holidays";

const sofiaDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sofia", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

export function testPeriodLimits(s: Pick<Scheme, "dates" | "extensions" | "deliveries">, participantId: string, code: string, unlock?: { until: string } | null): { from?: string; to?: string } {
  const deadline = resultsDeadline(s, code).at;
  const shipped = (s.deliveries?.[participantId]?.shipments ?? []).map((x) => x.day).filter(Boolean).sort()[0];
  const due = deadline ? deadline.slice(0, 10) : undefined;
  const to = due && unlock?.until && unlock.until > due ? unlock.until : due;
  return { from: shipped ?? s.dates?.dispatch?.slice(0, 10), to };
}

export async function calibrationWindows(s: Pick<Scheme, "chain" | "extensions">, code: string): Promise<{ from?: string; to?: string }[]> {
  const mine = (s.chain?.stops ?? []).filter((x) => x.kind === "lab" && x.code === code && !!x.receivedAt);
  if (!mine.length) return [];
  let off: Set<string> | null = null;
  try { off = await holidaySet(); } catch { off = null; }
  return mine.map((st) => { const w = off ? chainWindow(s, st, off) : null; return w ? { from: w.received, to: w.due.slice(0, 10) } : { from: st.receivedAt ? sofiaDay(st.receivedAt) : undefined }; });
}

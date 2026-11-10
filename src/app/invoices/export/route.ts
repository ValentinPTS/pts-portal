import type { NextRequest } from "next/server";
import { mayNow } from "@/lib/access";
import { getScheme } from "@/lib/store";
import { listParticipants, withIdentities } from "@/lib/participants";
import { openParticipationSnapshots, inForce } from "@/lib/participation-snapshots";
import { inFinalRound, currentFinalList } from "@/lib/announcement-model";
import { objectsNeeded } from "@/lib/application-model";
import { isStarted } from "@/lib/visibility";
import { characteristicLabel } from "@/lib/characteristics-model";
import { actorNow } from "@/lib/identities";
import { csv } from "@/lib/round-export";
import { billingRow, characteristicsText, byEntry, billedSelections, BILLING_COLUMNS } from "@/lib/invoice-model";
import { logActivity } from "@/lib/activity";
import { priceText } from "@/lib/price-model";
import { schemePrices } from "@/lib/scheme-prices";
import { waitingOf } from "@/lib/waitlist-model";
import { schemeNowMs } from "@/lib/clock";

// «Справка за фактуриране» (plan part 5.8; Реш. 98): the export for accounting — the
// accountant has no sign-in. One row per participation going on, in the order they were
// entered: the legal entity (from the participation's copy in force, 4.5 — else its own
// fields), ЕИК, VAT, the characteristics applied for, the objects, the proforma's and the
// invoice's numbers and dates, the payment; the price (9.4, Реш. 153) once the applications closed. It names who is
// behind each code: only to who works with the participants in THIS scheme and sees names
// there; ONE opening of the identity store for the export, on record (2.3); journalled.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("scheme") ?? "";
  if (!(await mayNow("participants.manage", id))) return new Response("Forbidden", { status: 403 });
  if (!(await mayNow("names.view", id))) return new Response("Forbidden", { status: 403 });
  const s = await getScheme(id);
  if (!s) return new Response("Not found", { status: 404 });
  // a draft bills nobody; a scheme that is not held invoices nothing (О9, Реш. 129) — before
  // anything is opened (review)
  if (!isStarted(s) || s.status === "not_held") return new Response("Nothing to bill: the scheme is not started, or not held.", { status: 409 });
  // in the order of entry — a second participation of a laboratory is billed at its share
  // (M1 §5); the database lists by code, which is random (review)
  const coded = byEntry((await listParticipants(id)).filter((p) => inFinalRound(s, p)));
  // the characteristics that RUN: after the second announcement, the final list's (5.2) —
  // what coding draws the objects by, never what was applied for and dropped (review)
  const final = currentFinalList(s);
  const n = s.parameters.length;
  const who = { actor: await actorNow(), purpose: "export" as const };
  // the copies in force (the legal entity, its laboratory — 4.5); the identity store opened
  // only for a participation without one (from before 4.5). A failed opening is an error,
  // never a file with blank names sent to accounting (review)
  let snaps: Map<string, Awaited<ReturnType<typeof openParticipationSnapshots>>[number]>;
  let own: Map<string, { labName?: string; country?: string }>;
  try {
    snaps = inForce(await openParticipationSnapshots(who, id));
    const without = coded.filter((p) => !snaps.has(p.id));
    own = new Map((await withIdentities(without, id, who)).map((x) => [x.id, x]));
  } catch {
    return new Response("The names could not be read — nothing exported. Try again.", { status: 500 });
  }
  const labels = s.parameters.map((p) => characteristicLabel(p, "bg"));
  // the prices (9.4, Реш. 153) — one reading with «Фактури» (lib/scheme-prices): a preview after the
  // applications close, fixed at the second announcement; the groups from the copies
  const priced = schemePrices(s, await listParticipants(id), snaps, schemeNowMs(s));
  const prices = priced.prices;
  const waitingIds = new Set(waitingOf(s, await listParticipants(id)));
  const notYet = priced.state === "not-ready" ? "след срока за заявки (Реш. 153)" : priced.state === "not-held" ? "схемата не се провежда" : "";
  const rows = coded.map((p, i) => {
    const snap = snaps.get(p.id);
    const mine = own.get(p.id);
    const sel = n ? billedSelections(p, final?.runs, n) : {};
    const lab = s.labDocs?.[p.code];
    return billingRow({
      order: i + 1,
      code: p.code,
      characteristics: n ? characteristicsText(sel, labels) : `${s.calibration?.quantityBg ?? ""}`.trim(),
      objects: objectsNeeded(sel, s.type),
      // the legal entity only from the copy in force; without one, the laboratory as entered
      // and its country — never a laboratory's name under «Юридическо лице» (review)
      entity: snap
        ? { name: snap.entity.name, eik: snap.entity.eik, vat: snap.entity.vat, country: snap.entity.country, correspondenceAddress: snap.entity.correspondenceAddress, mol: snap.mol, officialEmail: snap.officialEmail }
        : mine ? { name: "", eik: "", vat: "", country: mine.country ?? "", correspondenceAddress: "" } : undefined,
      laboratory: snap?.laboratory.name ?? mine?.labName ?? "",
      proforma: lab?.proforma ? { number: lab.proforma.number, at: lab.proforma.uploadedAt } : undefined,
      invoice: lab?.invoice ? { number: lab.invoice.number, at: lab.invoice.uploadedAt } : undefined,
      paidAt: s.paidAt?.[p.code],
      // a plain amount with a point (the accountant's spreadsheet), and how it was computed
      price: prices.get(p.id) ? { total: prices.get(p.id)!.totalCents === null ? "" : (prices.get(p.id)!.totalCents! / 100).toFixed(2), how: `${priceText(prices.get(p.id)!, "bg")}${priced.state === "preview" ? " (предварително — фиксира се при второто обявяване)" : prices.get(p.id)!.later ? " (след фиксирането — спрямо групата)" : ""}` } : { total: "", how: notYet || (waitingIds.has(p.id) ? "в списъка на изчакващите" : "") },
    });
  });
  await logActivity("names.viewed", { schemeId: id, subject: "export:billing", summary: `Laboratory names shown with their codes — the billing export (${rows.length} rows)` });
  await logActivity("file.downloaded", { schemeId: id, subject: "export:billing", summary: `Billing export for accounting (${rows.length} rows)` });
  // csv() opens with the byte-order mark Excel needs for the Cyrillic — one, never two (review)
  const body = csv([...BILLING_COLUMNS], rows);
  const file = `billing-${s.number.replace(/[^0-9A-Za-z]+/g, "-").replace(/^-|-$/g, "") || "scheme"}.csv`;
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${file}"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

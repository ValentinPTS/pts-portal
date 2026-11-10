import Link from "next/link";
import { requireSection, getViewer, schemesFor, mayNow } from "@/lib/access";
import { priceText } from "@/lib/price-model";
import { schemePrices } from "@/lib/scheme-prices";
import { fmtEur } from "@/lib/commercial-model";
import { openParticipationSnapshots, inForce } from "@/lib/participation-snapshots";
import { actorNow } from "@/lib/identities";
import { schemeNowMs } from "@/lib/clock";
import { listSchemes } from "@/lib/store";
import { listParticipants } from "@/lib/participants";
import { inFinalRound } from "@/lib/announcement-model";
import { isProvisional } from "@/lib/coding-model";
import { isStarted } from "@/lib/visibility";
import { fmtSchemeDate } from "@/lib/scheme-dates";
import { getServerT } from "@/lib/i18n-server";

// «Фактури» (plan part 5.8; spec Q2 — Реш. 35, 36, 98, 106): per started scheme this person
// works with the participants in (capability «participants.manage»), each participation going
// on, by its code — the proforma's number and date, paid or not, the original invoice's
// number and date — and «Справка за фактуриране», the export for accounting (the accountant
// has no sign-in; with the prices of 9.4). Uploading is on each participation's page. Codes and
// numbers only here — the names are in the export alone; the prices (grouped by ЕИК) to who sees names.
export const dynamic = "force-dynamic";

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ scheme?: string }> }) {
  await requireSection("invoices");
  const sp = await searchParams;
  const { lang } = await getServerT();
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const scope = schemesFor(await getViewer(), "participants.manage");
  const schemes = (await listSchemes()).filter((s) => isStarted(s) && (scope === "all" || scope.includes(s.id)));
  const chosen = schemes.find((s) => s.id === sp.scheme) ?? schemes.find((s) => s.status === "running") ?? schemes[0];
  const parts = chosen ? (await listParticipants(chosen.id)).filter((p) => inFinalRound(chosen, p)) : [];
  const day = (iso?: string) => (iso ? fmtSchemeDate(iso.slice(0, 10)) : "");
  // the prices (9.4, Реш. 153): grouped by the legal entity's ЕИК — from the participations' copies, so
  // only to who sees the names in the scheme (an opening on record); only once the applications closed
  const lg: "bg" | "en" = lang === "bg" ? "bg" : "en";
  const showPrices = !!chosen && parts.length > 0 && (await mayNow("names.view", chosen.id));
  let priced: ReturnType<typeof schemePrices> | null = null;
  let pricesFailed = false;
  if (chosen && showPrices) {
    try {
      const snaps = inForce(await openParticipationSnapshots({ actor: await actorNow(), purpose: "names.view" }, chosen.id));
      // one reading with the billing export (lib/scheme-prices)
      priced = schemePrices(chosen, await listParticipants(chosen.id), snaps, schemeNowMs(chosen));
    } catch { pricesFailed = true; }
  }
  const prices = priced?.prices ?? null;
  const ready = !!priced && (priced.state === "preview" || priced.state === "fixed");
  const counts = chosen ? {
    proforma: parts.filter((p) => chosen.labDocs?.[p.code]?.proforma).length,
    paid: parts.filter((p) => chosen.paidAt?.[p.code]).length,
    invoice: parts.filter((p) => chosen.labDocs?.[p.code]?.invoice).length,
  } : null;

  return (
    <div>
      <h1 className="text-2xl font-bold" style={{ color: "var(--green-dark)" }}>{L("Фактури", "Invoices")}</h1>
      <p className="text-sm mt-1" style={{ color: "var(--muted)", maxWidth: 820 }}>
        {L("Порталът не издава фактури и не дава номера: проформата и оригиналната фактура се правят в счетоводния софтуер и се качват на страницата на всяко участие, с номерата си. Проформата — след второто обявяване; фактурата — след плащането (Реш. 35). Плащането не спира изпращането (Реш. 96).",
          "The portal issues no invoice and gives no number: the proforma and the original invoice are made in the accounting software and uploaded on each participation's page, with their numbers. The proforma after the second announcement; the invoice after the payment (Реш. 35). Payment never holds the dispatch back (Реш. 96).")}
      </p>
      {schemes.length === 0 ? (
        <div className="card p-4 mt-4" style={{ color: "var(--muted)" }}>{L("Няма започнала схема, в която да работите с участниците.", "No started scheme you work with the participants in.")}</div>
      ) : (
        <nav className="flex gap-2 mt-3" style={{ flexWrap: "wrap" }} aria-label={L("Схеми", "Schemes")} data-invoices-schemes>
          {schemes.map((s) => (
            <Link key={s.id} href={`/invoices?scheme=${encodeURIComponent(s.id)}`} aria-current={chosen?.id === s.id ? "true" : undefined} className="btn btn-sm"
              style={chosen?.id === s.id ? { background: "var(--green-dark)", color: "#fff", borderColor: "var(--green-dark)" } : undefined}>{s.number}</Link>
          ))}
        </nav>
      )}
      {chosen && counts && (
        <section className="card p-4 mt-4" data-invoices-scheme={chosen.id}>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-bold" style={{ color: "var(--green-dark)" }}>{chosen.number}</span>
            <span className="text-sm" style={{ color: "var(--muted)" }}>{L(`${parts.length} участия · проформи ${counts.proforma} · платени ${counts.paid} · фактури ${counts.invoice}`, `${parts.length} participations · proformas ${counts.proforma} · paid ${counts.paid} · invoices ${counts.invoice}`)}</span>
            <span style={{ flex: 1 }} />
            {/* the export for accounting: it carries the names — its own route, gated and journalled */}
            <a href={`/invoices/export?scheme=${encodeURIComponent(chosen.id)}`} className="btn btn-sm" data-billing-export>⬇ {L("Справка за фактуриране (CSV)", "Billing export (CSV)")}</a>
          </div>
          {parts.length === 0 ? (
            <p className="text-sm mt-3" style={{ color: "var(--muted)" }}>{L("Няма участия в кръга.", "No participations in the round.")}</p>
          ) : (
            <div style={{ overflowX: "auto" }} className="mt-3">
              <table className="text-sm" style={{ borderCollapse: "collapse", minWidth: 640 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 12 }}>
                    <th className="p-1">{L("Код", "Code")}</th>
                    <th className="p-1">{L("Проформа №", "Proforma No.")}</th>
                    <th className="p-1">{L("от", "of")}</th>
                    <th className="p-1">{L("Платено", "Paid")}</th>
                    <th className="p-1">{L("Фактура №", "Invoice No.")}</th>
                    <th className="p-1">{L("от", "of")}</th>
                    {showPrices && <th className="p-1">{L("Цена (Реш. 153)", "Price (Decision 153)")}</th>}
                  </tr>
                </thead>
                <tbody>
                  {parts.map((p) => {
                    const pf = chosen.labDocs?.[p.code]?.proforma, inv = chosen.labDocs?.[p.code]?.invoice, paid = chosen.paidAt?.[p.code];
                    return (
                      <tr key={p.id} data-invoice-row={p.code} data-invoice-state={inv ? "invoiced" : paid ? "paid" : pf ? "proforma" : "none"} style={{ borderTop: "1px solid var(--line)" }}>
                        <td className="p-1 font-mono"><Link href={`/schemes/${chosen.id}/participants/${encodeURIComponent(p.code)}`} style={{ color: isProvisional(p.code) ? "var(--muted)" : "var(--green-dark)" }}>{p.code}</Link></td>
                        <td className="p-1">{pf?.number || (pf ? "—" : "")}</td>
                        <td className="p-1">{day(pf?.uploadedAt)}</td>
                        <td className="p-1">{paid ? day(paid) : <span style={{ color: "var(--muted)" }}>{L("не", "no")}</span>}</td>
                        <td className="p-1">{inv?.number || (inv ? "—" : "")}</td>
                        <td className="p-1">{day(inv?.uploadedAt)}</td>
                        {showPrices && (() => {
                          const pr = prices?.get(p.id);
                          if (pricesFailed) return <td className="p-1 text-xs" style={{ color: "var(--muted)" }}>{L("не се прочете", "could not be read")}</td>;
                          if (priced?.state === "not-held") return <td className="p-1 text-xs" style={{ color: "var(--muted)" }}>{L("схемата не се провежда", "the scheme is not held")}</td>;
                          if (!ready) return <td className="p-1 text-xs" style={{ color: "var(--muted)" }}>{L("след срока за заявки", "after the applications' deadline")}</td>;
                          if (!pr) return <td className="p-1 text-xs" style={{ color: "var(--muted)" }}>—</td>;
                          return <td className="p-1" data-price={pr.totalCents ?? ""} data-price-lines={pr.lines.map((l) => l.kind).join(",")} data-price-state={priced!.state}><b>{pr.totalCents === null ? "—" : fmtEur(pr.totalCents, lg)}</b><div className="text-xs" style={{ color: "var(--muted)", maxWidth: 360 }}>{priceText(pr, lg)}{priced!.state === "preview" ? L(" · предварително — фиксира се при второто обявяване", " · a preview — fixed at the second announcement") : pr.later ? L(" · след фиксирането, спрямо групата", " · after the fixing, against its group") : ""}</div></td>;
                        })()}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// The calibration chain, resolved for ONE laboratory (moved out of /lab in part 5.5, so
// the participation's page shows it too — to a laboratory's account and to a user of its
// legal entity alike).
//
// §4.2 lives here. A laboratory may learn the name and address of exactly ONE other
// participant — the stop it must ship to — and only once the device is in its hands. So
// this resolves a single code, and only in the "holding" state, as an opening for dispatch
// by the reader named in `actor`, on record (2.3). Everything else it returns is position
// and timing, which name nobody.

import type { Scheme } from "./types";
import { labState, positionOf, nextStopFor, estimatedWaitDays, describeWait, isIncomingFor } from "./chain";
import { listParticipants, withIdentities } from "./participants";
import { chainWindow } from "./deadlines-model";
import { holidaySet } from "./holidays";
import { fmtSchemeDate, isPast } from "./scheme-dates";
import { schemeNowMs } from "./clock";

export async function chainViewFor(scheme: Scheme, code: string, lang: "bg" | "en", actor: string) {
  const chain = scheme.chain;
  if (scheme.type !== "C" || !chain?.stops?.length) return null;
  const state = labState(chain, code);
  if (state === "not-in-chain") return null;

  let next: { kind: "lab" | "ref" | "pts"; name?: string; address?: string; contact?: string; phone?: string } | null = null;
  if (state === "holding") {
    const idx = chain.stops.findIndex((s) => s.kind === "lab" && s.code === code && !!s.receivedAt && !s.sentAt);
    const ns = nextStopFor(chain, idx);
    if (!ns) {
      next = { kind: "pts" }; // last stop — it goes home
    } else if (ns.kind === "ref") {
      next = {
        kind: "ref",
        name: lang === "bg" ? scheme.calibration?.referenceLabBg : scheme.calibration?.referenceLabEn,
        address: lang === "bg" ? scheme.calibration?.referenceLabLocBg : scheme.calibration?.referenceLabLocEn,
      };
    } else {
      // ONE lookup, for ONE code — never the whole participant list into the view;
      // names travel, codes don't: the holder sees where the device goes next
      const one = (await listParticipants(scheme.id)).filter((x) => x.code === ns.code);
      const np = one.length ? (await withIdentities(one, scheme.id, { actor, purpose: "dispatch" }))[0] : undefined;
      next = { kind: "lab", name: np?.labName, address: np?.deliveryAddress, contact: np?.contact, phone: np?.phone };
    }
  }
  // its own window while it holds the instrument (3.4)
  let handOnBy: { dueText: string; days: number; orderNo?: string; overdue: boolean } | undefined;
  if (state === "holding") {
    const stop = chain.stops.find((s) => s.kind === "lab" && s.code === code && !!s.receivedAt && !s.sentAt);
    const w = stop ? chainWindow(scheme, stop, await holidaySet()) : null;
    if (w) handOnBy = { dueText: fmtSchemeDate(w.due), days: w.days, orderNo: w.ext?.orderNo, overdue: isPast(w.due, schemeNowMs(scheme)) };
  }
  return {
    handOnBy,
    state,
    // its place only — never how many stops the chain has: a calibration round is small, and its size
    // is the participants' number (the security sweep, SC-5; the design names «position + estimate»)
    position: ((p) => (p ? { position: p.position } : null))(positionOf(chain, code)),
    wait: describeWait(estimatedWaitDays(chain, code), lang),
    started: !!chain.dispatchedAt,
    closed: !!chain.returnedAt,
    incoming: isIncomingFor(chain, code),
    next,
  };
}

// A participant's own participations, as its pages show them (plan part 5.5): the state
// read from the record, its stage, payment beside it, the next deadline, the documents
// released to it and whether anyone of it has opened them, and what asks for action now.
//
// Who may read: a laboratory's account (its participations — the old front door) or a
// user of a legal entity (its entity's laboratories' — 4.4), in that order, as the
// document route decides (5.4). Each reads only its own; every list of them is the
// laboratory's own opening, on record (2.3). Nothing here names another participant.

import type { CaseEvent, CodedParticipant, Lab, Scheme } from "./types";
import type { EntityUserRole } from "./entity-users-model";
import { readerKey } from "./notifications";
import { actorNow } from "./identities";
import { getLabSession } from "./lab-auth";
import { getParticipantSession, participationsOf, participantActor } from "./participant-session";
import { listVisibleParticipations, isStarted } from "./visibility";
import { openLaboratories } from "./laboratories";
import { listParticipants } from "./participants";
import { listCaseEvents } from "./case-events";
import { getSchemesByIds } from "./store";
import { listActivity } from "./activity-store";
import { holidaySet } from "./holidays";
import { chainWindow } from "./deadlines-model";
import { docsFor, type ReachingRelease } from "./release-model";
import { ackRequiredFor, ackOf, kindOf, type AckKind, type Acknowledgement } from "./ack-model";
import { inFinalRound } from "./announcement-model";
import { deliveryOf, deliveryProgress, receivedOtherwise, otherReceipts } from "./delivery-model";
import { waitingOf } from "./waitlist-model";
import { schemeNowMs } from "./clock";
import {
  stateFacts, participationState, nextDeadline, actionsFor, paymentOf, finished, STATE_STAGE,
  type PState, type Stage, type PaymentMark, type NextDeadline, type ActionItem,
} from "./participation-state-model";

/** One participation the viewer may read — ids and its laboratory's name, nothing more. */
export interface OwnRow { participantId: string; schemeId: string; labName: string; laboratoryId?: string; country?: string }

export interface ParticipantViewer {
  kind: "lab" | "entity";
  /** the entity user (a release to one user reaches it, 5.4) */
  userId?: string;
  /** whose «read» a notice is (N28, 4.6) */
  reader: string;
  /** the opener of its own identity rows — the dispatch address of the chain's next stop (2.3) */
  actor: string;
  /** a laboratory's account: its laboratory */
  lab?: Lab;
  /** a user of a legal entity: what its header shows */
  user?: { name: string; role: EntityUserRole; persona: boolean };
  rows: OwnRow[];
}

/** Who is reading, and the participations that are theirs — or null: nobody signed in. */
export async function participantViewer(): Promise<ParticipantViewer | null> {
  const ls = await getLabSession();
  if (ls) {
    // which participations are this laboratory's is the mapping itself — its own opening (2.3)
    const parts = await listVisibleParticipations(ls.lab.id);
    return { kind: "lab", reader: readerKey.labAccount(ls.userId), actor: await actorNow(), lab: ls.lab, rows: parts.map((p) => ({ participantId: p.id, schemeId: p.schemeId, labName: p.labName, country: p.country })) };
  }
  const ps = await getParticipantSession().catch(() => null);
  if (!ps) return null;
  const actor = { actor: participantActor(ps.user.id), purpose: "lab.own" as const };
  const [parts, labs] = await Promise.all([participationsOf(ps), openLaboratories(actor, { entityId: ps.entity.id })]);
  const name = new Map(labs.map((l) => [l.id, l.name] as const));
  // the delivery country is the entity's (a laboratory has no country of its own, 4.2)
  return { kind: "entity", userId: ps.user.id, reader: readerKey.participant(ps.user.id), actor: participantActor(ps.user.id), user: { name: ps.user.name, role: ps.user.role, persona: ps.persona }, rows: parts.map((p) => ({ participantId: p.participantId, schemeId: p.schemeId, labName: name.get(p.laboratoryId) ?? "", laboratoryId: p.laboratoryId, country: ps.entity.country })) };
}

export interface ParticipationView {
  participantId: string;
  scheme: Scheme;
  part: CodedParticipant;
  labName: string;
  laboratoryId?: string;
  state: PState;
  stage: Stage | null;
  finished: boolean;
  payment: PaymentMark;
  deadline: NextDeadline | null;
  events: CaseEvent[];
  /** received after the latest shipment some other way — a signed scan, PTS's own step (5.6) */
  receivedOtherwise: boolean;
  /** the latest dispatch and receipt on its case file */
  dispatch?: CaseEvent;
  receipt?: CaseEvent;
  /** every document released to it, each with whether anyone of it opened that edition
   *  (null: released before editions — not known) */
  docs: ({ key: string } & ReachingRelease & { opened: boolean | null; ack: DocAck })[];
  actions: ActionItem[];
}

/** A document's acknowledgement for the edition the participation holds (5.9): not asked; asked
 *  and not given; given — with its record. */
export type DocAck = { state: "none" } | { state: "asked"; kind: AckKind } | { state: "done"; kind: AckKind; record: Acknowledgement };

const latest = (events: CaseEvent[], kind: CaseEvent["kind"]) =>
  events.filter((e) => e.kind === kind).sort((a, b) => (b.at + (b.recordedAt ?? "")).localeCompare(a.at + (a.recordedAt ?? "")))[0];

/** The views of these participations, from the record. Schemes not started are left out (Реш. 147). */
export async function participationViews(rows: readonly OwnRow[], viewer: { userId?: string }): Promise<ParticipationView[]> {
  if (!rows.length) return [];
  const schemes = (await getSchemesByIds([...new Set(rows.map((r) => r.schemeId))])).filter((s) => isStarted(s));
  const off = schemes.some((s) => s.type === "C" && s.chain?.stops?.length) ? await holidaySet() : new Set<string>();
  const out: ParticipationView[] = [];
  for (const scheme of schemes) {
    const mine = rows.filter((r) => r.schemeId === scheme.id);
    const coded = await listParticipants(scheme.id);
    const nowMs = schemeNowMs(scheme); // the round's clock (1.3)
    const parts = mine.flatMap((r) => { const part = coded.find((p) => p.id === r.participantId); return part ? [{ r, part }] : []; });
    // the scheme's waiting list (9.3) — the participation's state says it; never its place
    const waiting = new Set(waitingOf(scheme, coded));
    // what reaches each — only while it goes on in the round: refused, annulled, withdrawn
    // or off the final list, it is given nothing more, as the document route decides (5.4)
    const reaching = new Map(parts.map(({ part }) => [part.id, inFinalRound(scheme, part) ? docsFor(scheme, { participantIds: [part.id], userId: viewer.userId }) : []] as const));
    // a code — and the reference it was journalled under before the coding act (5.3)
    const codesOf = (code: string) => [code, ...(scheme.coding ?? []).flatMap((c) => Object.entries(c.codes).filter(([, to]) => to === code).map(([ref]) => ref))];
    // who of it opened which edition: the download journal (5.4), read for exactly these
    // editions and these participations' codes — never a window of the latest rows (review)
    const subjects = [...new Set([...reaching.values()].flat().filter((d) => d.editionId).map((d) => `edition:${d.editionId}`))];
    const codes = [...new Set(parts.flatMap(({ part }) => codesOf(part.code)))];
    const downloads = subjects.length && codes.length
      ? await listActivity({ schemeId: scheme.id, action: "file.downloaded", actorRole: "lab", subjects, targetCodes: codes, limit: 1000 }).catch(() => [])
      : [];
    const opened = new Set(downloads.filter((e) => e.subject && e.targetCode).map((e) => `${e.subject!.slice("edition:".length)}|${e.targetCode}`));
    for (const { r, part } of parts) {
      const events = await listCaseEvents(scheme.id, part.code).catch(() => [] as CaseEvent[]);
      // a testing scheme's delivery record speaks for the object once it has a shipment (5.6)
      const d = deliveryOf(scheme, part.id);
      const otherwise = receivedOtherwise(d, otherReceipts(scheme, part.code, events));
      const state = participationState(stateFacts({ scheme, part, events, country: r.country, delivery: scheme.type === "C" ? null : deliveryProgress(d, otherwise), waiting: waiting.has(part.id) }));
      // its own window while it holds the instrument (3.4)
      const stop = scheme.type === "C" ? scheme.chain?.stops?.find((s) => s.kind === "lab" && s.code === part.code && !!s.receivedAt && !s.sentAt) : undefined;
      const w = stop ? chainWindow(scheme, stop, off) : null;
      const deadline = nextDeadline(scheme, part.code, state, w ? { at: w.due, orderNo: w.ext?.orderNo } : undefined, nowMs);
      const mineCodes = codesOf(part.code);
      // opened: a download of THAT edition by THIS participation's code; a release from before
      // editions (3.0) has none to match — not known, never said «opened»
      const docs = (reaching.get(part.id) ?? []).map((d) => {
        // asked to acknowledge — the declaration always (5.9; Реш. 117, 118)
        // a record made stays shown when the setting is later cleared (review)
        const rec = ackOf(scheme, part.id, d.key, d.editionId);
        const ack: DocAck = rec ? { state: "done", kind: kindOf(d.key), record: rec } : ackRequiredFor(scheme, d.key) ? { state: "asked", kind: kindOf(d.key) } : { state: "none" };
        return { ...d, opened: d.editionId ? mineCodes.some((c) => opened.has(`${d.editionId}|${c}`)) : null, ack };
      });
      const dispatch = latest(events, "items_dispatched");
      out.push({
        participantId: part.id, scheme, part, labName: r.labName, laboratoryId: r.laboratoryId, receivedOtherwise: otherwise,
        state, stage: STATE_STAGE[state], finished: finished(state),
        payment: paymentOf(scheme, part.code, part.status), deadline, events,
        dispatch, receipt: latest(events, "receipt_confirmed"), docs,
        actions: actionsFor({
          participantId: part.id, state, deadline, dispatchedAt: dispatch?.at,
          unopened: docs.filter((d) => d.opened === false).map((d) => ({ key: d.key, editionNo: d.editionNo, editionId: d.editionId })),
          // a scheme not held asks nothing more of anyone
          unacked: scheme.status === "not_held" ? [] : docs.filter((d) => d.ack.state === "asked").map((d) => ({ key: d.key, kind: kindOf(d.key), editionNo: d.editionNo, editionId: d.editionId })),
        }),
      });
    }
  }
  return out;
}

// The three levels of release (plan part 5.4; Zadanie «Три нива на пускане на документ»,
// «Редакции»; Реш. 50). Pure.
//
// «Документ към участник може да бъде пуснат на три нива: към всички участници в
// схемата, към конкретна лаборатория, или към конкретен потребител. Порталът записва кой
// документ, на кое ниво, кога е пуснат и кой го е свалил.»
//
//   ALL — «Изпрати» as since 0.7/3.0: scheme.sentToParticipants + releasedEditions.
//   PARTICIPATION — one laboratory's participation in the scheme (by its id).
//   USER — one user of a legal entity (4.3), for the participations of its entity.
// Each release is an EDITION (3.0) — what went out is that edition's frozen file, never
// the live document — kept on the scheme, never removed: a withdrawal is a date on it.
// What a viewer may open is the latest release that reaches it; every opening by a
// laboratory is in the journal («кой го е свалил»).

import { isSendableDoc, SENDABLE_DOCS } from "./doc-release";

export type ReleaseLevel = "all" | "participation" | "user";

/** A release to ONE participation or ONE user — appended, never changed but for its withdrawal. */
export interface TargetRelease {
  id: string;
  docKey: string;
  level: "participation" | "user";
  /** the participation (level participation) */
  participantId?: string;
  /** the entity user (level user) */
  userId?: string;
  editionId: string;
  editionNo: number;
  at: string;
  by: string;
  withdrawnAt?: string;
  withdrawnBy?: string;
}

/** Who is opening: the participations they act for in the scheme, and — a user of a legal
 *  entity — who they are. */
export interface ReleaseViewer { participantIds: readonly string[]; userId?: string }

type Released = { sentToParticipants?: Record<string, string>; releasedEditions?: Record<string, { id: string; no: number; at: string }>; releases?: TargetRelease[] };

export interface ReachingRelease { level: ReleaseLevel; at: string; editionId?: string; editionNo?: number; releaseId?: string }

/** Does a targeted release reach this viewer? */
export const reaches = (r: TargetRelease, v: ReleaseViewer): boolean =>
  !r.withdrawnAt && (r.level === "participation" ? !!r.participantId && v.participantIds.includes(r.participantId) : !!r.userId && r.userId === v.userId);

/** The release of a document that reaches this viewer — the latest one, whichever level
 *  — or null: not released to them. */
export function releaseFor(s: Released, docKey: string, v: ReleaseViewer): ReachingRelease | null {
  if (!isSendableDoc(docKey)) return null;
  // «all»: since it was sent — or since an amendment gave every participant its edition (3.3)
  const allAt = [s.sentToParticipants?.[docKey], s.releasedEditions?.[docKey]?.at].filter((x): x is string => !!x).sort().at(-1);
  const all: ReachingRelease | null = s.sentToParticipants?.[docKey] && allAt
    ? { level: "all", at: allAt, editionId: s.releasedEditions?.[docKey]?.id, editionNo: s.releasedEditions?.[docKey]?.no }
    : null;
  const own = (s.releases ?? []).filter((r) => r.docKey === docKey && reaches(r, v)).sort((a, b) => a.at.localeCompare(b.at)).at(-1);
  const mine: ReachingRelease | null = own ? { level: own.level, at: own.at, editionId: own.editionId, editionNo: own.editionNo, releaseId: own.id } : null;
  if (!all) return mine;
  if (!mine) return all;
  return mine.at > all.at ? mine : all;
}

/** Every document released to this viewer, in the fixed order — what its page lists. */
export const docsFor = (s: Released, v: ReleaseViewer): ({ key: string } & ReachingRelease)[] =>
  SENDABLE_DOCS.flatMap((key) => { const r = releaseFor(s, key, v); return r ? [{ key, ...r }] : []; });

/** A release's target as posted: one participation, or one user — ids only. */
export function readTarget(input: { level?: unknown; participantId?: unknown; userId?: unknown }): { ok: true; level: "participation"; participantId: string } | { ok: true; level: "user"; userId: string } | { ok: false } {
  const id = (x: unknown) => { const s = String(x ?? "").trim(); return /^[0-9a-f-]{8,64}$/i.test(s) ? s : ""; };
  if (input.level === "participation" && id(input.participantId)) return { ok: true, level: "participation", participantId: id(input.participantId) };
  if (input.level === "user" && id(input.userId)) return { ok: true, level: "user", userId: id(input.userId) };
  return { ok: false };
}

export const RELEASE_LEVEL_LABEL: Record<ReleaseLevel, { bg: string; en: string }> = {
  all: { bg: "до всички участници", en: "to every participant" },
  participation: { bg: "до едно участие", en: "to one participation" },
  user: { bg: "до един потребител", en: "to one user" },
};

export const RELEASE_PROBLEM_TEXT = {
  target: { bg: "изберете участието или потребителя", en: "choose the participation or the user" },
  started: { bg: "схемата още не е започнала — нищо от нея не стига до лаборатория (Реш. 147)", en: "the scheme has not started — nothing of it reaches a laboratory (Реш. 147)" },
  participation: { bg: "участието не е в кръга на схемата", en: "the participation is not in the scheme's round" },
  user: { bg: "потребителят не е от юридическо лице с участие в схемата, или не е активен", en: "the user is not of a legal entity with a participation in the scheme, or not active" },
  gone: { bg: "освобождаването вече е оттеглено или го няма", en: "the release is withdrawn already, or not there" },
};

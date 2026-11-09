import type { Participant, Scheme } from "./types";
import { getSchemesByIds } from "./store";
import { listParticipationsForLab } from "./participants";

// Реш. 147 (plan part 0.3): nothing that has not started is visible to a laboratory
// or to the public — no list, filter, count, feed or address reveals it. An
// unstarted scheme answers exactly like a missing one.
//
// "Started" means the scheme has left draft. Part 3.2 remaps this to the new
// lifecycle states; until then this is the one place that decides it.
export function isStarted(s: Pick<Scheme, "status">): boolean {
  return s.status !== "draft";
}

// A laboratory's participations in STARTED schemes only. PTS may already have
// entered a lab into a scheme it is still preparing (Реш. 145: PTS creates the
// participants); the lab must not learn of that scheme before it starts. Every
// lab-side reader — the dashboard, the document and upload routes, the lab's own
// actions — goes through this, so a draft is refused the same way as a scheme the
// lab is not in at all.
export async function listVisibleParticipations(labId: string): Promise<Participant[]> {
  // which participations are this laboratory's is the mapping itself — an opening of
  // the identity store by the laboratory, on record (2.3)
  const parts = await listParticipationsForLab(labId, { actor: `lab:${labId}`, purpose: "lab.own" });
  if (parts.length === 0) return parts;
  const schemes = await getSchemesByIds([...new Set(parts.map((p) => p.schemeId))]);
  const started = new Set(schemes.filter(isStarted).map((s) => s.id));
  return parts.filter((p) => started.has(p.schemeId));
}

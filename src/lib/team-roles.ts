import type { TeamDuty } from "./types";

// Who in a scheme's team signs as its manager, is its technical expert, compiles the lists — the person the duty was
// given to under «Екип на схемата» (round 9). For three rounds the role's words were guessed at: a «Sales Manager»
// signed when no row said «scheme manager», two scheme managers left it to the row order, «Technical Manager» and
// deputies had to be named one by one (round 8, R8S-1, RV8-4, the final check). A duty nobody was given (a team saved
// before the choice; a technical expert added as a row only): the role's own name («Ръководител на схемата»,
// «PT Scheme Manager», «Технически експерт»…), never a deputy, and only when exactly ONE row carries it — otherwise no
// one, and the documents show «[за попълване]». The server requires the scheme manager to be given (actions.ts).
export const TEAM_DUTIES: readonly TeamDuty[] = ["manager", "technical", "coding"];
const W = (alts: string) => new RegExp(`(?<![\\p{L}])(?:${alts})(?![\\p{L}])`, "iu");
const DEPUTY = W("заместник|заместник-ръководител|зам\\.?|deputy|vice|асистент|assistant");
const BY_NAME: Record<TeamDuty, RegExp> = {
  manager: /ръководител на (?:рт |pt )?схемата|scheme manager/i,
  technical: /технически експерт|technical expert/i,
  coding: /кодиран|coding/i,
};
export function findTeamMember<M extends { roleBg: string; roleEn: string; duties?: readonly string[] }>(team: readonly M[] | null | undefined, which: TeamDuty): M | undefined {
  const rows = team ?? [];
  const given = rows.filter((x) => x.duties?.includes(which));
  if (given.length) return given.length === 1 ? given[0] : undefined;
  const named = rows.filter((x) => { const both = `${x.roleBg} ${x.roleEn}`; return BY_NAME[which].test(both) && !DEPUTY.test(both); });
  return named.length === 1 ? named[0] : undefined;
}

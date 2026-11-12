// Who in a scheme's team is its manager, its technical expert — by the role's own name first («Ръководител на
// схемата», «PT Scheme Manager»), the looser word only when no one carries it. Read on both languages of the row
// together, whole words only (round 8: «Technical Manager», «Deputy PT Scheme Manager» passed; then «Customer
// Service» was read as «vice», «Officer» as «office», and «Ръководител на схемата и технически експерт» refused).
const W = (alts: string) => new RegExp(`(?<![\\p{L}])(?:${alts})(?![\\p{L}])`, "iu");
const DEPUTY = W("заместник|заместник-ръководител|зам\\.?|deputy|vice|асистент|assistant");
const OTHER_MANAGER = W("технически|техническият|technical|качеството|quality|данни|data|лабораторията|лаборатория|laboratory|офис|office");
export const TEAM_ROLE: Record<"manager" | "technical", RegExp[]> = {
  manager: [/ръководител на (?:рт |pt )?схемата|scheme manager/i, /ръководител|manager/i],
  technical: [/технически експерт|technical expert/i],
};
export function findTeamMember<M extends { roleBg: string; roleEn: string }>(team: readonly M[], which: "manager" | "technical"): M | undefined {
  const [strict, loose] = TEAM_ROLE[which];
  const ok = (both: string, re: RegExp, isStrict: boolean) => re.test(both) && (which !== "manager" || (!DEPUTY.test(both) && (isStrict || !OTHER_MANAGER.test(both))));
  const pick = (re: RegExp, isStrict: boolean) => team.find((x) => ok(`${x.roleBg} ${x.roleEn}`, re, isStrict));
  return pick(strict, true) ?? (loose ? pick(loose, false) : undefined);
}

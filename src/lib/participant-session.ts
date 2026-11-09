// A participant's user of a legal entity, signed in (plan part 4.4). The three-level
// model (entity → laboratories → users, 4.1–4.3) reaches the laboratory's side here
// first: a user who accepted the invitation reviews, completes and — the profile's
// administrator — confirms the data PTS entered from the PDF application (Реш. 145).
// The rest of the laboratory's area moves over with the laboratory switcher (4.6);
// until then a participant's user has this one page.
//
// The session is the sign-in account's: its user is found by that account (linked at
// the invitation, 0034), never by a typed address; inactive, or under an inactive
// entity, is no session. Every opening is the laboratory's own (lab.own), on record.
import { cache } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "./auth";
import { devLabPersonaActive, devPersonaParticipantId } from "./roles";
import { entityUserByAuth, openEntityUsers } from "./entity-users";
import { openEntities } from "./entities";
import { participationsOfEntity, type OwnParticipation } from "./participation-snapshots";
import type { EntityUser } from "./entity-users-model";
import type { LegalEntity } from "./entities-model";

export interface ParticipantSession {
  user: EntityUser;
  entity: LegalEntity;
  /** a development persona — no sign-in account behind it */
  persona: boolean;
}

/** Signed in as an active user — before the two-step check: the enrolment page's own
 *  gate. `twoStepMissing`: PTS requires two-step sign-in and this session has not
 *  passed it (4.4 review). */
export interface ParticipantSignIn extends ParticipantSession { twoStepMissing: boolean }

/** The actor a participant's user is in the identity store's record — by its id, never
 *  its address. */
export const participantActor = (userId: string) => `participant:${userId}`;

export const getParticipantSignIn = cache(async (): Promise<ParticipantSignIn | null> => {
  let user: EntityUser | null | undefined;
  let persona = false;
  let aal2 = false;
  if (await devLabPersonaActive()) {
    // development (part 1.4): the persona's user, or none — never a real sign-in
    const id = await devPersonaParticipantId();
    if (!id) return null;
    [user] = await openEntityUsers({ actor: participantActor(id), purpose: "lab.own" }, { userId: id });
    persona = true;
  } else {
    const session = await getSessionUser();
    // a temporary password to change, or an authenticator not passed: not yet a session (1.5)
    if (!session?.email || session.mustChangePassword || session.needsAal2) return null;
    user = await entityUserByAuth(session.userId, `auth:${session.userId}`);
    // the account's e-mail is still the user's login — else it is no session of it (4.4 review)
    if (user && user.email !== session.email) return null;
    aal2 = session.aal2;
  }
  // only an ACTIVE user — the invitation accepted (its password set)
  if (!user || user.state !== "active") return null;
  const [entity] = await openEntities({ actor: participantActor(user.id), purpose: "lab.own" }, user.entityId);
  if (!entity || entity.state === "inactive") return null;
  return { user, entity, persona, twoStepMissing: !persona && user.twoFactorRequired && !aal2 };
});

/** The session of a participant's user — with two-step sign-in passed where PTS
 *  requires it. */
export const getParticipantSession = cache(async (): Promise<ParticipantSession | null> => {
  const s = await getParticipantSignIn();
  return s && !s.twoStepMissing ? s : null;
});

/** THE gate of a participant's user's page and actions: signed in, active, its entity
 *  not inactive, two-step sign-in where required — else to the laboratory's sign-in,
 *  or to set two-step sign-in up. */
export async function requireParticipant(): Promise<ParticipantSession> {
  if ((await getSessionUser())?.mustChangePassword) redirect("/auth/set-password?must=1");
  const s = await getParticipantSignIn();
  if (!s) redirect("/lab/login");
  if (s.twoStepMissing) redirect("/lab/two-factor");
  return s;
}

/** The participations of the user's entity — of all its laboratories (К5), by the
 *  copies in force (4.5): the laboratory switcher's (4.6). Opened as the laboratory's own. */
export const participationsOf = cache(async (ps: ParticipantSession): Promise<OwnParticipation[]> => participationsOfEntity(ps.entity.id, participantActor(ps.user.id)));

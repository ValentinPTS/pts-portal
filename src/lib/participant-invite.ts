// The invitation of a participant's user (plan part 4.4) — its steps, in order, with
// what they call handed in, so a test can drive them with a fake Supabase.
//
//   1. a sign-in account for the user's login — a new one (an «invite» link);
//   2. when the login has an account already: ONLY the one this user was linked to at
//      an earlier invitation not yet accepted may get a new link (a «recovery» link to
//      the same «set a password»). Any other account is never taken over — the
//      invitation is refused, nothing sent (4.4 review; as an account request is, N3);
//   3. the account linked to the user BEFORE any e-mail (only an invited user, only the
//      account of its own login — the database checks auth.users, 0034); a link that
//      fails sends nothing;
//   4. the e-mail — on record first (send control, 1.8), the link kept out of the record.

import type { EntityUser } from "./entity-users-model";

export interface InviteDeps {
  /** Supabase's admin generateLink, reduced to what is used */
  generateLink(type: "invite" | "recovery", email: string): Promise<{ authId?: string; token?: string; error?: string }>;
  link(userId: string, authId: string): Promise<void>;
  /** the e-mail, through send control — on record before it goes */
  send(link: string): Promise<{ ok: boolean; error?: string }>;
  /** the link the e-mail carries */
  linkFor(token: string, type: "invite" | "recovery"): string;
}

export const ACCOUNT_TAKEN = "Този e-mail вече има профил за вход, който не е на този потребител — поканата не тръгна. Софтуерният администратор на PTS трябва да го прегледа. · This e-mail already has a sign-in account that is not this user's — the invitation was not sent. PTS's software administrator must look at it.";

const exists = (e?: string) => !!e && /already|registered|exists/i.test(e);

export async function inviteParticipant(u: Pick<EntityUser, "id" | "email" | "authUserId">, deps: InviteDeps): Promise<{ ok: true } | { error: string }> {
  let type: "invite" | "recovery" = "invite";
  let r = await deps.generateLink("invite", u.email);
  if (exists(r.error)) {
    // an account is there: only this user's own, from its earlier invitation
    if (!u.authUserId) return { error: ACCOUNT_TAKEN };
    type = "recovery";
    r = await deps.generateLink("recovery", u.email);
    if (!r.error && r.authId !== u.authUserId) return { error: ACCOUNT_TAKEN };
  }
  if (r.error || !r.authId || !r.token) return { error: "Поканата не можа да се подготви — нищо не е изпратено. · The invitation could not be prepared — nothing was sent." };
  try { await deps.link(u.id, r.authId); }
  catch { return { error: "Профилът за вход не може да се свърже с този потребител — нищо не е изпратено. · The sign-in account cannot be linked to this user — nothing was sent." }; }
  const res = await deps.send(deps.linkFor(r.token, type));
  return res.ok ? { ok: true } : { error: `Поканата не тръгна — ${res.error}. · The invitation was not sent — ${res.error}.` };
}

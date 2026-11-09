// Which portal this is (plan part 1.2, Реш. 130–133): the real one, or the TEST
// environment — its own Supabase project and the Vercel preview deployment, with a
// movable clock (1.3), simulation rounds and no real identities.
//
// PTS_ENVIRONMENT=test marks the test deployment; anything else is production. The
// database says the same of itself (table app_environment, migration 0019), and the
// build gate refuses to deploy when the two disagree — so test code never reaches the
// real data, nor the real portal the test data. Pure: no imports.

export type PortalEnvironment = "production" | "test";

export function portalEnvironment(env: Record<string, string | undefined> = process.env): PortalEnvironment {
  return env.PTS_ENVIRONMENT === "test" ? "test" : "production";
}

export const isTestEnvironment = (env?: Record<string, string | undefined>) => portalEnvironment(env) === "test";

// In the test environment mail goes only to PTS's own domain — the test mailboxes for
// the simulated laboratories are there (D21) — never to a real laboratory.
export const TEST_MAIL_DOMAIN = "ptsbg.eu";

export function mailAllowedHere(to: string, env?: Record<string, string | undefined>): boolean {
  if (!isTestEnvironment(env)) return true;
  // exactly one plain address — no lists («a@x.com,b@ptsbg.eu»), no second «@»
  const a = to.trim().toLowerCase();
  return /^[^\s@,;<>]+@ptsbg\.eu$/.test(a);
}

// a test mail says so in its subject, so nobody mistakes it for a real notice
export const testSubject = (subject: string, env?: Record<string, string | undefined>) =>
  isTestEnvironment(env) ? `[ТЕСТ / TEST] ${subject}` : subject;

/** A number that is a simulation's, however it is written — «SIM-26/03…», a Cyrillic
 *  «SIМ» — for the refusal outside the test environment (Реш. 130). */
export const looksLikeSimNumber = (number: string) => /^\s*[SЅ]\s*[IІ]\s*[MМ]/i.test(number);

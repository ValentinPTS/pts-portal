// The provider's people (plan part 1.6, Реш. 139 and 95). Pure: env only.
//
// Each person signs in with a personal address (the rule is surname@ptsbg.eu). A
// SHARED mailbox — office@ptsbg.eu — is never a person or a role in the portal: it
// cannot be a team member, a laboratory, a founder, or sign in at all. More shared
// addresses can be named in PTS_SHARED_MAILBOXES (comma-separated).
//
// Two-factor sign-in is required for every provider role and is RESET only by the
// head of the PT provider (Реш. 95), against a journal entry. The head's address is
// configuration, not code — the code is in a public repository: PROVIDER_HEAD_EMAILS
// (comma-separated); until it is set, the founders (OWNER_EMAILS).

type Env = Record<string, string | undefined>;
const list = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

// portal@ is the portal's sender, an alias of office@ (part 1.7)
export const DEFAULT_SHARED_MAILBOXES = ["office@ptsbg.eu", "portal@ptsbg.eu"];

export function sharedMailboxes(env: Env = process.env): string[] {
  return [...new Set([...DEFAULT_SHARED_MAILBOXES, ...list(env.PTS_SHARED_MAILBOXES)])];
}

// The mailbox an address lands in: a mail host delivers «office+x@ptsbg.eu» (and
// «office@ptsbg.eu.») to office@ptsbg.eu, so a shared mailbox is recognised under
// any of them. Used only to REFUSE; the head's allow-list stays an exact match.
export function mailboxKey(email: string | null | undefined): string {
  const e = (email ?? "").trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1) return e;
  return `${e.slice(0, at).split("+")[0]}@${e.slice(at + 1).replace(/\.+$/, "")}`;
}

/** A shared mailbox — never a person or a role (Реш. 139). */
export function isSharedMailbox(email: string | null | undefined, env: Env = process.env): boolean {
  const k = mailboxKey(email);
  return !!k && sharedMailboxes(env).some((s) => mailboxKey(s) === k);
}

export function providerHeadEmails(env: Env = process.env): string[] {
  const heads = list(env.PROVIDER_HEAD_EMAILS);
  return (heads.length ? heads : list(env.OWNER_EMAILS)).filter((e) => !isSharedMailbox(e, env));
}

/** The founders (OWNER_EMAILS) — never a shared mailbox (Реш. 139). */
export function founderEmails(env: Env = process.env): string[] {
  return list(env.OWNER_EMAILS).filter((e) => !isSharedMailbox(e, env));
}

export function isFounder(email: string | null | undefined, env: Env = process.env): boolean {
  const e = (email ?? "").trim().toLowerCase();
  return !!e && founderEmails(env).includes(e);
}

/** May this person reset someone's two-factor sign-in (Реш. 95)? */
export function isProviderHead(email: string | null | undefined, env: Env = process.env): boolean {
  const e = (email ?? "").trim().toLowerCase();
  return !!e && providerHeadEmails(env).includes(e);
}

export const SHARED_MAILBOX_REFUSAL =
  "Това е общ адрес (Реш. 139) — не се дава на човек или роля в портала. Използвайте личния адрес (фамилия@ptsbg.eu). · This is a shared mailbox — never a person or a role in the portal; use the personal address.";

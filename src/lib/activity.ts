import { getRoleContext } from "./roles";
import { getSessionUser } from "./auth";
import { LAB_ACTOR } from "./redact";
import { appendActivity, failed, nameOf, type JournalOpts } from "./activity-store";

export const UNRECOGNISED = "unrecognised account";

// The journal (Phase RT2, part 1.9). Everything but logActivity lives in
// activity-store.ts — the store, logAs, journalHealth, the readers — and is
// re-exported here, so callers keep importing from "./activity".
export * from "./activity-store";

// Convenience used across server actions: resolves the actor from the request's
// role context and appends. Never throws.
const clip = (v: string, max: number) => { const c = Array.from(String(v)); return c.length > max ? c.slice(0, max - 1).join("") + "…" : String(v); };

export async function logActivity(action: string, opts?: JournalOpts): Promise<boolean> {
  try {
    const ctx = await getRoleContext();
    const session = ctx.authEnabled ? await getSessionUser().catch(() => null) : null;
    const isLab = ctx.role === "lab";
    // only PTS's own people are named by address. A session with no role — an
    // account the portal does not recognise, e.g. a laboratory deactivated while
    // signed in — is never written by its address (it may be a laboratory's, §4.2)
    const isTeam = ctx.role === "manager" || ctx.role === "staff" || ctx.role === "auditor";
    const who = isLab ? LAB_ACTOR : isTeam && ctx.email ? ctx.email : ctx.email ? UNRECOGNISED : ctx.authEnabled ? "unknown" : "build";
    return await appendActivity({
      action,
      actorEmail: who,
      actorRole: ctx.role ?? "none",
      // the account, as it was then; a development persona is no account
      actorId: session?.userId ?? (ctx.persona ? "dev-persona" : undefined),
      actorName: isTeam && ctx.email ? await nameOf(ctx.email) : who,
      schemeId: opts?.schemeId,
      targetCode: opts?.targetCode,
      // a line's words bounded — a 20 000-character document key went whole into every reading of the
      // journal (round 5, R5SA-7); the facts are in before/after
      summary: clip(opts?.summary ?? action, 2000),
      subject: opts?.subject === undefined ? undefined : clip(opts.subject, 400),
      before: opts?.before,
      after: opts?.after,
    });
  } catch (e) {
    failed(action, e);
    return false;
  }
}


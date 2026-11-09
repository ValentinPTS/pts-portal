import { redirect } from "next/navigation";
import { getSessionUser } from "./auth";
import { getLabByEmail, getLab } from "./labs";
import { devPersonaLabId, devLabPersonaActive } from "./roles";
import type { Lab } from "./types";
import { getParticipantSignIn } from "./participant-session";

// Laboratory authorization (Phase 2b). A "lab" is a signed-in Supabase user whose
// email matches an ACTIVE `labs` row. Reuses the same session as owners; the role
// is decided by table membership, not a flag. Every lab query is scoped to the
// resolved lab id server-side, so a lab can only ever see its own data.

export interface LabSession {
  lab: Lab;
  userId: string;
}

export async function getLabSession(): Promise<LabSession | null> {
  // Development only (login off, `next dev`): a laboratory persona (part 1.4) is a
  // laboratory by id, resolved here like a signed-in one — every lab page and action
  // goes on scoping by this lab's id, so the persona sees only its own data.
  if (await devLabPersonaActive()) {
    const devLab = await devPersonaLabId();
    const lab = devLab ? await getLab(devLab) : null;
    return lab && lab.status === "active" ? { lab, userId: "dev-persona" } : null; // never the real session
  }
  const session = await getSessionUser();
  if (!session?.email) return null;
  // not a laboratory session yet (part 1.5): a temporary password still to change,
  // or an authenticator the lab enrolled but has not passed — every lab page, route
  // and action that reads the session refuses it the same way
  if (session.mustChangePassword || session.needsAal2) return null;
  const lab = await getLabByEmail(session.email);
  if (!lab || lab.status !== "active") return null;
  return { lab, userId: session.userId };
}

// THE gate for /lab/* pages and lab server actions. Redirects to the lab sign-in
// when the visitor isn't a signed-in active lab. (Owners are not labs — they use /.)
export async function requireLab(): Promise<LabSession> {
  // a temporary password from PTS is changed before anything else (part 1.5)
  if ((await getSessionUser())?.mustChangePassword) redirect("/auth/set-password?must=1");
  const ls = await getLabSession();
  if (!ls) {
    // a participant's user of a legal entity (4.4–4.6) has its own pages for now
    if (await getParticipantSignIn()) redirect("/lab/overview");
    redirect("/lab/login");
  }
  return ls;
}

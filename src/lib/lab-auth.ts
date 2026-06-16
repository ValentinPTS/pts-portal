import { redirect } from "next/navigation";
import { getSessionUser } from "./auth";
import { getLabByEmail } from "./labs";
import type { Lab } from "./types";

// Laboratory authorization (Phase 2b). A "lab" is a signed-in Supabase user whose
// email matches an ACTIVE `labs` row. Reuses the same session as owners; the role
// is decided by table membership, not a flag. Every lab query is scoped to the
// resolved lab id server-side, so a lab can only ever see its own data.

export interface LabSession {
  lab: Lab;
  userId: string;
}

export async function getLabSession(): Promise<LabSession | null> {
  const session = await getSessionUser();
  if (!session?.email) return null;
  const lab = await getLabByEmail(session.email);
  if (!lab || lab.status !== "active") return null;
  return { lab, userId: session.userId };
}

// THE gate for /lab/* pages and lab server actions. Redirects to the lab sign-in
// when the visitor isn't a signed-in active lab. (Owners are not labs — they use /.)
export async function requireLab(): Promise<LabSession> {
  const ls = await getLabSession();
  if (!ls) redirect("/lab/login");
  return ls;
}

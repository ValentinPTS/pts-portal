import { randomUUID } from "crypto";
import type { Application, ApplicationStatus } from "./types";
import { getScheme, updateSchemeWith } from "./store";

// Applications (заявки) live inside the scheme JSONB (scheme.applications) — no
// separate table/migration. Low volume per scheme, always loaded with it.
// All writes go through updateSchemeWith (locked read-modify-write): the array is
// rebuilt from the FRESH scheme inside the per-scheme lock, so a lab's submission
// can't be lost to a concurrent owner save (e.g. a standards reorder that also
// rewrites `applications`).

export async function listApplications(schemeId: string): Promise<Application[]> {
  return (await getScheme(schemeId))?.applications ?? [];
}

type NewApplication = Omit<Application, "id" | "schemeId" | "submittedAt" | "status">;

export async function addApplication(
  schemeId: string,
  input: NewApplication
): Promise<Application | null> {
  if (!(await getScheme(schemeId))) return null;
  const app: Application = {
    id: randomUUID(),
    schemeId,
    submittedAt: new Date().toISOString(),
    status: "pending",
    ...input,
  };
  await updateSchemeWith(schemeId, (s) => ({ applications: [...(s.applications ?? []), app] }));
  return app;
}

export async function setApplicationStatus(
  schemeId: string,
  appId: string,
  status: ApplicationStatus
): Promise<Application | null> {
  if (!(await getScheme(schemeId))) return null;
  let updated: Application | null = null;
  await updateSchemeWith(schemeId, (s) => {
    const applications = (s.applications ?? []).map((a) => {
      if (a.id !== appId) return a;
      updated = { ...a, status };
      return updated;
    });
    return { applications };
  });
  return updated;
}

import { randomUUID } from "crypto";
import type { Application, ApplicationStatus } from "./types";
import { getScheme, updateScheme } from "./store";

// Applications (заявки) live inside the scheme JSONB (scheme.applications) — no
// separate table/migration. Low volume per scheme, always loaded with it.

export async function listApplications(schemeId: string): Promise<Application[]> {
  return (await getScheme(schemeId))?.applications ?? [];
}

type NewApplication = Omit<Application, "id" | "schemeId" | "submittedAt" | "status">;

export async function addApplication(
  schemeId: string,
  input: NewApplication
): Promise<Application | null> {
  const scheme = await getScheme(schemeId);
  if (!scheme) return null;
  const app: Application = {
    id: randomUUID(),
    schemeId,
    submittedAt: new Date().toISOString(),
    status: "pending",
    ...input,
  };
  await updateScheme(schemeId, { applications: [...(scheme.applications ?? []), app] });
  return app;
}

export async function setApplicationStatus(
  schemeId: string,
  appId: string,
  status: ApplicationStatus
): Promise<Application | null> {
  const scheme = await getScheme(schemeId);
  if (!scheme) return null;
  const applications = (scheme.applications ?? []).map((a) => (a.id === appId ? { ...a, status } : a));
  await updateScheme(schemeId, { applications });
  return applications.find((a) => a.id === appId) ?? null;
}

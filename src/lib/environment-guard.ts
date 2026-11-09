import { portalEnvironment } from "./environment";

// The runtime half of «production and test cannot reach each other's data» (part
// 1.2). The build gate stops a mismatched deploy; this covers what never passed
// through it — `next start` or `next dev` with the real keys and PTS_ENVIRONMENT=test.
// Run once when a server starts (src/instrumentation.ts):
//   - test code on a database that is not the test one → the server refuses to start
//     (a banner saying «nothing here is real» over real data is the worst case);
//   - real code on a test database → a loud warning only, so a mistaken edit of the
//     real database's row cannot take the real portal down.
// A database that cannot be read here is left to the stores (they fail on their own).
export async function checkEnvironmentAtStart(env: Record<string, string | undefined> = process.env): Promise<void> {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_KEY;
  if (!url || !key) return; // memory: nothing to cross
  const code = portalEnvironment(env);
  let name: string | undefined;
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/app_environment?select=name`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return console.warn(`[environment] app_environment not readable (HTTP ${res.status}) — not checked at start.`);
    name = ((await res.json()) as { name?: string }[])[0]?.name;
  } catch (e) {
    return console.warn(`[environment] app_environment not readable (${(e as Error).message}) — not checked at start.`);
  }
  if (code === "test" && name !== "test") {
    throw new Error(`[environment] this is the TEST environment, but the database says it is ${name ? `«${name}»` : "nothing"} — refusing to start on what may be the real data. Check the keys.`);
  }
  if (code === "production" && name === "test") {
    console.error("[environment] the real portal is connected to the TEST database — check the keys of this deployment.");
  }
}

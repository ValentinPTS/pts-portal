// Next.js calls register() once when a server starts, before it serves a request.
export async function register() {
  // the Node.js server only (the check uses fetch with the server key)
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { checkEnvironmentAtStart } = await import("./lib/environment-guard");
  await checkEnvironmentAtStart(); // part 1.2: test code never starts on the real data
  // part 1.11: the authorised release now running in production is «in use» — in the
  // change register, by itself. Never blocks or fails the start.
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (process.env.VERCEL_ENV === "production" && sha) {
    const { markDeployed, releaseFor } = await import("./lib/change-register");
    void markDeployed(sha);
    // a release running without an authorised entry (a rollback, a promote without
    // a build) is said loudly — the system check shows it too
    void releaseFor(sha).then((e) => { if (!e) console.error(`[change-register] commit ${sha} is running WITHOUT an authorised entry in the change register`); }).catch(() => null);
  }
}

// The test environment (plan part 1.2, Реш. 130–133): which portal this is, and
// that the test one mails only PTS's own test mailboxes (D21), never a laboratory.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { portalEnvironment, isTestEnvironment, mailAllowedHere, testSubject, looksLikeSimNumber } from "../src/lib/environment.ts";
import { checkEnvironmentAtStart } from "../src/lib/environment-guard.ts";
import { createServer } from "node:http";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const run = promisify(execFile);
const root = fileURLToPath(new URL("..", import.meta.url));

t("nothing set → the real portal", portalEnvironment({}) === "production");
t("PTS_ENVIRONMENT=test → the test environment", portalEnvironment({ PTS_ENVIRONMENT: "test" }) === "test" && isTestEnvironment({ PTS_ENVIRONMENT: "test" }));
t("any other value → the real portal", portalEnvironment({ PTS_ENVIRONMENT: "Test " }) === "production");
t("real portal: any address may be mailed", mailAllowedHere("lab@example.com", {}));
const T = { PTS_ENVIRONMENT: "test" };
t("test: a PTS mailbox may be mailed", mailAllowedHere("sim-lab-1@ptsbg.eu", T) && mailAllowedHere("  Office@PTSBG.EU ", T));
t("test: a laboratory's address may not", !mailAllowedHere("lab@example.com", T));
t("test: a look-alike domain may not", !mailAllowedHere("x@ptsbg.eu.example.com", T) && !mailAllowedHere("x@notptsbg.eu", T));
t("test: a list sneaking a real address may not", !mailAllowedHere("evil@gmail.com,x@ptsbg.eu", T) && !mailAllowedHere("a@b@ptsbg.eu", T) && !mailAllowedHere("a b@ptsbg.eu", T) && !mailAllowedHere("<x@ptsbg.eu>", T));
t("subject: marked in the test environment", testSubject("Hello", T) === "[ТЕСТ / TEST] Hello" && testSubject("Hello", {}) === "Hello");
for (const v of ["SIM 26/03-T-1", "SIM-26/03-T-1", "sim26/03", " S I M 26", "SIМ 26/03-T-1", "ЅІМ 26"]) t(`a simulation number: «${v}»`, looksLikeSimNumber(v));
for (const v of ["PTS 26/03-T-1", "26/03-T-1", "ISM 26", ""]) t(`not a simulation number: «${v}»`, !looksLikeSimNumber(v));

// the start-up guard against a fake database
let envName: unknown = [{ name: "production" }];
let status = 200;
const server = createServer((_req, res) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(envName)); });
await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
const fake = { NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${(server.address() as { port: number }).port}`, SUPABASE_KEY: "k" };
const starts = async (env: Record<string, string>) => { try { await checkEnvironmentAtStart(env); return "started"; } catch (e) { return `refused: ${(e as Error).message}`; } };
t("start: test code on the REAL database → refuses to start", /^refused: .*TEST environment.*«production»/.test(await starts({ ...fake, PTS_ENVIRONMENT: "test" })));
envName = [];
t("start: test code on a database that says nothing → refuses", /^refused:/.test(await starts({ ...fake, PTS_ENVIRONMENT: "test" })));
envName = [{ name: "test" }];
t("start: test code on the test database → starts", (await starts({ ...fake, PTS_ENVIRONMENT: "test" })) === "started");
t("start: the real portal on the TEST database → starts, only warns", (await starts({ ...fake })) === "started");
status = 404;
t("start: unreadable → left to the stores, starts", (await starts({ ...fake, PTS_ENVIRONMENT: "test" })) === "started");
t("start: no database → nothing to check", (await starts({ PTS_ENVIRONMENT: "test" })) === "started");
server.close();

// sendEmail itself refuses in the test environment — before any network call
const probe = async (env: Record<string, string>, js: string) => {
  try {
    const r = await run("node", ["--import", "./scripts/ts-ext-hook.mjs", "--input-type=module", "-e", js], { cwd: root, env: { PATH: process.env.PATH ?? "", ...env } });
    return r.stdout.trim();
  } catch (e) { return ((e as { stdout?: string }).stdout ?? "").trim() || "crashed"; }
};
const mailEnv = { MAIL_PROVIDER: "sendgrid", MAIL_API_KEY: "x", MAIL_FROM: "PTS <office@ptsbg.eu>", PTS_ENVIRONMENT: "test" };
// fetch is stubbed in the child: a broken guard is caught here, never by a real mail service
const js = (to: string) => `let net = 0; globalThis.fetch = async () => { net++; return new Response("{}", { status: 202 }); };
  const m = await import("./src/lib/mail.ts"); const r = await m.sendEmail({ to: "${to}", subject: "s", text: "t" }); console.log(JSON.stringify({ ...r, net }));`;
const r = JSON.parse((await probe(mailEnv, js("lab@example.com"))) || "{}");
t("sendEmail in the test environment: a laboratory is skipped, nothing sent", r.ok === false && r.skipped === true && r.net === 0 && /only @ptsbg\.eu/.test(r.error ?? ""), JSON.stringify(r));
const r2 = JSON.parse((await probe(mailEnv, js("sim-lab-1@ptsbg.eu"))) || "{}");
t("sendEmail in the test environment: a PTS mailbox is sent", r2.ok === true && r2.net === 1, JSON.stringify(r2));

console.log(`environment.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

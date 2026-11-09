// Run every scripts/*.test.ts and refuse to call a silent suite a passing one (the
// zsh runner of before, in Node so it runs anywhere — CI, the Vercel build; part 1.11).
//
// Why a summary is insisted on: when the resolve hook once stopped registering,
// eight suites crashed before their first assertion, printed a stack trace and no
// summary — and a loop that grepped for «N passed» called that nothing to report. A
// suite that does not run must be as loud as one that fails.
//
// Each suite runs with a CLEAN environment: no database key, no mail key, no Vercel
// variable — on a build machine that holds the real secrets, a test can never reach
// the real database or send a real e-mail. Everything runs in memory.
import { readdirSync } from "node:fs";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const suites = readdirSync(join(root, "scripts")).filter((f) => f.endsWith(".test.ts")).sort();
const env = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", TMPDIR: process.env.TMPDIR ?? "/tmp", LANG: "C.UTF-8", TZ: process.env.TZ ?? "" };

const run = (file) => new Promise((res) => {
  execFile(process.execPath, ["--import", "./scripts/ts-ext-hook.mjs", join("scripts", file)], { cwd: root, env, maxBuffer: 64 * 1024 * 1024, timeout: 10 * 60 * 1000 },
    (err, stdout, stderr) => res({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, out: `${stdout}${stderr}` }));
});

let assertions = 0, ran = 0;
const bad = [];
for (const file of suites) {
  const name = file.replace(/\.ts$/, "");
  const { code, out } = await run(file);
  // the prefix is conventional, not required — only announcing nothing is fatal
  const line = out.split("\n").map((l) => l.trim()).filter((l) => new RegExp(`^(${name.replace(/[.]/g, "\\.")}: )?\\d+ passed, \\d+ failed$`).test(l)).pop();
  if (!line) {
    console.log(`  ${name.padEnd(30)} NO SUMMARY (exit ${code}) — the suite did not run`);
    out.split("\n").filter((l) => /Error|error:/.test(l)).slice(0, 3).forEach((l) => console.log(`      ${l}`));
    bad.push(name);
    continue;
  }
  const [, passed, failed] = line.match(/(\d+) passed, (\d+) failed$/).map(Number);
  assertions += passed;
  ran++;
  if (failed > 0 || code !== 0) {
    console.log(`  ${name.padEnd(30)} ${line}  ✗`);
    out.split("\n").filter((l) => /^(FAIL|✗)/.test(l)).slice(0, 8).forEach((l) => console.log(`      ${l}`));
    bad.push(name);
  } else {
    console.log(`  ${name.padEnd(30)} ${passed} passed`);
  }
}
console.log("─────────────────────────────────────────────");
console.log(`${ran} suites, ${assertions} assertions`);
if (bad.length) {
  console.log(`FAILED: ${bad.join(" ")}`);
  process.exit(1);
}
console.log("all green");

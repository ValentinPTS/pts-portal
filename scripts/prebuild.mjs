// What runs before `next build` (npm "prebuild"; plan parts 1.1 and 1.11).
//
//   1. the migration gate — a forgotten migration cannot deploy (check-migrations.mjs)
//   2. the release gate — production deploys only an authorised commit (check-release.mjs)
//   3. on Vercel, the four gates themselves: types, lint, the tests — then the build
//      is the fourth. «Only a green build deploys»: a red one never reaches the site,
//      whatever was or was not run before the push. (The tests run with no secrets —
//      scripts/run-tests.mjs — so they can never touch the real database.)
//
// Locally only the migration gate runs (it reports, never fails, without a database);
// run the gates yourself: npx tsc --noEmit · npm run lint · npm test.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const onVercel = !!process.env.VERCEL || !!process.env.VERCEL_ENV;
const step = (title, cmd, args) => {
  console.log(`\n▸ ${title}`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", env: process.env });
  if (r.status !== 0) {
    console.error(`\n✗ ${title} failed — the build stops here; nothing is deployed.\n`);
    process.exit(r.status ?? 1);
  }
};

step("migration gate", process.execPath, ["scripts/check-migrations.mjs"]);
step("release gate", process.execPath, ["scripts/check-release.mjs"]);
if (onVercel) {
  step("types (tsc)", process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "--noEmit"]);
  step("lint (eslint)", process.execPath, [join(root, "node_modules/eslint/bin/eslint.js")]);
  step("tests (in memory, no secrets)", process.execPath, ["scripts/run-tests.mjs"]);
}

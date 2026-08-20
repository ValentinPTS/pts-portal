// The resolve hook itself. Runs on Node's module-customization thread, loaded by
// ts-ext-hook.mjs — see the note there for why the two files are separate.
//
// Lets extensionless relative imports (./foo) resolve to ./foo.ts, so the test
// scripts can import the app's own source modules under --experimental-strip-types.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, next) {
  if (specifier.startsWith(".") && !/\.[mc]?[jt]s$/.test(specifier)) {
    // try ./foo.ts, then ./foo/index.ts (directory import) — same as the bundler
    for (const cand of [specifier + ".ts", specifier + "/index.ts"]) {
      try {
        const url = new URL(cand, context.parentURL);
        if (existsSync(fileURLToPath(url))) return next(cand, context);
      } catch {
        /* fall through */
      }
    }
  }
  return next(specifier, context);
}

// Resolve hook: lets extensionless relative imports (./foo) resolve to ./foo.ts,
// so test scripts can import the app's source modules under --experimental-strip-types.
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

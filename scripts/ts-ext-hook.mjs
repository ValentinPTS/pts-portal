// Entry point for `node --import ./scripts/ts-ext-hook.mjs <test>`.
//
// WHY TWO FILES. This used to export `resolve` directly, which worked while Node
// installed loader hooks from the --import'ed module itself. Node no longer does:
// hooks must be handed to module.register(), and a plain exported `resolve` is
// simply ignored — SILENTLY. Nothing warned; the suites that import app modules by
// an extensionless path (notify-events → "./notifications") just died with
// ERR_MODULE_NOT_FOUND before their first assertion, and a runner that only greps
// for a summary line reads that as "no output", not as a failure. Eight of the
// twenty-one suites were passing that way for nothing.
//
// register() loads the hook on its own thread, so the resolve function has to live
// in a separate module — hence ts-ext-resolve.mjs.
import { register } from "node:module";

register("./ts-ext-resolve.mjs", import.meta.url);

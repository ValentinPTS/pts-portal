import { upsertCustomSkin, setDefaultSkinId } from "../src/lib/custom-skins.ts";
import { sanitizeSkinData } from "../src/skins/custom.ts";
import { getSkinAsync, skinsForTypeAsync, resolveSkinAsync } from "../src/skins/index.ts";
import { getDoc } from "../src/lib/documents.ts";
import { withSkin } from "../src/lib/doc-shell.ts";
import { pavingBlocks } from "../src/lib/seed-paving-blocks.ts";

// End-to-end wiring of custom skins through the registry + render path. A bare
// node script has no Supabase env, so getDb() is null → the in-memory store is
// used and NOTHING is written to the real database.

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error("✗ " + n); } };

const data = sanitizeSkinData({
  name: "Wiring Test", scope: "T", base: "classic",
  colors: { primary: "#ff0000", accent: "#0000ff", heading: "#008800", bg: "#ffffff" },
  fonts: { heading: "Montserrat", body: "Lora" },
  logo: "default",
}, "wiring-skin-1");
await upsertCustomSkin(data);

const tList = await skinsForTypeAsync("T");
ok("testing list includes the custom skin", tList.some((s) => s.meta.id === "wiring-skin-1"));
ok("testing list still has the built-ins", ["classic", "modern", "minimal"].every((id) => tList.some((s) => s.meta.id === id)));

const cList = await skinsForTypeAsync("C");
ok("calibration list excludes a testing-only custom skin", !cList.some((s) => s.meta.id === "wiring-skin-1"));

const sk = await getSkinAsync("wiring-skin-1");
ok("getSkinAsync compiles the custom skin", sk.meta.id === "wiring-skin-1");
ok("custom heading colour in CSS", sk.css.includes("#008800"));
ok("custom accent colour in CSS", sk.css.includes("#0000ff"));

ok("unknown id falls back to classic", (await getSkinAsync("does-not-exist")).meta.id === "classic");

// Persisted default resolves for a scheme that hasn't chosen a skin.
await setDefaultSkinId("T", "wiring-skin-1");
const resolved = await resolveSkinAsync({ ...pavingBlocks, skin: undefined });
ok("persisted default resolves to the custom skin", resolved.meta.id === "wiring-skin-1");
await setDefaultSkinId("T", "classic"); // reset

// A scheme that explicitly chose the skin renders its documents in it.
const html = withSkin(sk, () => getDoc("plan")!.render!({ ...pavingBlocks, skin: "wiring-skin-1" }, "bg"));
ok("document renders the custom cover", html.includes("ccover"));
ok("document carries the custom heading colour", html.includes("#008800"));

console.log(`\nskin-wiring.test: ${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;

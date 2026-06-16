import { getDoc } from "../src/lib/documents.ts";
import { withSkin, BODY_START, BODY_END } from "../src/lib/doc-shell.ts";
import { getSkin, skinsForType } from "../src/skins/index.ts";
import { pavingBlocks } from "../src/lib/seed-paving-blocks.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error("✗ " + n); } };
const render = getDoc("plan")!.render!;
const body = (html: string) => html.slice(html.indexOf(BODY_START) + BODY_START.length, html.indexOf(BODY_END));

const classic = render(pavingBlocks, "bg");
const modern = withSkin(getSkin("modern"), () => render(pavingBlocks, "bg"));
const minimal = withSkin(getSkin("minimal"), () => render(pavingBlocks, "bg"));

ok("classic keeps the brand palette", classic.includes("--green:#88a77b"));
ok("classic cover block", classic.includes('<div class="cover">'));
ok("modern retheme applied", modern.includes("--green:#357a4f"));
ok("modern custom cover layout", modern.includes('class="mcover"') && modern.includes('class="mband"'));
ok("modern shell differs from classic", modern !== classic);
ok("minimal custom cover layout", minimal.includes("mincover"));
ok("minimal shell differs", minimal !== classic && minimal !== modern);
ok("BODY identical: classic vs modern", body(classic) === body(modern));
ok("BODY identical: classic vs minimal", body(classic) === body(minimal));
ok("body markers present", classic.includes(BODY_START) && classic.includes(BODY_END));
ok("unknown skin falls back to classic", getSkin("nope").meta.id === "classic");
ok("testing offers 2 skins (classic+modern+minimal)", skinsForType("T").length === 3);
ok("calibration excludes testing-only modern", skinsForType("C").map(s=>s.meta.id).sort().join(",") === "classic,minimal");

console.log(`\nskins.test: ${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;

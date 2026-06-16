import {
  sanitizeSkinData, compileSkin, previewDocHtml, skinCss, basePreset,
  type CustomSkinData,
} from "../src/skins/custom.ts";

// Security + correctness tests for user-created skins. The skin data becomes CSS
// and HTML attributes, so the validator (sanitizeSkinData) is a trust boundary and
// the renderers (skinCss/coverHtml) must be defensive even on un-sanitized input.

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error("✗ " + n); } };

// 1. Valid data passes through untouched.
const good = sanitizeSkinData({
  name: "Forest Pro", scope: "T", base: "modern",
  colors: { primary: "#123456", accent: "#abcdef", heading: "#000000", bg: "#ffffff" },
  fonts: { heading: "Montserrat", body: "Lora" },
  logo: "default",
  elements: [{ key: "title", shown: true, align: "left" }],
}, "id1");
ok("name kept", good.name === "Forest Pro");
ok("scope kept", good.scope === "T");
ok("valid colour kept", good.colors.primary === "#123456");
ok("valid heading font kept", good.fonts.heading === "Montserrat");
ok("valid body font kept", good.fonts.body === "Lora");
ok("all 7 element keys present", good.elements.length === 7);

// 2. CSS-injection via a colour is rejected → falls back to the base preset.
const evil = sanitizeSkinData({
  name: "x", base: "classic",
  colors: { primary: "#000;}</style><script>alert(1)</script>{x:" },
}, "id2");
ok("malicious colour rejected", evil.colors.primary === basePreset("classic").colors.primary);
const evilCss = skinCss(evil);
ok("compiled CSS has no <script>", !evilCss.includes("<script>"));
ok("compiled CSS has no </style>", !evilCss.toLowerCase().includes("</style>"));

// 2b. skinCss is defensive even on UN-sanitized data (e.g. a hand-edited DB row).
const rawEvil = skinCss({
  ...basePreset("classic"), id: "x", name: "x", scope: "both",
  colors: { primary: "red;}*{display:none}", accent: "#fff", heading: "#000", bg: "#fff" },
} as unknown as CustomSkinData);
ok("defensive CSS drops bad colour", !rawEvil.includes("display:none"));

// 3. Font outside the allow-list is rejected.
const ef = sanitizeSkinData({
  name: "x", base: "classic",
  fonts: { heading: "Comic Sans'; background:url(http://evil)", body: "PT Serif" },
}, "id3");
ok("non-allow-listed font rejected", ef.fonts.heading === basePreset("classic").fonts.heading);

// 4. Logo URL allow-list: javascript: rejected, https + /brand kept.
ok("javascript: logo rejected", sanitizeSkinData({ name: "x", base: "classic", logo: "javascript:alert(1)" }, "i").logo === "default");
ok("data: logo rejected", sanitizeSkinData({ name: "x", base: "classic", logo: "data:text/html,<script>" }, "i").logo === "default");
ok("https logo kept", sanitizeSkinData({ name: "x", base: "classic", logo: "https://cdn.example.com/logo.png" }, "i").logo === "https://cdn.example.com/logo.png");
ok("/brand logo kept", sanitizeSkinData({ name: "x", base: "classic", logo: "/brand/alt.png" }, "i").logo === "/brand/alt.png");
ok("logo with quote rejected", sanitizeSkinData({ name: "x", base: "classic", logo: 'https://x/"onerror=1' }, "i").logo === "default");

// 5. Name: angle brackets stripped, length capped.
ok("name angle brackets stripped", sanitizeSkinData({ name: "<b>Hi</b>", base: "classic" }, "i").name === "bHi/b");
ok("name length capped at 60", sanitizeSkinData({ name: "z".repeat(200), base: "classic" }, "i").name.length === 60);
ok("blank name → default", sanitizeSkinData({ name: "   ", base: "classic" }, "i").name === "My skin");

// 6. Unknown / duplicate element keys dropped; missing keys filled from preset.
const elT = sanitizeSkinData({
  name: "x", base: "classic",
  elements: [{ key: "evil" }, { key: "logo", shown: false, align: "right" }, { key: "logo", shown: true }],
}, "i");
ok("unknown element key dropped", !elT.elements.some((e) => (e.key as string) === "evil"));
ok("duplicate element key de-duped", elT.elements.filter((e) => e.key === "logo").length === 1);
ok("explicit element ordered first", elT.elements[0].key === "logo" && elT.elements[0].shown === false && elT.elements[0].align === "right");
ok("missing keys back-filled", elT.elements.length === 7);
ok("bad align coerced to center", sanitizeSkinData({ name: "x", base: "classic", elements: [{ key: "title", shown: true, align: "diagonal" }] }, "i").elements.find((e) => e.key === "title")!.align === "center");

// 6b. New cover controls: size / density / band guards + preset inheritance.
ok("element size default m", sanitizeSkinData({ name: "x", base: "classic", elements: [{ key: "title", shown: true, align: "left" }] }, "i").elements.find((e) => e.key === "title")!.size === "m");
ok("bad element size → m", sanitizeSkinData({ name: "x", base: "classic", elements: [{ key: "title", shown: true, align: "left", size: "huge" }] }, "i").elements.find((e) => e.key === "title")!.size === "m");
ok("valid element size kept", sanitizeSkinData({ name: "x", base: "classic", elements: [{ key: "title", shown: true, align: "left", size: "l" }] }, "i").elements.find((e) => e.key === "title")!.size === "l");
ok("bad density → normal", sanitizeSkinData({ name: "x", base: "classic", density: "spacious" }, "i").density === "normal");
ok("valid density kept", sanitizeSkinData({ name: "x", base: "classic", density: "airy" }, "i").density === "airy");
ok("density inherits base when absent", sanitizeSkinData({ name: "x", base: "modern" }, "i").density === "airy");
ok("band inherits base when absent (banded → on)", sanitizeSkinData({ name: "x", base: "banded" }, "i").band.on === true);
ok("band default off on classic", sanitizeSkinData({ name: "x", base: "classic" }, "i").band.on === false);
const bandInj = sanitizeSkinData({ name: "x", base: "classic", band: { on: true, color: "url(javascript:alert(1))" } }, "i");
ok("malicious band colour → primary enum", bandInj.band.color === "primary" && bandInj.band.on === true);
ok("band CSS uses only a hex colour", !skinCss(sanitizeSkinData({ name: "x", base: "classic", band: { on: true, color: "url(x)" }, colors: { primary: "#123456", accent: "#222", heading: "#333", bg: "#fff" } }, "i")).includes("javascript"));
ok("new base 'editorial' accepted", sanitizeSkinData({ name: "x", base: "editorial" }, "i").base === "editorial");
ok("unknown base → classic", sanitizeSkinData({ name: "x", base: "spacey" }, "i").base === "classic");
ok("cover rows carry data-key", previewDocHtml(sanitizeSkinData({ name: "x", base: "classic" }, "i"), "bg").includes('data-key="title"'));

// 7. compileSkin: scope → types.
ok("scope T → [T]", compileSkin(good).meta.types.join(",") === "T");
ok("scope both → [T,C]", compileSkin(sanitizeSkinData({ name: "x", scope: "both", base: "classic" }, "i")).meta.types.join(",") === "T,C");

// 8. previewDocHtml renders the cover + sample, no injection.
const html = previewDocHtml(good, "bg");
ok("preview has the cover", html.includes("ccover"));
ok("preview shows sample scheme number", html.includes("PTS 26/04-T-1"));
ok("preview is a full document", html.startsWith("<!DOCTYPE html>") && html.includes("</html>"));

console.log(`\ncustom-skins.test: ${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;

// Redesign R5 (2026-11-18, direction A): pictures and gentle motion. Nine pictures (made with Higgsfield from generic
// scenes — nothing of the portal's data in any prompt), kept in the portal as small WebP files and shown as decoration
// where they help a person feel where they are; and soft, short motion only for who has not asked the device for
// less, on the screen only. The security guard is untouched: the pictures live under a path that is public to it.
import { readFileSync, statSync } from "node:fs";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const bytes = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url));

// ── the pictures: in the portal, small, the size the page says (read from the component — it is JSX) ──
const pic = read("src/components/ui/Picture.tsx");
const PICTURE_SIZE: Record<string, [number, number]> = Object.fromEntries([...(pic.match(/PICTURE_SIZE[^=]*= \{([\s\S]*?)\n\};/)?.[1] ?? "").matchAll(/"?([a-z-]+)"?: \[(\d+), (\d+)\]/g)].map((m) => [m[1], [Number(m[2]), Number(m[3])]]));
const names = Object.keys(PICTURE_SIZE);
t("R5: nine pictures", names.length === 9);
for (const n of names) {
  const p = `public/brand/pictures/${n}.webp`;
  let b: Buffer | null = null;
  try { b = bytes(p); } catch { /* missing */ }
  t(`R5: ${n} — a WebP file in the portal (no outside link at run time)`, !!b && b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP");
  t(`R5: ${n} — small (≤ 40 KB)`, !!b && statSync(new URL(`../${p}`, import.meta.url)).size <= 40 * 1024);
  // VP8 (lossy) keeps the width and height at bytes 26–29 (14 bits each)
  if (b && b.subarray(12, 16).toString() === "VP8 ") {
    const w = b.readUInt16LE(26) & 0x3fff, h = b.readUInt16LE(28) & 0x3fff;
    t(`R5: ${n} — ${PICTURE_SIZE[n][0]}×${PICTURE_SIZE[n][1]}, as the page reserves (no jump while it loads)`, w === PICTURE_SIZE[n][0] && h === PICTURE_SIZE[n][1], `${w}×${h}`);
  }
}
t("R5: a picture is decoration — alt=\"\" (the words beside it carry the meaning)", /alt=""/.test(pic));
t("R5: served as it is (already sized) — no optimiser round trip", /\bunoptimized\b/.test(pic));
t("R5: …from /brand/pictures/", /src=\{`\/brand\/pictures\/\$\{name\}\.webp`\}/.test(pic));

// ── the security guard: untouched — /brand/ is public to it; a picture asked for from a portal path is still refused ──
const proxy = read("src/proxy.ts");
t("R5: /brand/ is a public path to the proxy (so a picture there loads)", /const PUBLIC_PATH = .*\|brand\\\/\|/.test(proxy));
t("R5: …and the guard still refuses a portal page asked for as a picture (R3S-2 kept)", /const NOT_A_PAGE = new Set\(\["image",/.test(proxy) && /if \(!publicPath && notAPage\(request\)\) return new NextResponse\(null, \{ status: 403 \}\);/.test(proxy));

// ── where they are ──
for (const f of ["src/app/lab/login/page.tsx", "src/app/login/page.tsx"])
  t(`R5: ${f} — the welcome picture above the form`, /<Picture name="welcome" className="ui-pic-welcome" \/>\s*<LoginForm/.test(read(f)));
const home = read("src/app/lab/overview/page.tsx");
t("R5: the lab's calm «nothing needed now» has its picture (and keeps its words and grey card)", /<Picture name="nothing-to-do" className="ui-pic-scene" \/>\{L\("Сега не е нужно нищо от вас/.test(home) && /ui-card ui-card-later/.test(home));
t("R5: no participation yet — the picture, the words, and where to start (Заявяване)", /data-no-participations/.test(home) && /<Picture name="no-participations"/.test(home) && /<Link href="\/lab\/apply" className="ui-btn ui-btn-sm"/.test(home));
const part = read("src/app/lab/p/[id]/page.tsx");
t("R5: the certificate's «done» moment — only when the certificate is released, to the same address the documents list gives",
  /\{hasCert && \(\s*<section className="ui-card" data-certificate-ready/.test(part)
  && (part.match(/`\/lab\/doc\/\$\{s\.id\}\/certificate\?lang=\$\{lang\}&p=\$\{encodeURIComponent\(v\.participantId\)\}`/g) ?? []).length === 2);
const help = read("src/components/HelpContent.tsx");
t("R5: every help step has its picture (the lab's 5, the team's 6)", (help.match(/pic: "[a-z-]+"/g) ?? []).length === 11 && /<Picture name=\{s\.pic\} className="ui-pic-step" \/>/.test(help));
const states = read("src/components/States.tsx");
t("R5: an empty page may show its picture (the lab's «Все още няма схеми», no applications yet)", /picture \? <Picture name=\{picture\}/.test(states) && /picture="no-participations"/.test(read("src/app/lab/page.tsx")) && /picture="no-participations"/.test(read("src/app/schemes/[id]/applications/page.tsx")));

// ── motion: gentle, on the screen only, never for who asked for less ──
const css = read("src/app/globals.css");
const r5 = css.slice(css.indexOf("Redesign R5"));
const motion = r5.match(/@media screen and \(prefers-reduced-motion: no-preference\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
t("R5: all the motion is inside «screen and no-preference» — with «reduce motion», or in print, nothing moves", motion.length > 0 && !/animation:|@keyframes/.test(r5.replace(/@media screen and \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/, "")));
t("R5: a page only fades in (opacity — nothing moves under the pointer)", /main > \* \{ animation: ui-fade 0\.24s/.test(motion) && /@keyframes ui-fade \{ from \{ opacity: 0; \} to \{ opacity: 1; \} \}/.test(motion));
t("R5: short — nothing longer than 0.5s, the glow of the step that is yours twice and then rests", [...motion.matchAll(/animation: [a-z-]+ ([\d.]+)s/g)].every((m) => Number(m[1]) <= 0.5 || m[0].startsWith("animation: ui-ring")) && /animation: ui-ring 1\.6s ease-in-out 0\.4s 2;/.test(motion));
t("R5: the glow only on the full path (the compact line stays still)", /\.ui-path:not\(\.ui-path-compact\) \.ui-path-now \.ui-path-dot \{ animation: ui-ring/.test(motion));

console.log(`ui-r5.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

// Plan part 10.4 — the certificate register's lookup (D20; Реш. 55, 56, 93, 115): the number AND the code;
// «valid» with Реш. 56's data or «invalid» — never which part was wrong, never the code; released ones only
// (never a simulation's); no partial query; 10 failed an hour from one address; the address only as a keyed
// hash with the hour.
import { readFileSync } from "node:fs";
import { readQuery, findCertificate, answerOf, hourOf, limited, MAX_FAILED_PER_HOUR } from "../src/lib/cert-register-model.ts";
import { lookupCertificate, addressKey, requestAddress, normAddress } from "../src/lib/cert-register.ts";
import { addScheme } from "../src/lib/store.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");

const rel = { by: "head@ptsbg.eu", at: "2026-10-02T10:00:00Z", langs: ["bg", "en"] };
const scheme = (id: string, more: Record<string, unknown>) => ({
  id, number: "PTS 26/01-T-1", type: "T", status: "report", titleBg: "Т", titleEn: "T", objectBg: "Бетонни блокчета", objectEn: "Concrete blocks",
  parameters: [{ characteristicBg: "Якост", characteristicEn: "Strength" }, { characteristicBg: "Размери", characteristicEn: "Dimensions" }],
  reportIssues: [{ r: 1 }], ...more,
}) as never;
const S1 = scheme("s1", { certificates: {
  "C07": { no: "PTS 26/01-T-1-12345", date: "2026-10-02", registeredAt: "x", released: rel, content: { scope: [{ key: "0", bg: "Якост", en: "Strength" }], text: {} } },
  "C08": { no: "PTS 26/01-T-1-22222", date: "2026-10-02", registeredAt: "x" }, // numbered, never released
  "C09": { no: "PTS 26/01-T-1-33333", date: "2026-10-02", simulation: true, released: rel },
} });
const DRAFT = scheme("s2", { status: "draft", certificates: { "C07": { no: "PTS 26/02-T-1-44444", date: "2026-10-02", registeredAt: "x", released: rel } } });
const ARCH = scheme("s3", { archivedAt: "x", certificates: { "C01": { no: "PTS 26/01-T-1-55555", date: "2026-10-02", registeredAt: "x", released: rel } } });
const all = [S1, DRAFT, ARCH];
const q = (number: string, code: string) => readQuery({ number, code })!;

// ── the query and the finding ──
t("a whole query only: the number and the code, within their limits (Реш. 55)", readQuery({ number: "x", code: "" }) === null && readQuery({ number: "", code: "C07" }) === null && readQuery({ number: "a".repeat(61), code: "C07" }) === null && JSON.stringify(readQuery({ number: "  PTS 26/01-T-1-12345 ", code: " c07 " })) === JSON.stringify({ number: "PTS 26/01-T-1-12345", code: "c07" }));
t("found by the number AND the code — the number as the register writes it, either alphabet; the code's case aside", findCertificate(all, q("PTS 26/01-T-1-12345", "C07"))?.code === "C07" && findCertificate(all, q("РТS 26/1-Т-01 – 12345", "c07"))?.code === "C07");
t("a wrong code or a wrong number — nothing found, the same way (never which part was wrong)", findCertificate(all, q("PTS 26/01-T-1-12345", "C08")) === null && findCertificate(all, q("PTS 26/01-T-1-12346", "C07")) === null);
t("a number never released, a simulation's, a draft's, an archived scheme's — invalid", findCertificate(all, q("PTS 26/01-T-1-22222", "C08")) === null && findCertificate(all, q("PTS 26/01-T-1-33333", "C09")) === null && findCertificate(all, q("PTS 26/02-T-1-44444", "C07")) === null && findCertificate(all, q("PTS 26/01-T-1-55555", "C01")) === null);
const ans = answerOf(findCertificate(all, q("PTS 26/01-T-1-12345", "C07"))!, "Лаборатория Пример");
t("Реш. 56's data: the laboratory, the kind and the activity, the object, the characteristics on the certificate, the number and the date", ans.valid && ans.laboratory === "Лаборатория Пример" && ans.kind.key === "PT" && ans.activity?.key === "T" && ans.object.bg === "Бетонни блокчета" && ans.characteristics.length === 1 && ans.characteristics[0].en === "Strength" && ans.number === "PTS 26/01-T-1-12345" && ans.date === "2026-10-02");
t("…never the code (Реш. 115), never a result", !JSON.stringify(ans).includes("C07") && !/score|conclusion|results|En\b|z-/.test(JSON.stringify(ans)));

// ── the limit ──
t("10 failed an hour from one address — then limited", !limited(MAX_FAILED_PER_HOUR - 1) && limited(MAX_FAILED_PER_HOUR) && hourOf(Date.parse("2026-11-11T10:59:59Z")) === "2026-11-11T10");
t("the address kept only as a keyed hash with the hour — never itself; another hour, another key", /^[0-9a-f]{64}$/.test(addressKey("203.0.113.5", "2026-11-11T10")) && !addressKey("203.0.113.5", "2026-11-11T10").includes("203") && addressKey("203.0.113.5", "2026-11-11T10") !== addressKey("203.0.113.5", "2026-11-11T11"));
const AT = Date.parse("2026-11-11T10:05:00Z");
const outs: string[] = [];
for (let i = 0; i < MAX_FAILED_PER_HOUR + 1; i++) outs.push((await lookupCertificate({ number: `PTS 26/01-T-1-9${String(i).padStart(4, "0")}`, code: "X1" }, "198.51.100.7", AT)).state);
t("…invalid ten times, the eleventh limited", outs.slice(0, 10).every((o) => o === "invalid") && outs[10] === "limited", outs.join());
t("…another address is not limited; the next hour, neither", (await lookupCertificate({ number: "PTS 26/01-T-1-90000", code: "X1" }, "198.51.100.8", AT)).state === "invalid" && (await lookupCertificate({ number: "PTS 26/01-T-1-90000", code: "X1" }, "198.51.100.7", AT + 3600_000)).state === "invalid" && (await lookupCertificate({ number: "", code: "" }, "198.51.100.9", AT)).state === "incomplete");
t("the address: the platform's own header first, else the first forwarded one", requestAddress(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" })) === "203.0.113.9" && requestAddress(new Headers({ "x-vercel-forwarded-for": "198.51.100.1", "x-forwarded-for": "6.6.6.6" })) === "198.51.100.1" && requestAddress(new Headers({})) === "unknown");

// ── 10.4 review: the ticket — taken before the look, given back only by a valid answer ──
const burst = await Promise.all(Array.from({ length: 15 }, (_, i) => lookupCertificate({ number: `PTS 26/01-T-1-8${String(i).padStart(4, "0")}`, code: "07" }, "198.51.100.20", AT)));
t("a burst at once from one address: ten looked at, the rest limited — never 99 codes in one go", burst.filter((r) => r.state === "invalid").length === 10 && burst.filter((r) => r.state === "limited").length === 5, burst.map((r) => r.state).join());
const N1 = "PTS 26/01-T-1-77777";
const perNumber = [];
for (let i = 0; i < 21; i++) perNumber.push((await lookupCertificate({ number: N1, code: String(i).padStart(2, "0") }, `192.0.2.${i + 1}`, AT)).state);
t("one number from many addresses: 20 failed, then limited for everyone (a spelling of it counts as it)", perNumber.slice(0, 20).every((x) => x === "invalid") && perNumber[20] === "limited" && (await lookupCertificate({ number: "РТС 26/1-Т-01 – 77777", code: "99" }, "192.0.2.200", AT)).state === "limited", perNumber.join());
t("an IPv6 address counted by its /64; an IPv4-in-IPv6 as its IPv4", normAddress("2001:db8:1:2:aaaa::1") === normAddress("2001:DB8:1:2:bbbb::9") && normAddress("2001:db8:1:3::1") !== normAddress("2001:db8:1:2::1") && normAddress("::ffff:203.0.113.5") === "203.0.113.5");
// a released certificate whose participation cannot be opened: «invalid» — never a sign the pair was right
await addScheme(scheme("reg-orphan", { number: "PTS 26/04-T-1", certificates: { "2604-03": { no: "PTS 26/04-T-1-24680", date: "2026-10-02", registeredAt: "x", released: rel } } }));
t("a matched certificate that cannot be answered — «invalid», as a miss", (await lookupCertificate({ number: "PTS 26/04-T-1-24680", code: "2604-03" }, "198.51.100.30", AT)).state === "invalid");
t("never a simulation round's or a replay's, whatever its flags", findCertificate([scheme("sim", { number: "SIM 26/01-T-1", certificates: { "C1": { no: "SIM 26/01-T-1-11111", date: "d", registeredAt: "x", released: rel } } })], q("SIM 26/01-T-1-11111", "C1")) === null && findCertificate([scheme("rp", { replay: { of: "x" }, certificates: { "C1": { no: "PTS 26/01-T-1-11111", date: "d", registeredAt: "x", released: rel } } })], q("PTS 26/01-T-1-11111", "C1")) === null);

// ── the wiring ──
const api = src("app/api/certificate/route.ts");
t("the website's question: POST, JSON only and small, the same lookup; CORS for ptsbg.eu only; no-store", /export async function POST/.test(api) && /lookupCertificate\(/.test(api) && /https:\/\/ptsbg\.eu/.test(api) && !/"\*"/.test(api) && /no-store/.test(api) && !/export async function GET/.test(api) && /status: 415/.test(api) && /raw\.length > 1024/.test(api));
const core = src("lib/cert-register.ts");
t("10.4 review: the ticket before the look (fail closed), its own hash key (never the database's), given back only on a valid answer", /ticket = await takeTicket\(/.test(core) && core.indexOf("takeTicket(hour") < core.indexOf("findCertificate(") && /REGISTER_HASH_KEY/.test(core) && !/SUPABASE_KEY/.test(core) && /await refund\(hour, a, n\);\s*await countOutcome\("valid"\)/.test(core));
const pg = src("app/certificate/page.tsx");
t("the page: the number from a QR link, never the code; public (the proxy; no staff panel)", /\(await searchParams\)\.no/.test(pg) && !/\.code\b/.test(pg) && /certificate\(\?:\/\|\$\)/.test(src("proxy.ts")) && /path === "\/certificate"/.test(src("components/Chrome.tsx")));
t("the form posts — the code never in a link", /useActionState/.test(src("components/CertificateLookup.tsx")) && !/method="get"/i.test(src("components/CertificateLookup.tsx")));

console.log(`cert-register.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

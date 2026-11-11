// The public forms' limit (the security sweep, SD-1/SI-6; lib/public-limit, migration 0055) — in memory
// here (no database): per address an hour (an IPv6 address by its /64), everyone's ceiling, the next hour
// free again; the address never kept, only a keyed hash; the database's function as the code calls it.
import { readFileSync } from "node:fs";
import { publicFormAllowed, publicFormLimit, FORM_CEILINGS } from "../src/lib/public-limit.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const AT = Date.parse("2026-11-11T10:05:00Z");

const reg = [];
for (let i = 0; i < FORM_CEILINGS.registration.perAddress + 1; i++) reg.push(await publicFormAllowed("registration", "198.51.100.7", AT));
t("registration: 10 from one address an hour, then refused", reg.slice(0, 10).every(Boolean) && reg[10] === false, reg.join());
t("…another address is not refused; the next hour, neither", (await publicFormAllowed("registration", "198.51.100.8", AT)) && (await publicFormAllowed("registration", "198.51.100.7", AT + 3600_000)));
t("…another form is counted apart", await publicFormAllowed("password_reset", "198.51.100.7", AT));
const v6 = [];
for (let i = 0; i < 11; i++) v6.push(await publicFormAllowed("registration", `2001:db8:1:2::${i + 1}`, AT));
t("an IPv6 address by its /64 — a new address in it is the same bucket", v6.slice(0, 10).every(Boolean) && v6[10] === false, v6.join());
let all = 0;
for (let i = 0; i < 130; i++) if (await publicFormAllowed("registration", `203.0.113.${i}`, AT + 7200_000)) all++;
t("everyone's ceiling an hour, whatever the addresses (100 registrations of 130 tries)", all === FORM_CEILINGS.registration.all, String(all));
// round 2 (R2S-4): why not — its address, or everyone's (said to the person)
// (in memory an hour's counts go when a later hour is asked: «all» in the full hour first, then a new hour)
const allNow = await publicFormLimit("registration", "203.0.113.250", AT + 7200_000);
for (let i = 0; i < FORM_CEILINGS.registration.perAddress; i++) await publicFormLimit("registration", "198.51.100.99", AT + 4 * 3600_000);
const addrNow = await publicFormLimit("registration", "198.51.100.99", AT + 4 * 3600_000);
t("…why not: «all» at everyone's ceiling, «address» at its own", allNow === "all" && addrNow === "address", `${allNow} ${addrNow}`);
const lib = readFileSync(new URL("../src/lib/public-limit.ts", import.meta.url), "utf8");
t("the address only as a keyed hash that includes the hour and the form", /hmac\(formKey\(\), `\$\{hour\}\|\$\{form\}\|\$\{normAddress\(address\)\}`\)/.test(lib));
t("a database that cannot count refuses (fail closed)", /if \(error\) \{ console\.error\(`\[public-limit\] \$\{form\}:`, error\.message\); return "all"; \}/.test(lib));
const m55 = readFileSync(new URL("../supabase/migrations/0055_security_sweep.sql", import.meta.url), "utf8");
t("the database's function takes what the code sends", /public_form_try\(p_form text, p_hour text, p_address text, p_per_address integer, p_global integer\)/.test(m55) && /db\.rpc\("public_form_try", \{ p_form: form, p_hour: hour, p_address: bucket, p_per_address: c\.perAddress, p_global: c\.all \}\)/.test(lib));
t("…the database's answer: «ok», «address» or «all» (everyone's first)", /returns text/.test(m55.slice(m55.indexOf("function public.public_form_try"))) && /return 'all'[\s\S]{0,80}return 'address'/.test(m55) && /return 'ok'/.test(m55));
t("…under a lock, the hours before removed, both buckets counted", /pg_advisory_xact_lock/.test(m55) && /delete from public\.public_form_attempts where hour < p_hour/.test(m55) && /values \(p_address, p_hour, 1\), \('g:' \|\| p_form, p_hour, 1\)/.test(m55));

console.log(`public-limit.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

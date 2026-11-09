// The staff confidentiality declaration Ф 4.2-1, per provider person (plan part 2.8;
// E17; ISO/IEC 17043 §4.2): the date it was signed and the signed scan, recorded by
// the head of the PT provider; never changed or removed — signed again, a new record;
// the scan opens for the head and the person, journalled; who holds a role without
// one is named by the system check.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { recordDeclaration, voidDeclaration, listDeclarations, declarationsInForce, getDeclaration, declarationFile, DECLARATION_EXT, MAX_DECLARATION_BYTES, DECLARATION_BUCKET } from "../src/lib/staff-declarations.ts";
import { addStaff, updateStaff, getStaffByEmail } from "../src/lib/staff.ts";
import { sofiaDay } from "../src/lib/chain.ts";
import * as store from "../src/lib/staff-declarations.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const PDF = { bytes: new TextEncoder().encode("%PDF-1.4\n%test\n"), mime: "application/pdf", name: "f-4-2-1.pdf" };
const today = sofiaDay(new Date().toISOString());

// ── the record (in memory) ──────────────────────────────────────────────────
await addStaff({ email: "dobreva@ptsbg.eu", name: "Д", role: "staff" });
await addStaff({ email: "former@ptsbg.eu", name: "Ф", role: "staff" });
await updateStaff((await getStaffByEmail("former@ptsbg.eu"))!.id, { status: "inactive" });
await addStaff({ email: "aud@ptsbg.eu", name: "О", role: "auditor" });

const r1 = await recordDeclaration({ personEmail: " Dobreva@PTSbg.eu ", signedOn: "2026-10-01", file: PDF, by: "head@ptsbg.eu" });
t("the head records a declaration: the date and the scan", r1.ok && r1.entry.personEmail === "dobreva@ptsbg.eu" && r1.entry.signedOn === "2026-10-01" && r1.entry.fileMime === "application/pdf");
t("…the scan is kept, byte for byte", r1.ok && new TextDecoder().decode((await declarationFile(r1.entry))!) === "%PDF-1.4\n%test\n");
t("…and found by its id", r1.ok && (await getDeclaration(r1.entry.id))?.personEmail === "dobreva@ptsbg.eu");
const r2 = await recordDeclaration({ personEmail: "dobreva@ptsbg.eu", signedOn: today, file: PDF, by: "head@ptsbg.eu" });
t("signed again (today): a new record — the earlier one stays", r2.ok && (await listDeclarations({ personEmail: "dobreva@ptsbg.eu" })).length === 2);
t("…the one in force is the latest signed", (await declarationsInForce()).get("dobreva@ptsbg.eu")?.signedOn === today && (await listDeclarations({ personEmail: "dobreva@ptsbg.eu" }))[0].signedOn === today);
const back = await recordDeclaration({ personEmail: "dobreva@ptsbg.eu", signedOn: "2025-01-15", file: PDF, by: "head@ptsbg.eu" });
t("…an older paper recorded later does not replace it", back.ok && (await declarationsInForce()).get("dobreva@ptsbg.eu")?.signedOn === today);
const no = (r: Awaited<ReturnType<typeof recordDeclaration>>, e: string) => !r.ok && r.error === e;
t("only one of PTS's people: not a stranger", no(await recordDeclaration({ personEmail: "someone@example.com", signedOn: "2026-10-01", file: PDF, by: "h" }), "person"));
t("…not a deactivated member", no(await recordDeclaration({ personEmail: "former@ptsbg.eu", signedOn: "2026-10-01", file: PDF, by: "h" }), "person"));
t("…not the auditor (read-only, outside the model)", no(await recordDeclaration({ personEmail: "aud@ptsbg.eu", signedOn: "2026-10-01", file: PDF, by: "h" }), "person"));
// Sofia's tomorrow — not UTC's: the portal counts the days as PTS does
const tomorrow = sofiaDay(new Date(Date.now() + 86400000).toISOString());
for (const [why, day] of [["after today", tomorrow], ["not a calendar day", "2026-02-30"], ["not a date", "01.10.2026"], ["before 2000", "1999-12-31"], ["empty", ""]] as const) {
  t(`a date ${why}: refused`, no(await recordDeclaration({ personEmail: "dobreva@ptsbg.eu", signedOn: day, file: PDF, by: "h" }), "date"));
}
t("no scan: refused", no(await recordDeclaration({ personEmail: "dobreva@ptsbg.eu", signedOn: "2026-10-01", file: { ...PDF, bytes: new Uint8Array() }, by: "h" }), "file"));
t("a scan that is not a PDF, JPG or PNG: refused", no(await recordDeclaration({ personEmail: "dobreva@ptsbg.eu", signedOn: "2026-10-01", file: { ...PDF, mime: "text/html" }, by: "h" }), "type"));
t("…too large: refused", no(await recordDeclaration({ personEmail: "dobreva@ptsbg.eu", signedOn: "2026-10-01", file: { ...PDF, bytes: new Uint8Array(MAX_DECLARATION_BYTES + 1) }, by: "h" }), "size"));
t("the same three kinds as the database allows", JSON.stringify(Object.keys(DECLARATION_EXT).sort()) === JSON.stringify(["application/pdf", "image/jpeg", "image/png"]));
t("nothing to change or remove one — the store has no such function", !Object.keys(store).some((k) => /update|delete|remove|edit/i.test(k)));

// voided when recorded by mistake — never deleted
const inForce = (await declarationsInForce()).get("dobreva@ptsbg.eu")!;
t("a voiding needs a reason", !(await voidDeclaration({ id: inForce.id, reason: " no ", by: "head@ptsbg.eu" })).ok);
const v = await voidDeclaration({ id: inForce.id, reason: "Записана на грешен човек.", by: "head@ptsbg.eu" });
t("the head voids one recorded by mistake, with the reason", v.ok && v.entry.voided?.reason === "Записана на грешен човек.");
t("…it stays on record, voided", (await listDeclarations({ personEmail: "dobreva@ptsbg.eu" })).length === 3 && !!(await getDeclaration(inForce.id))?.voided);
t("…and is in force for nobody: the one before it is", (await declarationsInForce()).get("dobreva@ptsbg.eu")?.signedOn === "2026-10-01");
t("…voided once only", !(await voidDeclaration({ id: inForce.id, reason: "Още веднъж, по грешка.", by: "head@ptsbg.eu" })).ok);
t("…and only what exists", !(await voidDeclaration({ id: "00000000-0000-4000-8000-000000000000", reason: "Няма такава декларация.", by: "h" })).ok);

// ── the action, the route, the database and the rest of the portal ──────────
const actions = read("../src/lib/actions.ts");
const body = (name: string) => { const i = actions.indexOf(`export async function ${name}(`); return i < 0 ? "" : actions.slice(i, actions.indexOf("\nexport ", i + 10)); };
const act = body("recordDeclarationAction");
t("the action: the head of the PT provider's, first of all", /\{\n\s*await requirePeopleManager\(\);/.test(act));
t("…the scan's real bytes checked, not its name", /if \(!magicMatches\(bytes, file\.type\)\)/.test(act));
t("…journalled — the record, never the scan or its file name (often a person's name)", /logActivity\("declaration\.recorded"/.test(act) && !/fileName|filePath/.test(act.slice(act.indexOf("logActivity"))));
const route = read("../src/app/users/declarations/[id]/route.ts");
t("the scan: signed-in staff first, then the head or the person themselves — a voided one the head's only", /export async function GET[\s\S]*?\{\n\s*await requireStaff\(\);/.test(route) && /const own = !d\.voided && !!rc\.email && rc\.email\.trim\(\)\.toLowerCase\(\) === d\.personEmail;/.test(route) && /if \(!own && !\(await canManagePeople\(rc\)\)\) return new Response\("Forbidden/.test(route));
t("…a strict id, and a bad one is «not found», not an error", /\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}\$/.test(route) && /getDeclaration\(id\)\.catch\(\(\) => null\)/.test(route));
t("…no opening without its record in the journal (503 otherwise); never framed elsewhere, never cached", /if \(!\(await logActivity\("file\.downloaded"[\s\S]*?status: 503/.test(route) && /frame-ancestors 'self'/.test(route) && /no-store/.test(route) && /nosniff/.test(route));
const lib = read("../src/lib/staff-declarations.ts");
t("a bucket made public by hand is refused; a failed record leaves no scan behind", /if \(bucket\?\.public\) throw/.test(lib) && /if \(uploaded\) await db\.storage\.from\(DECLARATION_BUCKET\)\.remove\(\[entry\.filePath\]\)/.test(lib));
t("the system check flags a confidential bucket made public", /exposed: name !== "skin-assets" && !!buckets\?\.find\(\(b\) => b\.name === name\)\?\.public/.test(read("../src/lib/system-check.ts")) && /data-bucket-public/.test(read("../src/app/system/page.tsx")));
t("«Потребители»: the declarations only for who manages PTS's people, and only recordable people offered", /const declarations = peopleManager \? await listDeclarations\(\) : \[\];/.test(read("../src/app/users/page.tsx")) && /recordable: p\.active && !auditors\.has/.test(read("../src/app/users/page.tsx")) && /people\.filter\(\(p\) => p\.recordable\)/.test(read("../src/components/ProviderPeople.tsx")));
t("…from the private bucket through the route, never a signed link", !/createSignedUrl/.test(read("../src/lib/staff-declarations.ts")) && /public: false/.test(read("../src/lib/staff-declarations.ts")));
t("…its path never carries the person's name", /entry\.filePath = `\$\{id\}\.\$\{ext\}`;/.test(read("../src/lib/staff-declarations.ts")));
const sql = read("../supabase/migrations/0028_staff_declarations.sql");
t("0028: a voiding is its own record — once per declaration, with a reason, never changed", /declaration_id uuid primary key references public\.staff_declarations \(id\)/.test(sql) && /char_length\(btrim\(reason\)\) between 5 and 500/.test(sql) && /revoke update, delete, truncate on public\.staff_declaration_voids from service_role/.test(sql) && /revoke all on public\.staff_declaration_voids from anon, authenticated/.test(sql));
t("0028: a record — no change, no removal, no truncation", /if tg_op <> 'INSERT' then\s*raise exception/.test(sql) && /before insert or update or delete on public\.staff_declarations/.test(sql) && /before truncate on public\.staff_declarations/.test(sql) && /revoke update, delete, truncate on public\.staff_declarations from service_role/.test(sql));
t("…a real date (a day's grace for UTC) and the same three kinds of scan", /new\.signed_on > current_date \+ 1 or new\.signed_on < date '2000-01-01'/.test(sql) && /file_mime not in \('application\/pdf', 'image\/png', 'image\/jpeg'\)/.test(sql));
t("…closed to the API, marked applied, expected by the build gate", /enable row level security/.test(sql) && /revoke all on public\.staff_declarations from anon, authenticated/.test(sql) && sql.includes("('0028_staff_declarations')") && read("../src/lib/migrations-list.ts").includes('"0028_staff_declarations"'));
t("not round data: the table and the bucket are named as PTS's own people's", /staff_declarations: "PTS's own people's Ф 4\.2-1/.test(read("../src/lib/round-export.ts")) && /"staff-declarations": "the signed Ф 4\.2-1/.test(read("../src/lib/round-export.ts")));
t("the system check: who holds a role with none on record (only who can be recorded), and the bucket", /const missing = \[\.\.\.holders\]\.filter\(\(e\) => !signed\.has\(e\)\);/.test(read("../src/lib/system-check.ts")) && /\(await ofPts\(e\)\) \? e : null/.test(read("../src/lib/system-check.ts")) && /const BUCKETS = \[[^\]]*DECLARATION_BUCKET[^\]]*\];/.test(read("../src/lib/system-check.ts")) && DECLARATION_BUCKET === "staff-declarations");
t("«Потребители» shows it per person; the dashboard shows one's own", /data-declaration=/.test(read("../src/components/ProviderPeople.tsx")) && /data-dashboard-declaration/.test(read("../src/app/dashboard/page.tsx")));

console.log(`staff-declarations.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

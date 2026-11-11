// The identity store (plan part 2.3; Н1, D4, Реш. 142): who is behind a code lives
// apart from the coded data, in a schema closed to the API; the portal reaches it
// only through functions that record every opening; a read that bypasses the portal
// is recorded by Postgres audit logging. In memory here; the SQL is checked as text.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { addParticipant, listParticipants, withIdentities, listParticipationsForLab, updateParticipant, labIdsFor, withoutIdentity } from "../src/lib/participants.ts";
import { openIdentities, listOpenings, IDENTITY_PURPOSES } from "../src/lib/identity-store.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const throws = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch { return true; } };
const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p: string) => readFileSync(join(root, p), "utf8");

// ── the coded data carries no identity ──────────────────────────────────────
const S = "ID-1";
const a = await addParticipant({ schemeId: S, labName: "Тайна лаборатория", email: "secret@lab.example", phone: "+359 1", deliveryAddress: "ул. Тайна 1", labId: "LAB-ID-1" }, "head@ptsbg.eu");
await addParticipant({ schemeId: S, labName: "Друга", labId: "LAB-ID-2" }, "head@ptsbg.eu");
const coded = await listParticipants(S);
t("the coded list: the codes, and nothing of who is behind them", coded.length === 2 && coded.every((p) => !("labName" in p) && !("email" in p) && !("labId" in p) && !("deliveryAddress" in p)), JSON.stringify(coded[0]));
t("…not even in its JSON", !JSON.stringify(coded).includes("Тайна") && !JSON.stringify(coded).includes("secret@") && !JSON.stringify(coded).includes("LAB-ID"));
t("withoutIdentity: empty fields for a masking renderer", withoutIdentity(coded[0]).labName === "" && withoutIdentity(coded[0]).email === "");

// ── every opening names who and why, and is recorded ────────────────────────
t("no opening without who opens it", await throws(() => withIdentities(coded, S, { actor: "  ", purpose: "names.view" })));
t("…nor for a purpose the store does not know", await throws(() => withIdentities(coded, S, { actor: "x", purpose: "curiosity" as never })));
const before = (await listOpenings(S, coded.map((p) => p.id))).length;
const named = await withIdentities(coded, S, { actor: "head@ptsbg.eu", purpose: "names.view" });
t("an opening gives the identities, matched by participant", named.find((p) => p.code === a.code)?.labName === "Тайна лаборатория" && named.find((p) => p.code === a.code)?.labId === "LAB-ID-1");
const opened = await listOpenings(S, coded.map((p) => p.id));
const last = opened.at(-1);
t("…and is recorded: who, for what, which round, how many", opened.length === before + 1 && last?.actor === "head@ptsbg.eu" && last?.purpose === "names.view" && last?.schemeId === S && last?.rows === 2, JSON.stringify(last));
const one = await openIdentities({ schemeId: S, participantIds: [a.id] }, { actor: "x", purpose: "send" });
t("an opening of some participants returns only those", one.size === 1 && one.has(a.id));
t("…of another round, nothing", (await openIdentities({ schemeId: "ID-OTHER", participantIds: [a.id] }, { actor: "x", purpose: "send" })).size === 0);
const labOf = await labIdsFor(S, coded, "system:reminders");
t("to reach a laboratory: its account behind the code, as an opening for «send»", labOf.get(a.code) === "LAB-ID-1" && (await listOpenings(S, [])).at(-1)?.purpose === "send");

// ── the laboratory's own ────────────────────────────────────────────────────
const mine = await listParticipationsForLab("LAB-ID-1", { actor: "lab:LAB-ID-1", purpose: "lab.own" });
t("a laboratory's participations: only its own, with its identity", mine.length === 1 && mine[0].code === a.code && mine[0].labName === "Тайна лаборатория");
t("…an unknown laboratory: none", (await listParticipationsForLab("LAB-NOPE", { actor: "lab:LAB-NOPE", purpose: "lab.own" })).length === 0);

// ── writes ──────────────────────────────────────────────────────────────────
t("an identity edit names who makes it", await throws(() => updateParticipant(a.id, { labName: "Ново име" })));
await updateParticipant(a.id, { labName: "Ново име", status: "registered" }, "head@ptsbg.eu");
const after = await withIdentities(await listParticipants(S), S, { actor: "head@ptsbg.eu", purpose: "names.view" });
t("…with it: the identity and the coded part both changed", after.find((p) => p.code === a.code)?.labName === "Ново име" && after.find((p) => p.code === a.code)?.status === "registered");
t("…the write recorded too", (await listOpenings(S, [a.id])).some((o) => o.purpose === "write" && o.participantId === a.id));
const n0 = (await listOpenings(S, [a.id])).length;
t("a coded-only change needs no actor, and opens nothing", !(await throws(() => updateParticipant(a.id, { status: "dispatched" }))) && (await listOpenings(S, [a.id])).length === n0);
const count0 = (await listParticipants(S)).length;
t("a new participant names who adds it — refused before anything is kept", (await throws(() => addParticipant({ schemeId: S, labName: "X" }, ""))) && (await listParticipants(S)).length === count0);
const ownBefore = (await listOpenings(S, (await listParticipants(S)).map((p) => p.id))).filter((o) => o.purpose === "lab.own").length;
await listParticipationsForLab("LAB-ID-1", { actor: "lab:LAB-ID-1", purpose: "lab.own" });
t("the round's openings include the laboratory's own (they name participants, not the scheme)", (await listOpenings(S, (await listParticipants(S)).map((p) => p.id))).filter((o) => o.purpose === "lab.own").length === ownBefore + 1);
t("…and each opening says WHICH participants", (await listOpenings(S, [a.id])).filter((o) => o.purpose === "lab.own").every((o) => o.participantIds?.includes(a.id)));

// ── nothing else reaches the identities ─────────────────────────────────────
const files: string[] = [];
const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(f)) files.push(p); } };
walk(join(root, "src"));
const rel = (p: string) => p.slice(root.length);
const src = (p: string) => readFileSync(p, "utf8");
const callers = files.filter((f) => /rpc\(\s*["']identity_/.test(src(f))).map(rel);
t("only the identity store calls the identity functions (its entities part since 4.1)", callers.join() === "src/lib/entities.ts,src/lib/entity-users.ts,src/lib/identity-store.ts,src/lib/laboratories.ts,src/lib/participation-snapshots.ts", callers.join());
t("no code reads the identity schema directly", files.every((f) => !/\.schema\(\s*["']identity["']\)|from\(\s*["']identity\./.test(src(f))));
// (the application forms' own field names — name="lab_name" in a blank form — are not the column)
const tableReaders = files.filter((f) => /from\(\s*["']participants["']\)/.test(src(f))).map(rel);
t("only the participant store reads the participants table", tableReaders.join() === "src/lib/participants.ts", tableReaders.join());
const parts = read("src/lib/participants.ts");
t("the participant store reads coded columns only", (parts.match(/\.select\("([^"]+)"\)/g) ?? []).every((q) => !/lab_name|email|contact|phone|country|delivery_address|lab_id|\*/.test(q)), (parts.match(/\.select\("([^"]+)"\)/g) ?? []).join(" "));
const ids = read("src/lib/identities.ts");
t("a person at PTS: the role model is asked, in THIS scheme, before anything is opened (2.4)", /if \(!\(await mayNow\("names\.view", schemeId\)\)\) return coded\.map\(withoutIdentity\);[\s\S]{0,120}return withIdentities\(/.test(ids));
for (const page of ["src/app/schemes/[id]/participants/page.tsx", "src/app/schemes/[id]/results/page.tsx", "src/app/schemes/[id]/traceability/page.tsx", "src/app/schemes/[id]/audit-pack/route.ts", "src/app/schemes/[id]/build/[doc]/page.tsx", "src/app/schemes/[id]/participants/[code]/page.tsx"]) {
  t(`${page.replace("src/app/schemes/[id]/", "")}: names through the gate`, /namesFor\(id, /.test(read(page)));
}
t("the case file opens one identity, only when a manager asks", /const p = revealed \? \(await namesFor\(id, \[coded\]\)\)\[0\] : withoutIdentity\(coded\);/.test(read("src/app/schemes/[id]/participants/[code]/page.tsx")));
for (const route of ["src/app/schemes/[id]/doc/[doc]/print/route.ts", "src/app/schemes/[id]/build/[doc]/print/route.ts"]) {
  t(`${route.replace("src/app/schemes/[id]/", "")}: only a document that shows names, only to who may see them`, /reveal && showsIdentities\(/.test(read(route)) && /x-actor/.test(read(route)));
}
t("/api/pdf names who asks, under the internal token", /"x-internal-token": internalToken, "x-reveal": reveal, "x-actor": await actorNow\(\)/.test(read("src/app/api/pdf/route.ts")));
t("…and a print route trusts that name ONLY with the token", ["src/app/schemes/[id]/doc/[doc]/print/route.ts", "src/app/schemes/[id]/build/[doc]/print/route.ts"].every((r) => (read(r).match(/req\.headers\.get\("x-actor"\)/g) ?? []).length === 1 && /\(isInternal && req\.headers\.get\("x-actor"\)\) \|\| \(await actorNow\(\)\)/.test(read(r))));
t("the reminders job opens with its own purpose", /labIdsFor\(s\.id, owing, "system:reminders", "system"\)/.test(read("src/lib/notify-reminders.ts")));
const acts = read("src/lib/actions.ts");
t("who to tell is looked up BEFORE a step is recorded — a failure records nothing, a retry tells them",
  acts.indexOf("labOf = await labIdsFor(schemeId, parts") < acts.indexOf("sentToParticipants: { ...(s.sentToParticipants ?? {}), [docKey]: sentAt }")
  // …and the edition is decided before anyone is looked up: a send that asks for its
  // note, or is refused, opens nothing (3.0)
  && acts.indexOf("const got = await editionToSend(scheme, docKey") < acts.indexOf("labOf = await labIdsFor(schemeId, parts")
  && acts.indexOf("const invoiceTell = ") < acts.indexOf("const upload: UploadedDoc", acts.indexOf("const invoiceTell = "))
  && acts.indexOf("const upload: UploadedDoc", acts.indexOf("const invoiceTell = ")) < acts.indexOf("notifyInvoiceReady(invoiceTell.labId")
  // 7.7: the laboratory is told at the release — looked up before the release is recorded
  && acts.indexOf("const tell = await labToTell(schemeId, code);", acts.indexOf("export async function releaseCertificateAction")) < acts.indexOf("released: { by, at: new Date().toISOString(), langs", acts.indexOf("export async function releaseCertificateAction"))
  && acts.indexOf("const tell = await labToTell(schemeId, code);", acts.indexOf("export async function releaseCertificateAction")) > acts.indexOf("export async function releaseCertificateAction")
  && acts.indexOf("const tell0 = ") < acts.indexOf("return { chain: { ...s.chain, dispatchedAt: at } }")
  && (acts.match(/if \(!(tell0|tellNext|invoiceTell)\) return \{ error: /g) ?? []).length === 4
  && /if \(!tell\) redirect\(back\("cert=reach"\)\);/.test(acts));
t("the round export: an opening for «export», and the round's openings in identity/", /withIdentities\(coded, schemeId, \{ actor, purpose: "export" \}\)/.test(read("src/lib/round-export.ts")) && /identity\/identity_openings\.csv/.test(read("src/lib/round-export.ts")));

// ── the database keeps the rules ────────────────────────────────────────────
const m24 = read("supabase/migrations/0024_identity_store.sql");
const m25 = read("supabase/migrations/0025_identity_audit.sql");
t("0024: a schema closed to every API role, the server key's included", /revoke all on schema identity from public, anon, authenticated, service_role;/.test(m24) && /revoke all on identity\.participants from public, anon, authenticated, service_role;/.test(m24) && /revoke all on identity\.openings from public, anon, authenticated, service_role;/.test(m24));
t("…row-level security on both, no policy", /alter table identity\.participants enable row level security;/.test(m24) && /alter table identity\.openings enable row level security;/.test(m24) && !/create policy/.test(m24));
t("…the openings never changed, never removed", /before update or delete on identity\.openings/.test(m24) && /before truncate on identity\.openings/.test(m24) && /new\.at := now\(\); new\.db_user := current_user; new\.login_user := session_user;/.test(m24));
const open = m24.slice(m24.indexOf("create or replace function public.identity_open("), m24.indexOf("create or replace function public.identity_put("));
t("…identity_open records the opening BEFORE it returns a row", open.indexOf("insert into identity.openings") > 0 && open.indexOf("insert into identity.openings") < open.indexOf("return query"));
t("…and refuses an opening with no actor, no purpose, or no limit", /who opens it\?/.test(open) && /for what\?/.test(open) && /which ones\?/.test(open));
// the purposes as the LAST migration that sets them says (0055 added «register» — the security sweep, SC-4)
const lastPurposes = readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort()
  .map((f) => readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), "utf8")).filter((x) => /function public\.identity_purpose_ok/.test(x)).pop() ?? "";
const sqlPurposes = /select p in \(([^)]+)\)/.exec(lastPurposes.slice(lastPurposes.indexOf("function public.identity_purpose_ok")))?.[1].split(",").map((x) => x.trim().replace(/'/g, "")) ?? [];
t("…the purposes are the store's own, both ways", JSON.stringify(sqlPurposes) === JSON.stringify([...IDENTITY_PURPOSES]), sqlPurposes.join());
const fns = [...m24.matchAll(/create or replace function public\.(identity_\w+)\([\s\S]*?\$\$;?/g)];
t("…every way in: security definer with an empty search path", fns.length === 6 && fns.every((f) => /set search_path = ''/.test(f[0])) && fns.filter((f) => /security definer/.test(f[0])).length === 5, fns.map((f) => f[1]).join());
t("…callable by the server key only", ["identity_open", "identity_put", "identity_add_participant", "identity_update_participant", "identity_openings_for"].every((f) => new RegExp(`revoke execute on function public\\.${f}\\([^)]*\\) from public, anon, authenticated;`).test(m24) && new RegExp(`grant execute on function public\\.${f}\\([^)]*\\) to service_role;`).test(m24)));
const move = m24.slice(m24.indexOf("-- EXPAND: copy every row"), m24.indexOf("-- ── the only ways in"));
t("…EXPAND: it copies and checks, and removes nothing (the previous version keeps working)", move.indexOf("insert into identity.participants") > 0 && move.indexOf("not every participant was copied") > move.indexOf("insert into identity.participants") && !/drop column/.test(m24));
t("…what the previous version writes meanwhile is mirrored in, by a definer the API cannot call", /create or replace function identity\.mirror_old_columns\(\) returns trigger\s+language plpgsql security definer set search_path = ''/.test(m24) && /revoke execute on function identity\.mirror_old_columns\(\) from public, anon, authenticated, service_role;/.test(m24) && /after update of lab_name, contact, email, phone, country, delivery_address, lab_id on public\.participants/.test(m24));
t("…and this version can add a participant without the old columns", /alter column lab_name drop not null;/.test(m24));
t("…all of it in one transaction", /^begin;$/m.test(m24) && /^commit;$/m.test(m24));
const m26 = read("supabase/migrations-later/0027_identity_contract.sql");
t("0027 CONTRACT, kept apart until this version is live: copies once more, checks, then drops — in one transaction", /^begin;$/m.test(m26) && /^commit;$/m.test(m26) && m26.indexOf("on conflict (participant_id) do nothing") < m26.indexOf("not every participant is in the store") && m26.indexOf("not every participant is in the store") < m26.indexOf("drop column lab_name") && m26.indexOf("drop trigger if exists mirror_old_columns_update") < m26.indexOf("drop column lab_name"));
t("…and is not yet in the folder the build gate reads", !readdirSync(join(root, "supabase/migrations")).some((f) => f.startsWith("0027")));
t("…an update: the coded part and the identity together, or neither (N14)", /create or replace function public\.identity_update_participant[\s\S]*update public\.participants p set[\s\S]*perform public\.identity_put/.test(m24) && /updateWithIdentity\(id, row, identity, actor\)/.test(read("src/lib/participants.ts")));
t("…each opening keeps which participants, and the round finds its laboratories' own", /participant_ids uuid\[\]/.test(m24) && /insert into identity\.openings \(actor, purpose, scheme_id, lab_id, participant_ids, rows\)/.test(m24) && /o\.participant_ids && \(/.test(m24));
t("…no JSON null stored for an absent list", (m24.match(/nullif\(p_\w+->'characteristics', 'null'::jsonb\)/g) ?? []).length === 2);
t("0018 re-run: 0007's marker no longer the column that moves", /\('0007_lab_portal', 'labs', null\)/.test(read("supabase/migrations/0018_app_migrations.sql")));
t("…a new participant: its coded row and its identity together, or neither", /create or replace function public\.identity_add_participant[\s\S]*insert into public\.participants[\s\S]*perform public\.identity_put/.test(m24));
t("0025: Postgres audit logging on — the owner in the SQL editor and the API both", /create extension if not exists pgaudit;/.test(m25) && /alter role postgres set pgaudit\.role to 'identity_auditor';/.test(m25) && /alter role authenticator set pgaudit\.role to 'identity_auditor';/.test(m25));
t("…watching the identity tables, and those that still hold names", /grant select, insert, update, delete on identity\.participants to identity_auditor;/.test(m25) && /grant select on public\.labs, public\.lab_applications, public\.sent_messages to identity_auditor;/.test(m25));
t("…the audit role can do nothing itself", /create role identity_auditor nologin noinherit;/.test(m25));
t("…switching it off is logged too (ddl, role on the owner's role)", /alter role postgres set pgaudit\.log to 'ddl, role';/.test(m25));
t("…and the health says what the API's own session runs with", /'session', coalesce\(current_setting\('pgaudit\.role', true\), ''\)/.test(m25));

console.log(`identity-store.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

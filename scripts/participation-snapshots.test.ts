// Plan part 4.5 — a frozen copy per participation (J12): the legal entity's and the
// laboratory's data as they are when PTS links the participation, kept with it and
// never changed; a wrong link corrected by a new version with its reason, the earlier
// one kept; the person by reference only, and the МОЛ and the official e-mail apart —
// blanked by the anonymisation after six years (Zadanie §10).
import { readFileSync } from "node:fs";
import { putEntity } from "../src/lib/entities.ts";
import { putLaboratory } from "../src/lib/laboratories.ts";
import { putEntityUser } from "../src/lib/entity-users.ts";
import { putIdentity, openIdentities, memOpenings } from "../src/lib/identity-store.ts";
import { freezeParticipation, openParticipationSnapshots, anonymiseParticipationSnapshots, inForce } from "../src/lib/participation-snapshots.ts";
import { ROUND_TABLES, NOT_ROUND_TABLES } from "../src/lib/round-export.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
const throws = async (f: () => Promise<unknown>, re: RegExp) => { try { await f(); return false; } catch (e) { return re.test(String((e as Error).message)); } };

// ── the store, in memory ──
const S = "SNAP-1";
const E = "e5000000-0000-4000-8000-000000000001", E2 = "e5000000-0000-4000-8000-000000000002";
const L = "15000000-0000-4000-8000-000000000001", L2 = "15000000-0000-4000-8000-000000000002", LX = "15000000-0000-4000-8000-000000000003", LB = "15000000-0000-4000-8000-000000000004";
const U = "a5000000-0000-4000-8000-000000000001", U2 = "a5000000-0000-4000-8000-000000000002";
const P = "f5000000-0000-4000-8000-000000000001", P2 = "f5000000-0000-4000-8000-000000000002", P3 = "f5000000-0000-4000-8000-000000000003";
await putEntity(E, { name: "Копие ООД", country: "BG", eik: "000000043", vat: "BG000000043", correspondenceAddress: "София, ул. Копие 1", officialEmail: "office@kopie.bg", mol: "Иван Молов", origin: "pdf", state: "pending" }, "head@ptsbg.eu");
await putEntity(E2, { name: "Друго ООД", country: "RO", eik: "J40/5", correspondenceAddress: "Букурещ", origin: "pdf", state: "pending" }, "head@ptsbg.eu");
await putLaboratory(L, { entityId: E, name: "Лаборатория „Копие“", deliveryAddress: "Пловдив, ул. Стара 1", mobileOffice: true, accreditationNo: "77 ЛИ", state: "active" }, "head@ptsbg.eu");
await putLaboratory(LB, { entityId: E, name: "Втора лаборатория", deliveryAddress: "Бургас 3", mobileOffice: false, accreditationNo: "", state: "active" }, "head@ptsbg.eu");
await putLaboratory(LX, { entityId: E, name: "Затворена", deliveryAddress: "Варна", mobileOffice: false, accreditationNo: "", state: "active" }, "head@ptsbg.eu");
await putLaboratory(LX, { state: "inactive" }, "head@ptsbg.eu");
await putLaboratory(L2, { entityId: E2, name: "Чужда", deliveryAddress: "Букурещ 2", mobileOffice: false, accreditationNo: "", state: "active" }, "head@ptsbg.eu");
await putEntityUser(U, { email: "maria@kopie.bg", name: "Мария Контакт", position: "", phone: "+359 2 1", role: "admin", twoFactorRequired: false, entityId: E, state: "invited" }, "head@ptsbg.eu");
await putEntityUser(U2, { email: "ion@altul.ro", name: "Ion", position: "", phone: "", role: "admin", twoFactorRequired: false, entityId: E2, state: "invited" }, "head@ptsbg.eu");
for (const p of [P, P2, P3]) await putIdentity(p, S, { labName: "въведено от PDF", country: "България", deliveryAddress: "стар адрес", contact: "Мария", email: "maria@kopie.bg" }, "head@ptsbg.eu");

const before = memOpenings().length;
const v1 = await freezeParticipation(P, L, U, "head@ptsbg.eu");
t("one opening per copy taken — as the database records it; its ids as the database's (review)", memOpenings().length === before + 1 && (() => { const o = memOpenings().at(-1)!; return o.participantId === P && o.entityId === E && o.laboratoryId === L && o.userId === U && o.purpose === "write"; })());
const all1 = await openParticipationSnapshots({ actor: "head@ptsbg.eu", purpose: "names.view" }, S);
const snap = inForce(all1).get(P)!;
t("a copy taken — version 1, when and by whom", v1 === 1 && snap.version === 1 && /^\d{4}-\d\d-\d\dT/.test(snap.takenAt) && snap.takenBy === "head@ptsbg.eu" && snap.supersedes === undefined && snap.reason === "");
eq("…of the entity and the laboratory AS THEY ARE THEN", [snap.entityId, snap.entity.name, snap.entity.eik, snap.entity.vat, snap.entity.correspondenceAddress, snap.entity.state, snap.entity.origin, snap.laboratoryId, snap.laboratory],
  [E, "Копие ООД", "000000043", "BG000000043", "София, ул. Копие 1", "pending", "pdf", L, { name: "Лаборатория „Копие“", deliveryAddress: "Пловдив, ул. Стара 1", mobileOffice: true, accreditationNo: "77 ЛИ", accreditationBody: "" }]);
t("…the person by reference only; the МОЛ and the official e-mail apart, not in the entity's copy (review)", snap.contactUserId === U && snap.mol === "Иван Молов" && snap.officialEmail === "office@kopie.bg" && !/Мария|maria@|\+359 2 1|Молов|office@/.test(JSON.stringify({ e: snap.entity, l: snap.laboratory })));
eq("…what it replaced kept in it (review)", snap.replaced, { labName: "въведено от PDF", deliveryAddress: "стар адрес" });
const ids = await openIdentities({ schemeId: S, participantIds: [P] }, { actor: "a", purpose: "write" });
eq("…the participation's laboratory name and delivery address follow it; its typed country and the person's fields stay (review)", [ids.get(P)?.labName, ids.get(P)?.deliveryAddress, ids.get(P)?.country, ids.get(P)?.contact], ["Лаборатория „Копие“", "Пловдив, ул. Стара 1", "България", "Мария"]);
t("…and nobody writes another laboratory name or address on it any more — a correction is a new version (review)", await throws(() => putIdentity(P, S, { labName: "въведено от PDF" }, "h"), /frozen/) && await throws(() => putIdentity(P, S, { deliveryAddress: "друг" }, "h"), /frozen/));
let other = true; try { await putIdentity(P, S, { phone: "+359 2 999", labName: "Лаборатория „Копие“" }, "h"); } catch { other = false; }
t("…its other fields still change; the same name again is no change", other);
await putEntity(E, { name: "Копие АД (преименувано)", correspondenceAddress: "Нов адрес" }, "head@ptsbg.eu");
await putLaboratory(L, { deliveryAddress: "Пловдив, ул. Нова 9" }, "head@ptsbg.eu");
const again = inForce(await openParticipationSnapshots({ actor: "a", purpose: "names.view" }, S)).get(P)!;
t("later changes to the entity or the laboratory never reach the copy (J12)", again.entity.name === "Копие ООД" && again.entity.correspondenceAddress === "София, ул. Копие 1" && again.laboratory.deliveryAddress === "Пловдив, ул. Стара 1");
t("a second copy without a reason: refused", await throws(() => freezeParticipation(P, LB, undefined, "h"), /a correction needs its reason/));
const v2 = await freezeParticipation(P, LB, undefined, "head@ptsbg.eu", "грешна лаборатория в първата връзка");
const vs = (await openParticipationSnapshots({ actor: "a", purpose: "names.view" }, S)).filter((x) => x.participantId === P);
t("a wrong link corrected: a new version with its reason, superseding the first — the first kept (review)", v2 === 2 && vs.length === 2 && inForce(vs).get(P)!.laboratoryId === LB && inForce(vs).get(P)!.supersedes === 1 && inForce(vs).get(P)!.reason === "грешна лаборатория в първата връзка" && vs.some((x) => x.version === 1 && x.laboratoryId === L));
eq("…the participation follows the copy in force", (await openIdentities({ schemeId: S, participantIds: [P] }, { actor: "a", purpose: "write" })).get(P)?.labName, "Втора лаборатория");
t("an inactive laboratory: refused", await throws(() => freezeParticipation(P2, LX, undefined, "h"), /laboratory, or it is inactive/));
t("a contact not of that entity: refused", await throws(() => freezeParticipation(P2, L, U2, "h"), /contact is not a user of that entity/));
t("no such participation: refused", await throws(() => freezeParticipation("f5000000-0000-4000-8000-0000000000ff", L, undefined, "h"), /no such participant/));
await putEntity(E2, { state: "inactive" }, "head@ptsbg.eu");
t("an entity made inactive takes its laboratory with it: refused as the laboratory (its entity's own check never reached)", await throws(() => freezeParticipation(P3, L2, undefined, "h"), /no such entity, or it is inactive|laboratory, or it is inactive/));
await freezeParticipation(P2, L, undefined, "head@ptsbg.eu");
eq("each participation its own copy; one without a contact is a copy too", [...inForce(await openParticipationSnapshots({ actor: "a", purpose: "names.view" }, S)).values()].map((x) => [x.participantId, x.version, x.contactUserId ?? null]).sort(), [[P, 2, null], [P2, 1, null]]);
t("every copy and opening on record — which participations", memOpenings().some((o) => o.purpose === "names.view" && o.schemeId === S && o.participantIds?.length === 2));
eq("another scheme's participations are not opened", (await openParticipationSnapshots({ actor: "a", purpose: "names.view" }, "OTHER")).length, 0);
eq("the anonymisation (Zadanie §10): the МОЛ and the official e-mail of every version blanked — once", [await anonymiseParticipationSnapshots(P, "system:retention"), await anonymiseParticipationSnapshots(P, "system:retention")], [2, 0]);
t("…the rest of the copy as it was", (await openParticipationSnapshots({ actor: "a", purpose: "names.view" }, S)).filter((x) => x.participantId === P).every((x) => x.mol === "" && x.officialEmail === "" && !!x.anonymisedAt && !!x.entity.name));

// ── the migration ──
const sql = readFileSync(new URL("../supabase/migrations/0035_participation_snapshots.sql", import.meta.url), "utf8");
t("0035: the copies of a participation, versioned — in the closed identity schema, RLS on, every API role's right revoked, a read by hand audited", /primary key \(participant_id, version\)/.test(sql) && /participant_id uuid not null references public\.participants\(id\)/.test(sql) && /alter table identity\.participation_snapshots enable row level security;/.test(sql) && /revoke all on identity\.participation_snapshots from public, anon, authenticated, service_role;/.test(sql) && /grant select, insert, update, delete on identity\.participation_snapshots to identity_auditor;/.test(sql));
t("…a correction supersedes the version before, with its reason", /check \(\(version = 1 and supersedes is null\) or \(version > 1 and supersedes = version - 1 and char_length\(btrim\(reason\)\) > 0\)\)/.test(sql));
const guard = sql.slice(sql.indexOf("function identity.participation_snapshots_guard"), sql.indexOf("end $$;", sql.indexOf("function identity.participation_snapshots_guard")));
t("…frozen for every writer: never removed; never changed but the one anonymisation — the МОЛ and the official e-mail blanked, nothing else", /before update or delete on identity\.participation_snapshots/.test(sql) && /before truncate on identity\.participation_snapshots/.test(sql) && /old\.anonymised_at is null and new\.anonymised_at is not null\s*and new\.mol = '' and new\.official_email = ''/.test(guard) && /new\.entity, new\.laboratory,\s*new\.replaced/.test(guard));
t("…a frozen participation's laboratory name and address: the copy's in force, for every writer (review)", /before update of lab_name, delivery_address on identity\.participants/.test(sql) && /order by s\.version desc limit 1/.test(sql) && /the participation''s laboratory is frozen/.test(sql));
const fz = sql.slice(sql.indexOf("function public.identity_participation_freeze("), sql.indexOf("end $$;", sql.indexOf("function public.identity_participation_freeze(")));
t("…the copy made by the database from its own rows; one at a time per participation; the entity locked before the laboratory (no deadlock — review)", /from public\.participants p where p\.id = p_participant for update;/.test(fz) && fz.indexOf("from identity.legal_entities x where x.id = ent for share;") > 0 && fz.indexOf("from identity.legal_entities x where x.id = ent for share;") < fz.indexOf("from identity.laboratories x where x.id = p_laboratory for share;") && /l\.state <> 'active'/.test(fz) && /e\.state = 'inactive'/.test(fz));
t("…a second copy only with its reason; what it replaced kept; the country typed stays", /a correction needs its reason/.test(fz) && /jsonb_build_object\('lab_name', was\.lab_name, 'delivery_address', was\.delivery_address\)/.test(fz) && /update identity\.participants i set lab_name = l\.name, delivery_address = l\.delivery_address where/.test(fz) && !/country = e\.country/.test(fz));
t("…the person a reference — a user of that entity, not inactive; the МОЛ and the official e-mail in their own columns", /u\.entity_id = e\.id and u\.state <> 'inactive'/.test(fz) && !/jsonb_build_object\('name', e\.name[^;]*'(mol|official_email)'/.test(fz) && /e\.mol, e\.official_email,/.test(fz));
t("…read: every version, exactly the ones recorded; anonymise recorded; only the server key may call", /where s\.participant_id = any \(coalesce\(ids, '\{\}'\)\)/.test(sql) && /set mol = '', official_email = '', anonymised_at = now\(\)/.test(sql) && (sql.match(/grant execute on function public\.identity_participation_[a-z_]+\([^)]*\) to service_role;/g) ?? []).length === 3 && (sql.match(/security definer set search_path = ''/g) ?? []).length === 3 && /'0035_participation_snapshots'/.test(sql));

// ── the actions, the page, the export ──
const actions = readFileSync(new URL("../src/lib/actions.ts", import.meta.url), "utf8");
const sect = actions.slice(actions.indexOf("// ── A frozen copy per participation (plan part 4.5"));
const faAt = sect.indexOf("export async function freezeParticipationAction");
const fa = sect.slice(faAt, sect.indexOf("\nexport async function", faAt + 10) > 0 ? sect.indexOf("\nexport async function", faAt + 10) : undefined); // the action alone, not the rest of the file
t("linking: participants.manage in ITS scheme; the participation of THIS scheme; a correction with its reason; never a name in the journal", /await requireCap\("participants\.manage", schemeId\);/.test(fa.slice(0, 500)) && /\(await listParticipants\(schemeId\)\)\.find\(\(x\) => x\.id === /.test(fa) && /reason \|\| undefined/.test(fa) && !(fa.match(/logActivity\([^;]*;/g) ?? []).some((c) => /\.(name|email|labName)\b|\$\{reason|, reason\b/.test(c)));
const fo = sect.slice(sect.indexOf("export async function freezeOptionsAction"), sect.indexOf("export async function freezeParticipationAction"));
t("…its choices opened only when asked, behind the same right; only active laboratories under entities not inactive, and their users", /\{\n\s*await requireCap\("participants\.manage", String\(schemeId \?\? ""\)\);/.test(fo.slice(0, 400)) && /l\.state === "active" && ents\.get\(l\.entityId\) && ents\.get\(l\.entityId\)!\.state !== "inactive"/.test(fo) && /u\.state !== "inactive" && entityIds\.has\(u\.entityId\)/.test(fo));
t("the edit form cannot overwrite a frozen laboratory: refused in words (review)", /\? "frozen" as const : null/.test(actions) && /if \(p === "frozen"\) redirect\(`\$\{back\}\?err=frozen`\);/.test(actions));
const page = readFileSync(new URL("../src/app/schemes/[id]/participants/page.tsx", import.meta.url), "utf8");
t("the page: the copies only for a viewer who sees the names; no entity or laboratory opened on load; contacts by their entities; a failure said, the page still shown (review)", /const canFreeze = reveal && \(await mayNow\("participants\.manage", id\)\);/.test(page) && /if \(reveal\) \{\s*try \{/.test(page) && /openParticipationSnapshots\(\{ actor, purpose: "names\.view" \}, id\)/.test(page) && !/openEntities\(|openLaboratories\(/.test(page) && /openEntityUsers\(\{ actor, purpose: "names\.view" \}, \{ entityId \}\)/.test(page) && /data-snapshots-failed/.test(page));
t("…a frozen participation's laboratory name and address read-only in its edit form", (page.match(/readOnly=\{!!snapshot\}/g) ?? []).length === 2 && /data-err-frozen/.test(page));
const form = readFileSync(new URL("../src/components/FreezeParticipationForm.tsx", import.meta.url), "utf8");
t("…the form: its choices fetched when opened; what will be copied shown; a tick to confirm; a reason to correct (review)", /await freezeOptionsAction\(schemeId\)/.test(form) && /data-freeze-preview/.test(form) && /type="checkbox" required data-freeze-confirm/.test(form) && /\{correcting && \(/.test(form) && /name="reason" required/.test(form));
t("the round export: each copy in identity/participation_snapshots.csv; the entities, laboratories and users as they are today beside it (4.8)", JSON.stringify(ROUND_TABLES["identity.participation_snapshots"]) === JSON.stringify(["identity/participation_snapshots.csv"]) && JSON.stringify(ROUND_TABLES["identity.legal_entities"]) === JSON.stringify(["identity/entities.csv"]) && JSON.stringify(ROUND_TABLES["identity.laboratories"]) === JSON.stringify(["identity/laboratories.csv"]) && JSON.stringify(ROUND_TABLES["identity.entity_users"]) === JSON.stringify(["identity/entity_users.csv"]) && !["identity.legal_entities", "identity.laboratories", "identity.entity_users"].some((k) => k in NOT_ROUND_TABLES));

console.log(`participation-snapshots.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

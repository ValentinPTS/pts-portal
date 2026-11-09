// Plan part 5.10 — one-way messages (К11 → Реш. 116): to one participation, to everyone going on
// in a scheme, or to one organisation; in the portal and by e-mail, released by the writer who
// saw the exact text (Реш. 138; 1.8). Never two-way: questions by e-mail (Реш. 54).
import { readFileSync } from "node:fs";
import { readMessage, messageText, messageBody, messageTargetLabel, messageReached, MESSAGE_FOOTER, MESSAGE_MAX, MESSAGE_PROBLEM_TEXT, type SchemeMessage } from "../src/lib/messages-model.ts";
import { isWriterRelease, isOut, isDeliverable, notify, listForEntity, eraseEntityNotices, ERASED_TEXT } from "../src/lib/notifications.ts";
import { approvalFor, classFor, bodyFor } from "../src/lib/notify-deliver.ts";
import { codedScheme, identityScheme, SCHEME_FIELDS } from "../src/lib/round-export.ts";
import { MIGRATIONS } from "../src/lib/migrations-list.ts";
import type { Scheme } from "../src/lib/types.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ── the texts ──
eq("Bulgarian required; English optional — the Bulgarian goes when it is empty", readMessage({ bg: "  Здравейте,\r\nсрокът е утре. ", en: "" }), { ok: true, bg: "Здравейте,\nсрокът е утре.", en: "Здравейте,\nсрокът е утре.", enGiven: false });
eq("…both given: each its own", readMessage({ bg: "Срокът е утре.", en: "The deadline is tomorrow." }), { ok: true, bg: "Срокът е утре.", en: "The deadline is tomorrow.", enGiven: true });
eq("…no Bulgarian, or too short: refused", [readMessage({ bg: "", en: "Hello there" }), readMessage({ bg: "аб", en: "" })].map((r) => r.ok ? "ok" : r.problem), ["bg", "bg"]);
t("…too long: refused", !readMessage({ bg: "я".repeat(MESSAGE_MAX + 1), en: "" }).ok && readMessage({ bg: "я".repeat(MESSAGE_MAX), en: "" }).ok);
t("…control characters removed", readMessage({ bg: "Текст\u0007 с\u0000 нещо", en: "" }).ok && (readMessage({ bg: "Текст\u0007 с\u0000 нещо", en: "" }) as { bg: string }).bg === "Текст с нещо");
t("every refusal has its words", Object.values(MESSAGE_PROBLEM_TEXT).every((v) => !!v.bg && !!v.en));
t("every message says it is one-way — questions by e-mail (Реш. 54, 116)", messageText("Текст", "bg").endsWith(MESSAGE_FOOTER.bg) && messageText("Text", "en").endsWith(MESSAGE_FOOTER.en) && /не може да се отговори в портала/.test(MESSAGE_FOOTER.bg) && /cannot be answered in the portal/.test(MESSAGE_FOOTER.en));
// the history reads the codes as they are now — the coding act re-keys them (5.3; review)
const codeNow = (pid: string) => ({ p1: "26-01-T-1-07", p2: "26-01-T-1-03" } as Record<string, string>)[pid] ?? "—";
eq("the history's target, by the code as it is now", [messageTargetLabel({ kind: "all", count: 12, participantIds: [] }, "bg", codeNow), messageTargetLabel({ kind: "participation", participantId: "p1" }, "en", codeNow)], ["до всички участия (12)", "to 26-01-T-1-07"]);
eq("…a message to everyone that missed some: which ones", messageTargetLabel({ kind: "all", count: 1, participantIds: ["p1", "p2"], missed: ["p2"] }, "bg", codeNow), "до всички участия (1) — не стигна до: 26-01-T-1-03");
const toAll: SchemeMessage = { id: "m", at: "", by: "", to: { kind: "all", count: 1, participantIds: ["p1", "p2"], missed: ["p2"] }, bg: "", en: "" };
t("a participation's history: the messages to everyone that reached it — never one that missed it", messageReached(toAll, "p1") && !messageReached(toAll, "p2") && !messageReached(toAll, "p3") && messageReached({ ...toAll, to: { kind: "participation", participantId: "p3" } }, "p3"));
// the e-mail: a message written in Bulgarian only carries its text once (review)
const onlyBg = { id: "x", kind: "message" as const, audience: "lab" as const, createdAt: "", bg: messageText("Срокът е утре.", "bg"), en: messageText("Срокът е утре.", "en") };
const body = bodyFor(onlyBg, "https://p.example");
t("the e-mail of a message in Bulgarian only: its text ONCE, then both footers", body.split("Срокът е утре.").length === 2 && body.includes(MESSAGE_FOOTER.bg) && body.includes(MESSAGE_FOOTER.en));
const both = bodyFor({ ...onlyBg, en: messageText("The deadline is tomorrow.", "en") }, "");
t("…in both languages: each its own", both.includes("Срокът е утре.") && both.includes("The deadline is tomorrow."));
eq("the body without its footer (the history)", [messageBody(messageText("Текст", "bg"), "bg"), messageBody("без подпис", "bg")], ["Текст", "без подпис"]);
t("the footer names where questions go", /office@ptsbg\.eu/.test(MESSAGE_FOOTER.bg) && /office@ptsbg\.eu/.test(MESSAGE_FOOTER.en));

// ── released by its writer — a message only, a person only (Реш. 138) ──
t("a message to a laboratory, by a person: released by them", isWriterRelease("message", "lab", "ivan@ptsbg.eu") && isWriterRelease("message", "lab", "build"));
t("…never another kind, never to the provider, never by a system job, a template or the backlog", !isWriterRelease("docs.sent", "lab", "ivan@ptsbg.eu") && !isWriterRelease("message", "provider", "ivan@ptsbg.eu") && !isWriterRelease("message", "lab", "system:reminders") && !isWriterRelease("message", "lab", "template:results.due@v1") && !isWriterRelease("message", "lab", "migration-0016") && !isWriterRelease("message", "lab", "") && !isWriterRelease("message", "lab", undefined));
const m = await notify({ kind: "message", audience: "lab", schemeId: "S1", code: "26-01-T-1-07", bg: "Текст", en: "Text", releasedByWriter: "ivan@ptsbg.eu" });
t("notify: the message is out at once — in the portal and to be e-mailed, with its writer's approval", !!m && isOut(m) && isDeliverable(m) && m.releasedBy === "ivan@ptsbg.eu" && approvalFor(m)?.by === "ivan@ptsbg.eu" && classFor(m) === "provider");
const held = await notify({ kind: "docs.sent", audience: "lab", schemeId: "S1", code: "26-01-T-1-07", bg: "x", en: "x", releasedByWriter: "ivan@ptsbg.eu" });
t("…any other notice passed a writer stays HELD for a person (Реш. 138)", !!held && !held.releasedAt && !isOut(held));
const org = await notify({ kind: "message", audience: "lab", entityId: "E1", bg: "До организацията", en: "To the organisation", releasedByWriter: "ivan@ptsbg.eu" });
t("a message to an organisation: no scheme, no code — its entity; in its feed", !!org && org.entityId === "E1" && !org.code && !org.schemeId && (await listForEntity("E1")).some((n) => n.id === org!.id) && (await listForEntity("E2")).length === 0);
// erased on request (4.7): its messages blanked and closed off — the row stays (review)
const erased = await eraseEntityNotices("E1");
const after = (await listForEntity("E1")).find((n) => n.id === org!.id);
t("an organisation erased: its messages blanked and closed off, never waiting for ever", erased === 1 && after?.bg === ERASED_TEXT && after?.en === ERASED_TEXT && !!after?.emailedAt);

// ── the round export: the target, who, when coded; the text only in identity/ ──
const sch = { id: "S", number: "N", messages: [{ id: "m1", nonce: "n1", at: "2026-11-10T10:00:00Z", by: "ivan@ptsbg.eu", to: { kind: "participation", participantId: "p1" }, bg: "Лаборатория ЕкоЛаб закъснява", en: "EcoLab is late" }] } as unknown as Scheme;
const coded = codedScheme(sch) as { messages?: Record<string, unknown>[] };
const ident = identityScheme(sch) as { messages?: Record<string, unknown>[] };
t("export: the messages split — the coded part without the text a person wrote", SCHEME_FIELDS.messages === "split" && coded.messages?.length === 1 && !("bg" in coded.messages[0]) && !("en" in coded.messages[0]) && !!coded.messages[0].to);
t("…the identity part keeps them whole", ident.messages?.[0]?.bg === "Лаборатория ЕкоЛаб закъснява");

// ── migration 0041 ──
const sql = readFileSync(new URL("../supabase/migrations/0041_notification_entity.sql", import.meta.url), "utf8");
t("0041: the entity's id on a notice — nothing removed; recorded; listed", /alter table public\.notifications add column if not exists entity_id uuid;/.test(sql) && /create index if not exists notifications_entity on public\.notifications \(entity_id, created_at desc\) where entity_id is not null;/.test(sql) && /'0041_notification_entity'/.test(sql) && !/\bdrop\b/i.test(sql) && MIGRATIONS.includes("0041_notification_entity"));

// ── the wiring (source shape) ──
const act = readFileSync(new URL("../src/lib/actions.ts", import.meta.url), "utf8");
const part = act.slice(act.indexOf("export async function sendParticipationMessageAction"), act.indexOf("export async function sendSchemeMessageAction"));
const all = act.slice(act.indexOf("export async function sendSchemeMessageAction"), act.indexOf("export async function sendEntityMessageAction"));
const ent = act.slice(act.indexOf("export async function sendEntityMessageAction"));
// (each index checked present — a deleted call is -1, which is «before» everything: review)
const before = (f: string, a: string, b: string) => f.indexOf(a) >= 0 && f.indexOf(b) >= 0 && f.indexOf(a) < f.indexOf(b);
t("to one participation: who works with the participants in THIS scheme; a real participation of it; who to tell, then the form's token claimed in the lock, then the notice", /await requireCap\("participants\.manage", schemeId\);/.test(part) && /\.find\(\(p\) => p\.code === code\)/.test(part) && before(part, "labToTell(schemeId, code)", "updateSchemeWith(") && before(part, "updateSchemeWith(", "notifyMessage(") && /if \(\(s\.messages \?\? \[\]\)\.some\(\(m\) => m\.nonce === nonce\)\) \{ twice = true; return \{\}; \}/.test(part));
t("to everyone: each participation GOING ON — who to tell for ALL in ONE opening first; the token claimed; then the notices; the missed ones kept", /await requireCap\("participants\.manage", schemeId\);/.test(all) && /\.filter\(\(p\) => inFinalRound\(scheme!, p\)\)/.test(all) && before(all, "labIdsFor(schemeId, going, writer)", "updateSchemeWith(") && before(all, "updateSchemeWith(", "notifyMessage(") && /m\.nonce === nonce/.test(all) && /missed\.push\(p\.id\)/.test(all) && !/labToTell\(/.test(all));
t("to an organisation: the same message a moment ago is not sent twice", /messageBody\(n\.bg, "bg"\) === text\.bg && Date\.now\(\) - Date\.parse\(n\.createdAt\) < 10 \* 60_000/.test(ent));
t("to an organisation: who manages the laboratories' people; a real, active entity", /await requireCapAnywhere\("labs\.manage"\);/.test(ent) && /if \(!entity \|\| entity\.id !== entityId\) redirect/.test(ent) && /entity!\.state === "inactive"/.test(ent));
t("the journal names the target — never the text («message.oneway»; «message.sent» is each e-mail's, 1.8)", [part, all, ent].every((f) => /logActivity\("message\.oneway"/.test(f) && !/logActivity\("message\.oneway"[^)]*text\.(bg|en)/.test(f) && !/logActivity\("message\.sent"/.test(f)));
const deliver = readFileSync(new URL("../src/lib/notify-deliver.ts", import.meta.url), "utf8");
t("delivery to an organisation: an inactive or erased one closed off; its ACTIVE users who receive the notices; nobody yet — it waits, a month at most", /if \(n\.audience === "lab" && n\.entityId\) \{[\s\S]*?entity\.state === "inactive" \|\| entity\.erasedAt\) return \{ waiting: false, people: \[\] \};[\s\S]*?openEntityUsers\(\{ actor: "system:notify", purpose: "send" \}, \{ entityId: n\.entityId \}\)[\s\S]*?u\.state === "active" && u\.receivesNotices[\s\S]*?return \{ waiting: people\.length === 0 && !tooOld, people \};/.test(deliver));
t("…erasure on request blanks the organisation's messages too", /eraseEntityNotices\(String\(entityId\)\)/.test(act));
const composer = readFileSync(new URL("../src/components/MessageComposer.tsx", import.meta.url), "utf8");
t("the composer: a one-time token and a button that cannot be pressed twice while sending", /name="nonce" value=\{randomUUID\(\)\}/.test(composer) && /<PendingSubmit /.test(composer));
const overview = readFileSync(new URL("../src/app/lab/overview/page.tsx", import.meta.url), "utf8");
t("«Начало»: the organisation's messages with the participations' notices — by the session's own entity", /listForEntity\(entity\.id, 30\)/.test(overview) && /const \{ user, entity, persona \} = ps;/.test(overview));

console.log(`messages.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

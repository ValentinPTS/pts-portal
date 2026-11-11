// Send control (plan part 1.8, Реш. 138). Done when: no path reaches a laboratory
// without a stored approval. Driven here end to end in memory — notices, the chain
// notice, the reminder by its template, sendToLab itself — with the transport
// faked; then every place in the code that can hand an e-mail to a transport is
// accounted for, so a new one cannot slip past.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { notify, decideNotice, listHeld } from "../src/lib/notifications.ts";
import { deliverPending, approvalFor, classFor } from "../src/lib/notify-deliver.ts";
import { sendToLab, recordPending, listSent, isApproval, REDACTED, failedAttempts, recentCount } from "../src/lib/sent-messages.ts";
import { MAX_ATTEMPTS } from "../src/lib/notify-deliver.ts";
import { raiseDueReminders } from "../src/lib/notify-reminders.ts";
import { getReminderTemplate, saveReminderTemplate, approveReminderTemplate, isTemplateApproved, templateProblem, renderTemplate } from "../src/lib/reminder-templates.ts";
import { invitePreview, inviteText, LINK_PLACEHOLDER, SUPABASE_TEMPLATES, textKey } from "../src/lib/fixed-texts.ts";
import { addLab } from "../src/lib/labs.ts";
import { addParticipant } from "../src/lib/participants.ts";
import { updateSchemeWith, getScheme, addScheme } from "../src/lib/store.ts";
import { sofiaToday } from "../src/lib/clock.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };

// the transport, faked: every e-mail handed to it is seen here
const realFetch = globalThis.fetch;
let mails: { to: string; subject: string; text: string }[] = [];
const REFUSED = "refused@example.com"; // the provider refuses this one, every time
globalThis.fetch = (async (_u: unknown, init?: { body?: unknown }) => {
  const b = JSON.parse(String(init?.body ?? "{}"));
  mails.push({ to: (b.to ?? [])[0], subject: b.subject, text: b.text });
  return (b.to ?? [])[0] === REFUSED ? new Response("suppressed", { status: 422 }) : new Response("{}", { status: 200 });
}) as typeof fetch;
Object.assign(process.env, { MAIL_PROVIDER: "resend", MAIL_API_KEY: "k", MAIL_FROM: "PTS Bulgaria <portal@ptsbg.eu>" });

try {
  const lab = await addLab({ email: "lab-send@example.com", name: "Send control lab" });
  const sentRows = async () => (await listSent(500)).filter((m) => m.labId === lab.id);

  // ── a provider notice: held, then «Изпрати» by a person ────────────────────
  const n1 = (await notify({ kind: "docs.sent", audience: "lab", labId: lab.id, schemeId: "26-01-T-1", code: "111111", bg: "Документите са изпратени.", en: "The documents are sent.", href: "/lab" }))!;
  mails = [];
  await deliverPending(50, "https://portal.example");
  t("a held notice reaches nobody", mails.length === 0 && (await sentRows()).length === 0);
  t("…and has no approval", approvalFor(n1) === null);
  await decideNotice(n1.id, "release", "manager@ptsbg.eu");
  mails = [];
  await deliverPending(50, "https://portal.example");
  let rows = await sentRows();
  t("released by a person: e-mailed once", mails.length === 1 && mails[0].to === "lab-send@example.com", JSON.stringify(mails));
  t("…and on record BEFORE: class, the person, the notice", rows.length === 1 && rows[0].class === "provider" && rows[0].approvedBy === "manager@ptsbg.eu" && rows[0].approvalRef === `notice:${n1.id}` && rows[0].outcome === "sent", JSON.stringify(rows));
  t("…the record holds the exact text sent", rows[0]?.body === mails[0]?.text && rows[0]?.subject === mails[0]?.subject);
  mails = [];
  await deliverPending(50, "https://portal.example");
  t("…and is not sent twice", mails.length === 0 && (await sentRows()).length === 1);

  // ── withheld, and the 0016 backlog: never e-mailed ─────────────────────────
  const n2 = (await notify({ kind: "invoice.ready", audience: "lab", labId: lab.id, bg: "Проформа.", en: "Proforma." }))!;
  await decideNotice(n2.id, "withhold", "manager@ptsbg.eu");
  mails = [];
  await deliverPending(50, "");
  t("«Не изпращай»: never e-mailed", mails.length === 0);
  t("the 0016 backlog (shown in the portal only) carries no approval", approvalFor({ ...n1, releasedBy: "migration-0016" }) === null);
  t("a «template» release on anything but a reminder carries no approval", approvalFor({ ...n1, kind: "docs.sent", releasedBy: "template:results.due@v1 (approved by x)" }) === null);
  // since 5.6: the receipt reminder too — each released only by a template of its OWN kind
  t("…the receipt reminder by its own template: approved", approvalFor({ ...n1, kind: "receipt.due", releasedBy: "template:receipt.due@v2 (approved by x)" })?.by === "template:receipt.due@v2 (approved by x)");
  t("…never by another reminder's template", approvalFor({ ...n1, kind: "receipt.due", releasedBy: "template:results.due@v1 (approved by x)" }) === null && approvalFor({ ...n1, kind: "results.due", releasedBy: "template:receipt.due@v1 (approved by x)" }) === null);

  // ── the chain notice (D19): waits for «Изпрати» like a provider notice ─────
  const n3 = (await notify({ kind: "device.moved", audience: "lab", labId: lab.id, bg: "Уредът пътува към вас.", en: "The device is on its way." }))!;
  t("the chain notice is held", (await listHeld()).some((h) => h.id === n3.id) && classFor(n3) === "chain");
  await decideNotice(n3.id, "release", "staff@ptsbg.eu");
  mails = [];
  await deliverPending(50, "");
  rows = await sentRows();
  t("…released: on record as «chain», by the person", mails.length === 1 && rows.some((r) => r.class === "chain" && r.approvedBy === "staff@ptsbg.eu"));

  // ── the reminder: only by an approved template ────────────────────────────
  const S = "26-01-T-1";
  const p = await addParticipant({ schemeId: S, labName: "Send control lab", labId: lab.id }, "test");
  const tomorrow = (d: number) => sofiaToday(Date.now() + d * 86_400_000);
  await updateSchemeWith(S, () => ({ status: "running", dates: { resultsDue: tomorrow(1) }, remindedAt: {}, testClock: undefined }));
  let tpl = await getReminderTemplate("results.due");
  t("the starting template is not approved", !isTemplateApproved(tpl) && tpl.version === 1);
  await raiseDueReminders();
  const heldReminder = (await listHeld()).find((h) => h.kind === "results.due" && h.code === p.code);
  t("an unapproved template: the reminder is raised HELD", !!heldReminder);
  mails = [];
  await deliverPending(50, "");
  t("…and sends nothing by itself", mails.length === 0);

  t("approving a version not seen is refused", !(await approveReminderTemplate("results.due", "head@ptsbg.eu", 7)).ok);
  const ap = await approveReminderTemplate("results.due", "head@ptsbg.eu", 1);
  t("approving the version seen", ap.ok && isTemplateApproved((await getReminderTemplate("results.due"))));
  // the same deadline is reminded once (it waits held above); another round, due
  // tomorrow, is now reminded by the template
  const seed = (await getScheme(S))!;
  const SA = "26-91-T-1", SB = "26-92-T-1";
  await addScheme({ ...seed, id: SA, number: "PTS 26/09-T-1", status: "running", dates: { resultsDue: tomorrow(1) }, remindedAt: {} });
  await addScheme({ ...seed, id: SB, number: "PTS 26/09-T-2 see www.example.com", status: "running", dates: { resultsDue: tomorrow(1) }, remindedAt: {} });
  await addParticipant({ schemeId: SA, labName: "Send control lab", labId: lab.id }, "test");
  const pB = await addParticipant({ schemeId: SB, labName: "Send control lab", labId: lab.id }, "test");
  await raiseDueReminders();
  mails = [];
  await deliverPending(50, "");
  rows = (await sentRows()).filter((r) => r.class === "reminder");
  t("approved: the reminder goes out by itself", mails.length === 1 && rows.length === 1 && rows[0].schemeId === SA, JSON.stringify(mails));
  t("…but not a free-text scheme number: that one is HELD", (await listHeld()).some((h) => h.kind === "results.due" && h.schemeId === SB && h.code === pB.code));
  t("…its approval on record: the template's version and who approved it", rows[0]?.approvedBy === "template:results.due@v1 (approved by head@ptsbg.eu)", rows[0]?.approvedBy);
  t("…its words are the template's", /Напомняне: срокът за резултати/.test(rows[0]?.body ?? ""));

  // editing the text needs a new approval
  const sv = await saveReminderTemplate("results.due", "Утре, {date}, е срокът за резултати по {scheme}.", "Results for {scheme} are due tomorrow, {date}.", "staff@ptsbg.eu", 1);
  tpl = await getReminderTemplate("results.due");
  t("an edit raises the version and is not approved", sv.ok && tpl.version === 2 && !isTemplateApproved(tpl));
  t("an edit on a version not seen is refused", !(await saveReminderTemplate("results.due", "x {scheme} {date}", "y {scheme} {date}", "x", 1)).ok);
  const SC = "26-93-T-1";
  await addScheme({ ...seed, id: SC, number: "PTS 26/09-T-3", status: "running", dates: { resultsDue: tomorrow(1) }, remindedAt: {} });
  await addParticipant({ schemeId: SC, labName: "Send control lab", labId: lab.id }, "test");
  await raiseDueReminders();
  mails = [];
  await deliverPending(50, "");
  t("…so the next reminder waits for a person again", mails.length === 0 && (await listHeld()).some((h) => h.kind === "results.due" && h.schemeId === SC && /Утре,/.test(h.bg)));

  // a run that stopped half-way (its stamp given back) is retried without repeating anyone
  await updateSchemeWith(SB, () => ({ remindedAt: {} }));
  const r0 = await raiseDueReminders();
  t("a second run on the same deadline raises nobody twice", r0.remindersRaised === 0, JSON.stringify(r0));
  t("…exactly one such reminder exists", (await listHeld()).filter((h) => h.kind === "results.due" && h.schemeId === SB && h.code === pB.code).length === 1);

  // a notice the transport refuses for ever: given up after a few tries, not a row a day
  const refusedLab = await addLab({ email: REFUSED, name: "Refused lab" });
  const n4 = (await notify({ kind: "docs.sent", audience: "lab", labId: refusedLab.id, bg: "Документи.", en: "Documents." }))!;
  await decideNotice(n4.id, "release", "manager@ptsbg.eu");
  for (let i = 0; i < MAX_ATTEMPTS + 2; i++) await deliverPending(50, "");
  t(`a refused notice: ${MAX_ATTEMPTS} failed attempts on record, then given up`, (await failedAttempts(`notice:${n4.id}`)) === MAX_ATTEMPTS, String(await failedAttempts(`notice:${n4.id}`)));
  t("a durable count of what went to a laboratory lately", (await recentCount(lab.id, "docs.sent", Date.now() - 3_600_000)) >= 1 && (await recentCount(lab.id, "nothing", 0)) === 0);

  // ── sendToLab itself ──────────────────────────────────────────────────────
  const before = (await listSent(500)).length;
  mails = [];
  const msg = { class: "provider" as const, kind: "x", labId: lab.id, to: "lab-send@example.com", subject: "s", body: "b" };
  const r1 = await sendToLab(msg, null);
  const r2 = await sendToLab(msg, { by: " ", ref: "notice:1" });
  const r3 = await sendToLab({ ...msg, class: "other" as never }, { by: "a", ref: "b" });
  t("no approval → refused, nothing sent, nothing recorded", !r1.ok && !r2.ok && !r3.ok && mails.length === 0 && (await listSent(500)).length === before);
  t("…and recordPending makes no record without one", (await recordPending(msg, null)) === null && !isApproval({ by: "", ref: "x" }));
  const link = "https://portal.example/auth/confirm?token_hash=SECRET-TOKEN-123&type=invite";
  const r4 = await sendToLab({ ...msg, body: inviteText(link), secrets: [link] }, { by: "manager@ptsbg.eu", ref: "invite:abc" });
  const rec = (await listSent(500)).find((m) => m.id === r4.recordId);
  t("an invitation: the e-mail carries the link", r4.ok && mails.at(-1)?.text.includes("SECRET-TOKEN-123") === true);
  t("…the record keeps the words, never a link that still works", !!rec && !rec.body.includes("SECRET-TOKEN-123") && rec.body.includes(REDACTED));
  delete process.env.MAIL_PROVIDER;
  const r5 = await sendToLab(msg, { by: "a", ref: "b" });
  t("mail off: nothing sent and nothing recorded as sent", !r5.ok && r5.skipped === true && (await listSent(500)).length === before + 1);
  process.env.MAIL_PROVIDER = "resend";
  process.env.PTS_ENVIRONMENT = "test";
  const r6 = await sendToLab(msg, { by: "a", ref: "b" });
  t("the test environment: no laboratory outside @ptsbg.eu", !r6.ok && r6.skipped === true);
  delete process.env.PTS_ENVIRONMENT;
} finally {
  globalThis.fetch = realFetch;
  for (const k of ["MAIL_PROVIDER", "MAIL_API_KEY", "MAIL_FROM", "PTS_ENVIRONMENT"]) delete process.env[k];
}

// ── templates: the rules ────────────────────────────────────────────────────
t("both placeholders, both languages", templateProblem("a {scheme} {date}", "b {scheme} {date}") === null && templateProblem("a {scheme}", "b {scheme} {date}") === "missing-placeholder");
t("no unknown placeholder (nothing could carry a lab's name)", templateProblem("a {scheme} {date} {lab}", "b {scheme} {date}") === "unknown-placeholder");
t("not empty, not too long", templateProblem(" ", "b") === "empty" && templateProblem("x".repeat(601) + "{scheme}{date}", "b {scheme} {date}") === "too-long");
t("every placeholder is filled", renderTemplate({ bg: "{scheme} {scheme} {date}", en: "{date}" }, { scheme: "S", date: "D" }).bg === "S S D");

// ── the invitation: the text shown is the text sent ─────────────────────────
const inv = invitePreview();
t("the preview is the invitation with the link left out", inv.body === inviteText(LINK_PLACEHOLDER) && inv.key === textKey(inv.subject, inv.body) && inv.key.length === 12);

// ── every way out of the portal, accounted for ──────────────────────────────
const root = fileURLToPath(new URL("../src/", import.meta.url));
const files: string[] = [];
const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(f)) files.push(p); } };
walk(root);
const src = (rel: string) => readFileSync(join(root, rel), "utf8");
const callsOf = (re: RegExp) => files.flatMap((f) => (readFileSync(f, "utf8").match(re) ?? []).map(() => f.slice(root.length)));
const count = (list: string[]) => list.reduce<Record<string, number>>((a, f) => ((a[f] = (a[f] ?? 0) + 1), a), {});

// any call, awaited or not; no other name for it; no other way to a mail provider
const sendCalls = count(callsOf(/(?<!function )\bsendEmail\(/g));
t("sendEmail is called in exactly four places", JSON.stringify(sendCalls) === JSON.stringify({ "lib/actions.ts": 2, "lib/notify-deliver.ts": 1, "lib/sent-messages.ts": 1 }), JSON.stringify(sendCalls));
t("…under no other name", callsOf(/sendEmail as |sendEmail:/g).length === 0);
// (lib/processors.ts NAMES them — the registry of outside services, 1.12 — and calls nothing)
const apiNames = count(callsOf(/api\.resend\.com|api\.sendgrid\.com|smtp\./g));
delete apiNames["lib/processors.ts"];
t("the mail providers' APIs: only in lib/mail.ts", JSON.stringify(apiNames) === JSON.stringify({ "lib/mail.ts": 2 }), JSON.stringify(apiNames));
t("…the registry only names them, it calls nothing", !/fetch\(|sendEmail|createClient/.test(readFileSync(join(root, "lib/processors.ts"), "utf8")));
t("no Supabase «resend» and no e-mail change from the portal", callsOf(/\.auth\.resend\(|updateUser\(\{[^}]*email/g).length === 0);
const aa = src("lib/auth-actions.ts");
t("a new password (Supabase then tells the person): twice, each on record first for a laboratory",
  JSON.stringify(count(callsOf(/\.auth\.updateUser\(/g))) === JSON.stringify({ "lib/auth-actions.ts": 2 })
  && (aa.match(/const notice = await recordForLab\(session\.email, "password-changed", "password\.changed", undefined, session\.userId\);\s*if \(notice === false\) return[^\n]*\n\s*const supabase = await createServerSupabase\(\);\s*const \{ error \} = await supabase\.auth\.updateUser\(\{ password \}\);\s*if \(notice\) await settle\(notice/g) ?? []).length === 2);
t("…the laboratory lookup fails CLOSED", /try \{ lab = await getLabByEmail\(email\); \} catch \{ return false; \}/.test(aa));
const deliver = src("lib/notify-deliver.ts");
t("…delivery: a laboratory only through sendToLab with its approval; sendEmail for PTS's own inbox",
  /if \(n\.audience !== "lab"\) \{\s*\/\/ to PTS's own inbox: not a participant\s*const res = await sendEmail\(/.test(deliver) && /await sendToLab\(\{ class: classFor\(n\), kind: n\.kind, labId: n\.labId, entityId: r\.entityId, schemeId: n\.schemeId, code: n\.code, to: r\.to, subject, body: text \}, approvalFor\(n\)\)/.test(deliver));
const actions = src("lib/actions.ts");
const invite = actions.slice(actions.indexOf("async function sendAuthInvite"), actions.indexOf("// The invitation's words live in lib/fixed-texts.ts"));
t("…the invitation: a laboratory only through sendToLab; sendEmail for PTS's team", /const sent = lab\s*(\/\/[^\n]*\n\s*)?\? await sendToLab\([\s\S]*?lab\.approval\)\s*: await sendEmail\(/.test(invite));
t("…and Supabase's own invitation never for a laboratory", /if \(lab && !\(isMailConfigured\(\) && origin\)\) \{\s*return \{ ok: false/.test(invite) && invite.indexOf("if (lab && !(isMailConfigured() && origin))") < invite.indexOf("inviteUserByEmail"));
t("…the test e-mail: to the signed-in person's own address", /sendEmail\(\{ to: ctx\.email,/.test(actions));
t("…a staff invitation never to a laboratory's address (fail closed)", /if \(!lab\) \{\s*try \{\s*if \(await labEmailInUse\(email\)\) return \{ ok: false[\s\S]{0,200}catch \{\s*return \{ ok: false/.test(invite));
t("…and only for an existing team member", /export async function inviteStaffAction[\s\S]{0,600}if \(!\(await getStaffByEmail\(e\)\)\) return \{ error:/.test(actions));
// …and a participant's user's (4.4): the portal's own mailer only — its steps in
// lib/participant-invite (tested there with a fake Supabase): an account, linked BEFORE
// the e-mail, the e-mail on record first (sendToLab)
const pInvite = actions.slice(actions.indexOf("async function sendParticipantInvite"), actions.indexOf("export async function saveProfileAction"));
t("inviteUserByEmail, generateLink: only in sendAuthInvite and sendParticipantInvite", JSON.stringify(count(callsOf(/\.auth\.admin\.(inviteUserByEmail|generateLink)\(/g))) === JSON.stringify({ "lib/actions.ts": 3 }) && (invite.match(/\.auth\.admin\.(inviteUserByEmail|generateLink)\(/g) ?? []).length === 2 && (pInvite.match(/\.auth\.admin\.generateLink\(/g) ?? []).length === 1 && !/inviteUserByEmail/.test(pInvite));
t("…a participant's user's: no portal mail, nothing; sent on record with its approval; the test environment's rule first", /if \(!db \|\| !isMailConfigured\(\) \|\| !origin\) return \{ error:/.test(pInvite) && /send: \(link\) => sendToLab\(\{ class: cls, kind: "invite", entityId: u\.entityId, to: u\.email, subject: testSubject\(INVITE_SUBJECT\), body: inviteText\(link\), secrets: \[link\] \}, approval\)/.test(pInvite) && /if \(!mailAllowedHere\(u\.email\)\) return/.test(pInvite));
const labInvite = actions.slice(actions.indexOf("export async function inviteLabByIdAction"), actions.indexOf("// ── Lab onboarding"));
t("a laboratory's invitation: the key of the text shown, else nothing", /if \(typeof textKey !== "string" \|\| textKey !== shown\.key\) return \{ error:/.test(labInvite) && labInvite.indexOf("textKey !== shown.key") < labInvite.indexOf("sendAuthInvite("));
t("…sent with the manager as its approval", /sendAuthInvite\(lab\.email, \{ labId: lab\.id, approval: \{ by, ref: `invite:\$\{shown\.key\}` \} \}\)/.test(labInvite));
const addLabSrc = actions.slice(actions.indexOf("export async function addLabAction"), actions.indexOf("export async function inviteLabByIdAction"));
t("adding a laboratory sends nothing", !/sendAuthInvite\(/.test(addLabSrc));
t("resetPasswordForEmail: once, a laboratory's on record before it, durably throttled", JSON.stringify(count(callsOf(/\.resetPasswordForEmail\(/g))) === JSON.stringify({ "lib/auth-actions.ts": 1 })
  && /const recordId = await recordForLab\(email, "password-reset", "password\.reset", 3\);\s*if \(recordId === false\) return;/.test(aa)
  && aa.indexOf('recordForLab(email, "password-reset"') < aa.indexOf(".resetPasswordForEmail("));
t("no record without a database on a deployment", /if \(!db\) \{\s*if \(dbMode\(\)\.strict\) return null;/.test(src("lib/sent-messages.ts")));
const reminders = src("lib/notify-reminders.ts");
t("the reminder job claims the deadline first, gives it back on an error", /if \(cur\.remindedAt\?\.\[stamp\]\) return \{\};\s*claimed = true;/.test(reminders) && /catch \(e\) \{[\s\S]{0,500}delete rest\[stamp\]/.test(reminders));
t("…an automatic reminder only with a scheme number that parses", /const auto = byTemplate && parseSchemeNumber\(s\.number\) \? byTemplate : undefined;/.test(reminders) && /releasedByTemplate: auto,/.test(reminders));
t("the daily job: a failed reminder run still delivers", /raiseDueReminders\(\)\.catch\(/.test(src("app/api/cron/notify/route.ts")));
t("no other way to send: no signInWithOtp, signUp, or a second mail client", callsOf(/\.auth\.(signInWithOtp|signUp)\(|nodemailer|api\.postmarkapp|api\.mailgun/g).length === 0);
// the results reminder and, since 5.6, the receipt reminder — both from the reminder job
t("a reminder's template release: only from the reminder job", JSON.stringify(count(callsOf(/releasedByTemplate: /g))) === JSON.stringify({ "lib/notify-reminders.ts": 2 }));
// since 5.6 also the receipt reminder — each by a template of its own kind
t("…and only for a laboratory's reminder, by a template of its own kind", /rest\.audience === "lab" && isReminderKind\(rest\.kind\) && releasedByTemplate\.startsWith\(`template:\$\{rest\.kind\}@`\)/.test(src("lib/notifications.ts")) && /REMINDER_KINDS: readonly ReminderKind\[\] = \["results\.due", "receipt\.due"\]/.test(src("lib/reminder-templates.ts")));
t("«Изпрати» on a notice: who releases documents, in the notice's own scheme, recorded with who", /export async function decideNoticeAction[\s\S]{0,120}await requireCapAnywhere\("docs\.release"\);[\s\S]{0,400}if \(!notice \|\| !\(await mayNow\("docs\.release", notice\.schemeId\)\)\) redirect[\s\S]{0,1600}decideNotice\(id, decision, by\)/.test(actions)); // 10.1: the «next scheme» release guard sits between (and the sweep's courier guard, R2S-3)
t("the template's approval: the head (texts.approve, 2.4), the version seen", /export async function approveReminderTemplateAction[\s\S]{0,80}await requireCap\("texts\.approve"\);[\s\S]{0,400}approveReminderTemplate\(kind, by, seen\)/.test(actions));

// the fixed texts: the links in the code are the links in the setup guide
const guide = fileURLToPath(new URL("../../docs/participant-portal/AUTH-EMAILS-SETUP-BG.md", import.meta.url));
if (existsSync(guide)) {
  const g = readFileSync(guide, "utf8");
  t("Supabase's templates: the same links as AUTH-EMAILS-SETUP-BG.md", SUPABASE_TEMPLATES.every((x) => !x.link || g.includes(x.link)), SUPABASE_TEMPLATES.filter((x) => x.link && !g.includes(x.link)).map((x) => x.key).join());
  t("…which keeps the 2FA notices OFF (the portal could not record them)", /MFA factor enrolled \/ unenrolled[^\n]*\*\*изключени\*\*/.test(g));
}

console.log(`send-control.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

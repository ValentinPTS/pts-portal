// The portal's mail (plan part 1.7): only a known provider ever gets the key; replies
// go where MAIL_REPLY_TO says; the system check shows the setup, never the key; the
// test e-mail goes to the signed-in person only.
import { readFileSync } from "node:fs";
import { sendEmail, isMailConfigured, mailSetup } from "../src/lib/mail.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };

const KEYS = ["PTS_ENVIRONMENT", "MAIL_PROVIDER", "MAIL_API_KEY", "MAIL_FROM", "MAIL_REPLY_TO"];
const set = (env: Record<string, string>) => { for (const k of KEYS) delete process.env[k]; Object.assign(process.env, env); };

const realFetch = globalThis.fetch;
let calls: { url: string; body: Record<string, unknown> }[] = [];
globalThis.fetch = (async (u: unknown, init?: { body?: unknown }) => {
  calls.push({ url: String(u), body: JSON.parse(String(init?.body ?? "{}")) });
  return new Response("{}", { status: 200 });
}) as typeof fetch;

try {
  // an unknown provider is no provider: nothing is posted anywhere
  set({ MAIL_PROVIDER: "brevo", MAIL_API_KEY: "k", MAIL_FROM: "PTS <portal@ptsbg.eu>" });
  t("an unknown provider is not configured", !isMailConfigured());
  calls = [];
  const r0 = await sendEmail({ to: "a@example.com", subject: "s", text: "x" });
  t("…and sends nothing, to no vendor", !r0.ok && calls.length === 0, JSON.stringify(calls));

  // Resend: the reply-to goes in the payload
  set({ MAIL_PROVIDER: "resend", MAIL_API_KEY: "k", MAIL_FROM: "PTS Bulgaria <portal@ptsbg.eu>", MAIL_REPLY_TO: "office@ptsbg.eu" });
  calls = [];
  const r1 = await sendEmail({ to: "a@example.com", subject: "s", text: "x" });
  t("resend: sent to Resend's API", r1.ok && calls.length === 1 && calls[0].url === "https://api.resend.com/emails");
  t("resend: replies go to office@ptsbg.eu", calls[0]?.body.reply_to === "office@ptsbg.eu", JSON.stringify(calls[0]?.body));
  t("resend: from the sender as set", calls[0]?.body.from === "PTS Bulgaria <portal@ptsbg.eu>");

  // SendGrid: its own shape
  set({ MAIL_PROVIDER: "SendGrid", MAIL_API_KEY: "k", MAIL_FROM: "PTS Bulgaria <portal@ptsbg.eu>", MAIL_REPLY_TO: "office@ptsbg.eu" });
  calls = [];
  await sendEmail({ to: "a@example.com", subject: "s", text: "x" });
  t("sendgrid (any letter case): to SendGrid's API", calls.length === 1 && calls[0].url === "https://api.sendgrid.com/v3/mail/send");
  t("sendgrid: reply_to as an object", JSON.stringify(calls[0]?.body.reply_to) === JSON.stringify({ email: "office@ptsbg.eu" }), JSON.stringify(calls[0]?.body));

  // no reply-to, or a broken one: none is sent (replies go to the sender)
  set({ MAIL_PROVIDER: "resend", MAIL_API_KEY: "k", MAIL_FROM: "portal@ptsbg.eu", MAIL_REPLY_TO: "not an address" });
  calls = [];
  await sendEmail({ to: "a@example.com", subject: "s", text: "x" });
  t("a broken MAIL_REPLY_TO is left out", calls.length === 1 && !("reply_to" in calls[0].body), JSON.stringify(calls[0]?.body));

  // SendGrid with a bare address: no display name made of the address
  set({ MAIL_PROVIDER: "sendgrid", MAIL_API_KEY: "k", MAIL_FROM: "portal@ptsbg.eu" });
  calls = [];
  await sendEmail({ to: "a@example.com", subject: "s", text: "x" });
  t("sendgrid: a bare sender has no name", JSON.stringify(calls[0]?.body.from) === JSON.stringify({ email: "portal@ptsbg.eu" }), JSON.stringify(calls[0]?.body.from));

  // the test environment still mails @ptsbg.eu only
  set({ PTS_ENVIRONMENT: "test", MAIL_PROVIDER: "resend", MAIL_API_KEY: "k", MAIL_FROM: "portal@ptsbg.eu" });
  calls = [];
  const r2 = await sendEmail({ to: "lab@example.com", subject: "s", text: "x" });
  t("test environment: no mail outside @ptsbg.eu", !r2.ok && calls.length === 0);
} finally {
  globalThis.fetch = realFetch;
  for (const k of KEYS) delete process.env[k];
}

// what the system check shows — never the key
const s1 = mailSetup({ MAIL_PROVIDER: "resend", MAIL_API_KEY: "secret-value", MAIL_FROM: "PTS Bulgaria <Portal@PTSBG.eu>", MAIL_REPLY_TO: "office@ptsbg.eu", PTS_NOTIFY_EMAIL: "x@ptsbg.eu" });
t("setup: the provider, whether the key is set, the sender on ptsbg.eu", s1.provider === "resend" && s1.keySet && s1.fromOnPtsbg && s1.replyTo === "office@ptsbg.eu", JSON.stringify(s1));
t("setup: the key's value is nowhere in it", !JSON.stringify(s1).includes("secret-value"));
const s2 = mailSetup({ MAIL_PROVIDER: "brevo", MAIL_FROM: "PTS <someone@gmail.com>" });
t("setup: an unknown provider is «unknown», its value never echoed; a sender elsewhere is «temporary»", s2.provider === "unknown" && !s2.keySet && !s2.fromOnPtsbg, JSON.stringify(s2));
t("setup: a key pasted into MAIL_PROVIDER is not shown", !JSON.stringify(mailSetup({ MAIL_PROVIDER: "re_SecretKey123" })).includes("SecretKey"));
t("setup: a broken MAIL_REPLY_TO is reported as such", !mailSetup({ MAIL_REPLY_TO: "not an address" }).replyToValid && s1.replyToValid);
t("setup: nothing set", mailSetup({}).provider === "" && !mailSetup({}).fromOnPtsbg && mailSetup({}).from === "");
t("setup: a lookalike domain is not ptsbg.eu", !mailSetup({ MAIL_FROM: "a@ptsbg.eu.evil.com" }).fromOnPtsbg && !mailSetup({ MAIL_FROM: "a@xptsbg.eu" }).fromOnPtsbg);

// the test e-mail: the signed-in person's own address, with login on, journalled without it
const actions = readFileSync(new URL("../src/lib/actions.ts", import.meta.url), "utf8");
const tm = actions.slice(actions.indexOf("export async function sendTestMailAction"), actions.indexOf("export async function setStaffRoleAction"));
t("the test e-mail: the technical side (2.4), with login on, to their own address only", /await requireCap\("system\.technical"\);[^\n]*\n[\s\S]{0,80}if \(!ctx\.authEnabled \|\| !ctx\.email\) return \{ error: "no-login" \};[\s\S]{0,200}sendEmail\(\{ to: ctx\.email,/.test(tm));
t("…marked in the test environment, journalled without the address", /subject: testSubject\(TEST_MAIL_SUBJECT\)/.test(tm) && (tm.match(/logActivity\("mail\.test", \{ summary: "[^"$]*" \}\)/g) ?? []).length === 2);
const odd = actions.split("\n").filter((l) => /^export /.test(l) && !/^export (async function |type |interface )/.test(l));
t("a server-action file exports only async functions (and types)", odd.length === 0, odd.join("\n"));

console.log(`mail.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

// Delivering the outbox, and the day-before reminder. No transport is configured
// in a bare node run, so nothing is ever actually sent — which is itself one of
// the things asserted here.
import { looksLikeEmail, isMailConfigured, sendEmail } from "../src/lib/mail.ts";
import { subjectFor, bodyFor, recipientFor, deliverPending } from "../src/lib/notify-deliver.ts";
import { reminderKey, alreadyReminded, stillOwesResults } from "../src/lib/notify-reminders.ts";
import { notify, listUndelivered, decideNotice } from "../src/lib/notifications.ts";
import { addLab } from "../src/lib/labs.ts";
import type { Notification, Participant } from "../src/lib/types.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error("✗ " + n); } };

// ── the safety default ───────────────────────────────────────────────────────
ok("no transport configured out of the box", !isMailConfigured());
{
  const r = await sendEmail({ to: "someone@example.com", subject: "x", text: "y" });
  ok("an unconfigured send is skipped, not attempted", !r.ok && r.skipped === true);
}
{
  const r = await deliverPending(10);
  ok("an unconfigured flush touches nothing",
    !r.configured && r.considered === 0 && r.sent === 0 && r.failed === 0);
}

// ── addresses ────────────────────────────────────────────────────────────────
ok("a normal address passes", looksLikeEmail("lab@example.bg"));
for (const junk of ["", "   ", "nope", "a@b", "a@b.", "@b.bg", "a b@c.bg", "a@c.bg, d@e.bg", "a@c.bg;x", "<a@c.bg>"]) {
  ok(`"${junk}" is refused`, !looksLikeEmail(junk));
}
ok("an over-long address is refused", !looksLikeEmail("a".repeat(250) + "@example.bg"));

// ── what actually goes out ───────────────────────────────────────────────────
const n = (over: Partial<Notification> = {}): Notification => ({
  id: "n1", kind: "results.due", audience: "lab", labId: "LAB-1", schemeId: "S1",
  code: "267101", bg: "Напомняне: срокът е утре.", en: "Reminder: due tomorrow.",
  href: "/lab", createdAt: "2026-08-03T06:00:00Z", ...over,
});

ok("the subject never carries the code", !subjectFor(n()).includes("267101"));
ok("provider and lab get different subjects", subjectFor(n()) !== subjectFor(n({ audience: "provider" })));
{
  const body = bodyFor(n(), "https://portal.example.com/");
  ok("both languages are in the body", body.includes("срокът е утре") && body.includes("due tomorrow"));
  ok("the link is absolute and de-duplicated of slashes", body.includes("https://portal.example.com/lab"));
  ok("no laboratory name can appear — only the recorded text",
    !/лаборатори|laborator/i.test(body.replace(/PTS Bulgaria/g, "")));
}
ok("no href → no dangling link", !bodyFor(n({ href: undefined }), "https://x.test").includes("https://x.test"));
ok("no base url → no broken link", !bodyFor(n(), "").includes("undefined"));

// ── recipients ───────────────────────────────────────────────────────────────
const lab = await addLab({ email: "Chase@Lab.BG", name: "Chase Lab" });
ok("a lab notice goes to that lab's account", (await recipientFor(n({ labId: lab.id }))) === "chase@lab.bg");
ok("a lab notice with no lab has nobody", (await recipientFor(n({ labId: undefined }))) === "");
ok("an unknown lab id has nobody", (await recipientFor(n({ labId: "nope" }))) === "");
ok("a provider notice needs PTS_NOTIFY_EMAIL", (await recipientFor(n({ audience: "provider" }))) === "");

// ── the outbox still records while mail is off ───────────────────────────────
{
  const before = (await listUndelivered(100)).length;
  const raised = await notify({ kind: "results.due", audience: "lab", labId: lab.id, bg: "бг", en: "en" });
  // Реш. 138 (part 0.8): held until a person releases it — only then is it queued
  ok("a held lab notice is not queued", (await listUndelivered(100)).length === before);
  await decideNotice(raised!.id, "release", "test");
  ok("a notice raised with no transport is still queued", (await listUndelivered(100)).length === before + 1);
}

// ── the test environment mails only @ptsbg.eu, marked as a test (part 1.2) ─────
{
  const posted: string[] = [];
  const realFetch = globalThis.fetch;
  const saved = { ...process.env };
  globalThis.fetch = (async (_u: unknown, init?: { body?: unknown }) => {
    posted.push(String(init?.body ?? ""));
    return new Response("{}", { status: 202 });
  }) as typeof fetch;
  Object.assign(process.env, { PTS_ENVIRONMENT: "test", MAIL_PROVIDER: "sendgrid", MAIL_API_KEY: "x", MAIL_FROM: "PTS <office@ptsbg.eu>" });
  try {
    const simLab = await addLab({ email: "sim-lab-1@ptsbg.eu", name: "Sim lab" });
    for (const labId of [lab.id, simLab.id]) {
      const raised = await notify({ kind: "results.due", audience: "lab", labId, bg: "бг", en: "en" });
      await decideNotice(raised!.id, "release", "test");
    }
    const r = await deliverPending(100);
    ok("test environment: the PTS mailbox is mailed", r.sent >= 1 && posted.some((b) => b.includes("sim-lab-1@ptsbg.eu")));
    ok("test environment: a real laboratory is never mailed", !posted.some((b) => b.includes("chase@lab.bg")) && r.skipped >= 1);
    ok("test environment: the subject says TEST", posted.length > 0 && posted.every((b) => b.includes("[ТЕСТ / TEST]")));
    ok("test environment: a skipped notice is closed off, not retried", !(await listUndelivered(100)).some((x) => x.labId === lab.id));
  } finally {
    globalThis.fetch = realFetch;
    for (const k of ["PTS_ENVIRONMENT", "MAIL_PROVIDER", "MAIL_API_KEY", "MAIL_FROM"]) {
      if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    }
  }
}

// ── the reminder ─────────────────────────────────────────────────────────────
ok("the reminder key is per deadline DATE", reminderKey("resultsDue", "2026-08-04") === "resultsDue:2026-08-04");
ok("nothing reminded yet", !alreadyReminded({ remindedAt: undefined }, "resultsDue", "2026-08-04"));
ok("a stamped deadline is not reminded twice",
  alreadyReminded({ remindedAt: { "resultsDue:2026-08-04": "2026-08-03T06:00:00Z" } }, "resultsDue", "2026-08-04"));
ok("MOVING the deadline reminds again",
  !alreadyReminded({ remindedAt: { "resultsDue:2026-08-04": "x" } }, "resultsDue", "2026-08-11"));
ok("a stamp for another date does not silence this one",
  !alreadyReminded({ remindedAt: { "dispatch:2026-08-04": "x" } }, "resultsDue", "2026-08-04"));

const p = (status: Participant["status"]): Participant =>
  ({ status } as Participant);
for (const s of ["applied", "approved", "invoiced", "paid", "dispatched", "received"] as const) {
  ok(`${s} still owes results`, stillOwesResults(p(s)));
}
ok("a lab that already submitted is not chased", !stillOwesResults(p("submitted")));
ok("a scored lab is not chased", !stillOwesResults(p("scored")));

console.log(`notify-delivery.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

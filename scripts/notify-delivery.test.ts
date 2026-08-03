// Delivering the outbox, and the day-before reminder. No transport is configured
// in a bare node run, so nothing is ever actually sent — which is itself one of
// the things asserted here.
import { looksLikeEmail, isMailConfigured, sendEmail } from "../src/lib/mail.ts";
import { subjectFor, bodyFor, recipientFor, deliverPending } from "../src/lib/notify-deliver.ts";
import { reminderKey, alreadyReminded, stillOwesResults } from "../src/lib/notify-reminders.ts";
import { notify, listUndelivered } from "../src/lib/notifications.ts";
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
  await notify({ kind: "results.due", audience: "lab", labId: lab.id, bg: "бг", en: "en" });
  ok("a notice raised with no transport is still queued", (await listUndelivered(100)).length === before + 1);
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

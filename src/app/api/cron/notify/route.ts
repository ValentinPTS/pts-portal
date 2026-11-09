import type { NextRequest } from "next/server";
import { raiseDueReminders } from "@/lib/notify-reminders";
import { sofiaToday } from "@/lib/clock";
import { deliverPending, mailBaseUrl } from "@/lib/notify-deliver";
import { logAs } from "@/lib/activity";

// The daily pass: raise the reminders that are due, then deliver everything the
// outbox is still holding. In that order, so a reminder raised now goes out in the
// same run rather than waiting a day.
//
// Both halves are safe to run more than once: a reminder is stamped per deadline
// date, and a delivered notice is stamped with emailed_at.
//
// GUARDED by CRON_SECRET. Vercel sends it as `Authorization: Bearer <secret>`; a
// missing secret means the route is OFF rather than open, because this endpoint
// sends real e-mail to real laboratories. There is no session here to fall back on.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("Cron not configured", { status: 503 });
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });

  // Bulgaria's day, not the server's UTC date; each round reads its own clock
  // (lib/clock — moved only in the test environment).
  const todayIso = sofiaToday(Date.now());
  // Absolute links in the e-mails — the same base the notices page shows (1.8)
  const baseUrl = mailBaseUrl();

  // each half on its own (part 1.8): a reminder job that fails does not keep the
  // day's notices — the provider's own included — from being delivered
  let remindersError = "";
  const reminders = await raiseDueReminders().catch((e) => {
    remindersError = (e as Error)?.message ?? String(e);
    console.error("[cron/notify] reminders failed:", remindersError);
    return { schemesChecked: 0, remindersRaised: 0, schemesReminded: [] as string[] };
  });
  const delivery = await deliverPending(100, baseUrl);

  // Worth an audit line only when it actually did something.
  if (reminders.remindersRaised || delivery.sent || delivery.failed || remindersError) {
    await logAs({ kind: "system" }, "notify.run", {
      summary:
        `Daily notifications: ${reminders.remindersRaised} reminder(s) raised`
        + `, ${delivery.sent} e-mail(s) sent`
        + (delivery.failed ? `, ${delivery.failed} failed` : "")
        + (delivery.skipped ? `, ${delivery.skipped} not mailed (no address, outside @ptsbg.eu in the test environment, or given up)` : "")
        + (remindersError ? `; the reminder job FAILED: ${remindersError.slice(0, 160)}` : ""),
    });
  }

  return Response.json({ ok: !remindersError, todayIso, reminders, delivery, ...(remindersError ? { remindersError } : {}) });
}

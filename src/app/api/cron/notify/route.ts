import type { NextRequest } from "next/server";
import { raiseDueReminders } from "@/lib/notify-reminders";
import { deliverPending } from "@/lib/notify-deliver";
import { logActivity } from "@/lib/activity";

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

  // The scheme's day, not the server's instant: a run just after midnight UTC must
  // still mean "today" for a Bulgarian working day.
  const todayIso = new Date().toISOString().slice(0, 10);
  // Absolute links in the e-mails. VERCEL_URL has no scheme, hence the prefix.
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

  const reminders = await raiseDueReminders(todayIso);
  const delivery = await deliverPending(100, baseUrl);

  // Worth an audit line only when it actually did something.
  if (reminders.remindersRaised || delivery.sent || delivery.failed) {
    await logActivity("notify.run", {
      summary:
        `Daily notifications: ${reminders.remindersRaised} reminder(s) raised`
        + `, ${delivery.sent} e-mail(s) sent`
        + (delivery.failed ? `, ${delivery.failed} failed` : "")
        + (delivery.skipped ? `, ${delivery.skipped} with no address` : ""),
    });
  }

  return Response.json({ ok: true, todayIso, reminders, delivery });
}

import type { Scheme, Participant } from "./types";
import { listSchemes, updateSchemeWith } from "./store";
import { listParticipants } from "./participants";
import { dueIn, DATE_LABELS, fmtSchemeDate, type SchemeDateKey } from "./scheme-dates";
import { notify } from "./notifications";

// ─────────────────────────────────────────────────────────────────────────────
// The day-before reminder.
//
// What he asked for, exactly: "reminders maybe a day before the deadline and to
// be simple, nothing to approve". So — one notice, one day before, to the
// laboratories who still have something to do. Not a countdown, not an escalation,
// and nothing that changes state or blocks anybody.
//
// Only "results due" reminds. The other three dates are the provider's own
// milestones: a laboratory can do nothing about a dispatch date or a report date,
// and a reminder it cannot act on is noise.
//
// It reminds only participations that have NOT already returned results. Chasing a
// laboratory that already sent its sheet is exactly the sort of thing that teaches
// people to ignore the messages.
// ─────────────────────────────────────────────────────────────────────────────

/** Reminded once per deadline DATE, so moving the date legitimately reminds again. */
export const reminderKey = (key: SchemeDateKey, iso: string): string => `${key}:${iso}`;

/** Has this exact deadline already been reminded about? */
export const alreadyReminded = (s: Pick<Scheme, "remindedAt">, key: SchemeDateKey, iso: string): boolean =>
  !!s.remindedAt?.[reminderKey(key, iso)];

/**
 * Which participations still owe results. "submitted" and "scored" are past it;
 * anything earlier still has the sheet to return.
 */
export const stillOwesResults = (p: Participant): boolean =>
  p.status !== "submitted" && p.status !== "scored";

export interface ReminderReport {
  schemesChecked: number;
  remindersRaised: number;
  schemesReminded: string[];
}

/**
 * Raise the reminders due today. Idempotent: the second run of a day finds the
 * deadline already stamped and does nothing.
 *
 * Only records notices — delivery is deliverPending's job, so a mail outage
 * cannot lose a reminder and the laboratory still sees it in the portal.
 */
export async function raiseDueReminders(todayIso: string): Promise<ReminderReport> {
  const report: ReminderReport = { schemesChecked: 0, remindersRaised: 0, schemesReminded: [] };
  const schemes = await listSchemes();

  for (const s of schemes) {
    // A closed round has nothing left to chase; a draft has not started.
    if (s.status === "closed" || s.status === "draft") continue;
    report.schemesChecked++;

    const due = dueIn(s, todayIso).filter((k) => k === "resultsDue");
    for (const key of due) {
      const iso = s.dates?.[key];
      if (!iso || alreadyReminded(s, key, iso)) continue;

      const owing = (await listParticipants(s.id)).filter(stillOwesResults);
      const when = fmtSchemeDate(iso);
      for (const p of owing) {
        if (!p.labId) continue; // no account to read it — the owner chases directly
        await notify({
          kind: "results.due",
          audience: "lab",
          labId: p.labId, schemeId: s.id, code: p.code,
          bg: `Напомняне: срокът за резултати по схема ${s.number} е утре, ${when}.`,
          en: `Reminder: results for scheme ${s.number} are due tomorrow, ${when}.`,
          href: "/lab",
        });
        report.remindersRaised++;
      }

      // Stamped whether or not anybody was owing, so an empty round is not
      // re-checked all day. Inside the lock, so two concurrent runs cannot both
      // decide they are the first.
      await updateSchemeWith(s.id, (cur) => ({
        remindedAt: { ...(cur.remindedAt ?? {}), [reminderKey(key, iso)]: new Date().toISOString() },
      }));
      report.schemesReminded.push(s.number);
    }
  }
  return report;
}

// Re-exported so the cron route can name the label without reaching past this
// module for it.
export { DATE_LABELS };

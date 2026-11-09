import type { Scheme, Participant } from "./types";
import { participationEntity } from "./participation-snapshots";
import { inFinalRound } from "./announcement-model";
import { listSchemes, updateSchemeWith } from "./store";
import { listParticipants, labIdsFor } from "./participants";
import { dueIn, daysUntil, DATE_LABELS, fmtSchemeDate, type SchemeDateKey } from "./scheme-dates";
import { resultsDeadline } from "./deadlines-model";
import { notifyOrThrow } from "./notifications";
import { schemeNowMs, sofiaToday } from "./clock";
import { getReminderTemplate, isTemplateApproved, renderTemplate, templateApproval } from "./reminder-templates";
import { noticeExists } from "./notifications";
import { parseSchemeNumber } from "./scheme-number";

// ─────────────────────────────────────────────────────────────────────────────
// The day-before reminder.
//
// What he asked for, exactly: "reminders maybe a day before the deadline and to
// be simple, nothing to approve". So — one notice, one day before, to the
// laboratories who still have something to do. Not a countdown, not an escalation,
// and nothing that changes state or blocks anybody. Since PTS's Реш. 138 there is
// one approval — of the WORDS, once, on «Текстове на напомнянията» (part 1.8); each
// reminder then needs none.
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
export const stillOwesResults = (p: Pick<Participant, "status">): boolean =>
  p.status !== "submitted" && p.status !== "scored";

export interface ReminderReport {
  schemesChecked: number;
  remindersRaised: number;
  schemesReminded: string[];
}

/**
 * Raise the reminders due today — each round's today, in Bulgaria, on its own clock
 * (moved only in the test environment, part 1.3). Idempotent: the second run of a
 * day finds the deadline already stamped and does nothing.
 *
 * Only records notices — delivery is deliverPending's job, so a mail outage
 * cannot lose a reminder and the laboratory still sees it in the portal.
 */
export async function raiseDueReminders(realNowMs: number = Date.now()): Promise<ReminderReport> {
  const report: ReminderReport = { schemesChecked: 0, remindersRaised: 0, schemesReminded: [] };
  const schemes = await listSchemes();
  // part 1.8: the words are PTS's template; approved, the reminder goes out by
  // itself with that approval on record — otherwise it waits for a person
  const tpl = await getReminderTemplate("results.due");
  const byTemplate = isTemplateApproved(tpl) ? templateApproval(tpl) : undefined;

  for (const s of schemes) {
    // Only a round collecting results is chased: a draft has not started, and from
    // processing on — or in a scheme that is not held — there is nothing to remind of
    // (3.2)
    if (s.status !== "open" && s.status !== "running") continue;
    report.schemesChecked++;

    const todayIso = sofiaToday(schemeNowMs(s, realNowMs));
    // What is due tomorrow (3.4): the scheme's results deadline, for those who still owe
    // results and have no extension of their own — and each participant's EXTENDED
    // deadline, for that participant. One reminder per deadline.
    // only those in the round — a refused, annulled or withdrawn one owes nothing (5.1),
    // nor one off the final list (5.2)
    const owingAll = (await listParticipants(s.id)).filter((p) => inFinalRound(s, p) && stillOwesResults(p));
    // each by the deadline IN FORCE for it (the later of its extension and the
    // scheme's — 3.4 review): the scheme's own, one stamp for all; an extension, its own
    const groups: { stamp: string; at: string; owing: typeof owingAll }[] = [];
    const common: typeof owingAll = [];
    for (const p of owingAll) {
      const rd = resultsDeadline(s, p.code);
      if (!rd.at || daysUntil(rd.at, todayIso) !== 1) continue;
      if (rd.ext) groups.push({ stamp: `resultsDue@${p.code}:${rd.at}`, at: rd.at, owing: [p] });
      else common.push(p);
    }
    if (dueIn(s, todayIso).includes("resultsDue") && s.dates?.resultsDue) groups.unshift({ stamp: reminderKey("resultsDue", s.dates.resultsDue), at: s.dates.resultsDue, owing: common });
    for (const { stamp, at, owing } of groups) {
      if (s.remindedAt?.[stamp]) continue;

      // CLAIM the deadline first, inside the lock: of two concurrent runs (the cron
      // and «run the reminders now») only one goes on. Stamped whether or not anybody
      // was owing, so an empty round is not re-checked all day.
      let claimed = false;
      await updateSchemeWith(s.id, (cur) => {
        if (cur.remindedAt?.[stamp]) return {};
        claimed = true;
        return { remindedAt: { ...(cur.remindedAt ?? {}), [stamp]: new Date().toISOString() } };
      });
      if (!claimed) continue;

      // the deadline as the laboratory reads it: the day, and its hour and zone if any
      const when = fmtSchemeDate(at);
      // an automatic e-mail carries only approved words (part 1.8): the template, a
      // date, and a scheme number of the canonical form — a free-text number waits
      // held for a person
      const auto = byTemplate && parseSchemeNumber(s.number) ? byTemplate : undefined;
      try {
        // to reach each laboratory: an opening of the identity store by the portal's own
        // job, on record (2.3) — only for those who still owe results
        const labOf = owing.length ? await labIdsFor(s.id, owing, "system:reminders", "system") : new Map<string, string | undefined>();
        for (const coded of owing) {
          const p = { ...coded, labId: labOf.get(coded.code) };
          // no account to read it and no copy to name its people (4.6) — the owner chases directly
          if (!p.labId && !(await participationEntity(s.id, p.code, "system:reminders").catch(() => "unknown"))) continue;
          const text = renderTemplate(tpl, { scheme: s.number, date: when });
          // a run that stopped half-way is retried: who already has a reminder of
          // THIS deadline (its date is in every reminder text) is not reminded twice
          if (await noticeExists({ kind: "results.due", labId: p.labId, schemeId: s.id, code: p.code, bgIncludes: when })) continue;
          await notifyOrThrow({
            kind: "results.due",
            audience: "lab",
            labId: p.labId, schemeId: s.id, code: p.code,
            bg: text.bg,
            en: text.en,
            href: "/lab",
            releasedByTemplate: auto,
          });
          report.remindersRaised++;
        }
      } catch (e) {
        // give the claim back, so the next run finishes the job (the guard above
        // keeps it from repeating anyone)
        await updateSchemeWith(s.id, (cur) => {
          const rest = { ...(cur.remindedAt ?? {}) };
          delete rest[stamp];
          return { remindedAt: rest };
        }).catch(() => null);
        throw e;
      }
      report.schemesReminded.push(s.number);
    }
  }
  return report;
}

// Re-exported so the cron route can name the label without reaching past this
// module for it.
export { DATE_LABELS };

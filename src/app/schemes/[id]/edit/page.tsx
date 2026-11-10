import Link from "next/link";
import { PROVIDER_PROBLEM_TEXT, reportDate, legacyProviders, metaGaps, type ProviderProblem } from "@/lib/scheme-meta";
import { designApproved } from "@/lib/lifecycle-model";
import { M1_BLOCKS, usesM1 } from "@/lib/m1-render";
import { requireCap } from "@/lib/access";
import { notFound } from "next/navigation";
import { getScheme } from "@/lib/store";
import SchemeEditor from "@/components/SchemeEditor";
import { calibrationDataSlots } from "@/lib/param-remap";
import { getServerT } from "@/lib/i18n-server";
import { requireStaff } from "@/lib/roles";
import { COMMERCIAL_PROBLEM_TEXT, type CommercialProblem } from "@/lib/commercial-model";
import { LIST_PROBLEM_TEXT, listsOf, type ListProblem } from "@/lib/scheme-lists-model";

// The scheme setup page: essentials (number, name, photo), opening the scheme,
// the schedule dates and the participation standards — with add/remove/reorder.
// All interactivity lives in the SchemeEditor client component; this server page
// only loads the scheme and passes the (serializable) slice it edits.
export default async function EditSchemePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ err?: string; codes?: string; slots?: string; number?: string; chars?: string; com?: string; lship?: string; lrcpt?: string; mkl?: string; meta?: string; per?: string; rev?: string; t?: string }>;
}) {
  await requireStaff(); // read gate: manager/staff/auditor only
  const { id } = await params;
  await requireCap("codes.view", id); // in THIS scheme, by the role model (2.4)
  const { err, codes, slots, number, chars, com, lship, lrcpt, mkl, meta, per, rev, t } = await searchParams;
  // the design data's refusal: «problem[:row]» (3.13)
  const [metaProblem, metaRow] = (meta ?? "").split(":");
  const metaText = metaProblem && Object.hasOwn(PROVIDER_PROBLEM_TEXT, metaProblem) ? PROVIDER_PROBLEM_TEXT[metaProblem as ProviderProblem] : null;
  // only a known problem — never a key every object has («toString», 3.8 review)
  const comText = com && Object.hasOwn(COMMERCIAL_PROBLEM_TEXT, com) ? COMMERCIAL_PROBLEM_TEXT[com as CommercialProblem] : null;
  // each list's refusal: «problem:row:its words» (3.8)
  const listNotice = (v: string | undefined, bg: string, en: string) => {
    if (!v) return null;
    const [problem, row, ...words] = v.split(":");
    if (!Object.hasOwn(LIST_PROBLEM_TEXT, problem)) return null;
    const text = LIST_PROBLEM_TEXT[problem as ListProblem];
    const where = /^\d+$/.test(row ?? "") ? { bg: `, ред ${row}${words.join(":") ? ` («${words.join(":")}»)` : ""}`, en: `, row ${row}${words.join(":") ? ` («${words.join(":")}»)` : ""}` } : { bg: "", en: "" };
    return { bg: `${bg}${where.bg}: ${text.bg}`, en: `${en}${where.en}: ${text.en}` };
  };
  const lstNotices = [listNotice(lship, "Документи към пратката", "Shipment documents"), listNotice(lrcpt, "Проверки при получаване", "Receipt checks")].filter((x) => x !== null);
  const lstText = lstNotices.length ? lstNotices : null;
  const s = await getScheme(id);
  if (!s) notFound();
  const { lang, tr } = await getServerT();
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);

  return (
    <div>
      <Link href={`/schemes/${id}`} className="text-sm" style={{ color: "var(--muted)" }}>
        ← {s.number}
      </Link>
      <h1 className="text-2xl font-bold mt-2" style={{ color: "var(--green-dark)" }}>
        {tr("edit.title")}
      </h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        {tr("edit.subtitle")}
      </p>

      {err === "list-final" && (
        <div className="card p-3 mt-3 text-sm" data-err-list-final style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f" }}>
          <b>{L("Промените НЕ са запазени.", "The changes were NOT saved.")}</b>{" "}
          {L("Окончателният списък е обявен (второ обявяване) и назовава характеристиките по местата им — те не се пренареждат и не се премахват, докато той стои. Нова характеристика може да се добави накрая. За друга промяна първо върнете схемата към предишното състояние.",
             "The final list is announced (the second announcement) and names the characteristics by their places — they are not reordered or removed while it stands. A new characteristic may be added at the end. For any other change, step the scheme back first.")}
        </div>
      )}
      {err === "stranded" && (
        <div className="card p-3 mt-3 text-sm" style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f" }}>
          <b>{L("Промените НЕ са запазени.", "The changes were NOT saved.")}</b>{" "}
          {L(
            `Изтриването на тези стандарти би оставило участник(ци) ${codes ?? ""} без нито един регистриран стандарт — първо променете обхвата им или ги премахнете от страницата „Участници“.`,
            `Deleting those standards would leave participant(s) ${codes ?? ""} with no registered standard — first re-scope or remove them on the “Participants” page.`
          )}
        </div>
      )}

      {err === "dupNumber" && (
        <div className="card p-3 mt-3 text-sm" style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f" }}>
          <b>{L("Номерът не е сменен.", "The number was not changed.")}</b>{" "}
          {L(
            `${number ?? ""} вече е на друга схема (кирилските Т/С и латинските T/C се броят за една и съща буква). Другите промени са запазени, а номерът остава ${s.number} — изберете друг.`,
            `${number ?? ""} already belongs to another scheme (Cyrillic Т/С and Latin T/C count as the same letter). Your other changes are saved; the number stays ${s.number} — pick another.`
          )}
        </div>
      )}

      {err === "simNumber" && (
        <div className="card p-3 mt-3 text-sm" style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f" }}>
          <b>{L("Номерът не е сменен.", "The number was not changed.")}</b>{" "}
          {L(
            `${number ?? ""} е номер на симулационен кръг — такива се дават само в тестовата среда. Другите промени са запазени, а номерът остава ${s.number}.`,
            `${number ?? ""} is a simulation round's number — only the test environment gives those. Your other changes are saved; the number stays ${s.number}.`
          )}
        </div>
      )}

      {err === "badNumber" && (
        <div className="card p-3 mt-3 text-sm" data-number-refused style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f" }}>
          <b>{L("Номерът не е сменен.", "The number was not changed.")}</b>{" "}
          {L(
            `Порталът не разчита „${number ?? ""}“. Форматът е PTS|ILC ГГ/ММ[-NA]-T|S|C-пореден (например PTS 26/03-T-1, ILC 26/10-NA-T-1), а номерата от архива се приемат в старите им форми (PTS 25/08-NA-1, PTS 23/11-A, PTS 21/03-C1P, PTS 22/08-1, PTS 23/01). Другите промени са запазени, а номерът остава ${s.number}.`,
            `The portal cannot read “${number ?? ""}”. The form is PTS|ILC YY/MM[-NA]-T|S|C-sequence (e.g. PTS 26/03-T-1, ILC 26/10-NA-T-1); archive numbers are accepted in their old forms (PTS 25/08-NA-1, PTS 23/11-A, PTS 21/03-C1P, PTS 22/08-1, PTS 23/01). Your other changes are saved; the number stays ${s.number}.`
          )}
        </div>
      )}

      {err === "numberActivity" && (
        <div className="card p-3 mt-3 text-sm" data-number-refused style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f" }}>
          <b>{L("Номерът не е сменен.", "The number was not changed.")}</b>{" "}
          {L(
            `В „${number ?? ""}“ буквата на дейността не е на тази схема: схема за калибриране има C, схема за изпитване — T или S. Другите промени са запазени, а номерът остава ${s.number}.`,
            `In “${number ?? ""}” the activity letter is not this scheme's: a calibration scheme has C, a testing scheme T or S. Your other changes are saved; the number stays ${s.number}.`
          )}
        </div>
      )}

      {err === "numberLocked" && (
        <div className="card p-3 mt-3 text-sm" style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f" }}>
          <b>{L("Номерът не е сменен.", "The number was not changed.")}</b>{" "}
          {L(
            `Схемата вече има издадени сертификати, а номерът им започва с номера на схемата и така е в регистъра на ptsbg.eu. Другите промени са запазени, а номерът остава ${s.number}.`,
            `The scheme already has issued certificates; their numbers start with the scheme number and are in the ptsbg.eu register as such. Your other changes are saved; the number stays ${s.number}.`
          )}
        </div>
      )}

      {chars && (
        <div className="card p-3 mt-3 text-sm" data-charfields-refused style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f" }}>
          <b>{L("Характеристиките НЕ са запазени.", "The characteristics were NOT saved.")}</b>{" "}
          {L(`Не се разчита: ${chars}. Другите промени са запазени.`, `Could not be read: ${chars}. Your other changes are saved.`)}
        </div>
      )}

      {rev && (
        <div className="card p-3 mt-3 text-sm" data-review-criteria-refused={rev} style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f" }}>
          {lang === "bg" ? "Критериите за прегледа след срока не са записани — останаха предишните: " : "The criteria for the review after the deadline were not saved — the previous ones are kept: "}
          {rev.split(",").map((k) => (lang === "bg" ? { tolerance: "допускът (число, напр. 0,5)", tempMin: "температурата «от» (число)", tempMax: "температурата «до» (число)", tempRange: "температурният диапазон («от» е по-голямо от «до»)" } : { tolerance: "the tolerance (a number, e.g. 0.5)", tempMin: "the temperature «from» (a number)", tempMax: "the temperature «to» (a number)", tempRange: "the temperature range («from» is above «to»)" } as Record<string, string>)[k] ?? k).join("; ")}.
        </div>
      )}
      {per && (
        <div className="card p-3 mt-3 text-sm" data-period-refused style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f" }}>
          <b>{L("Периодът НЕ е запазен.", "The period was NOT saved.")}</b> {L(`${PROVIDER_PROBLEM_TEXT.period.bg}. Другите промени са запазени.`, `${PROVIDER_PROBLEM_TEXT.period.en}. Your other changes are saved.`)}
        </div>
      )}

      {metaText && (
        <div className="card p-3 mt-3 text-sm" data-meta-refused style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f" }}>
          <b>{L("Външните доставчици НЕ са запазени.", "The external providers were NOT saved.")}</b>{" "}
          {L(`${/^\d+$/.test(metaRow ?? "") ? `Ред ${metaRow}: ` : ""}${metaText.bg}. Другите промени са запазени.`, `${/^\d+$/.test(metaRow ?? "") ? `Row ${metaRow}: ` : ""}${metaText.en}. Your other changes are saved.`)}
        </div>
      )}

      {mkl && (
        <div className="card p-3 mt-3 text-sm" data-markers-locked style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f" }}>
          <b>{L("Видът, дейността и статутът на акредитация не са сменени.", "The kind, the activity and the accreditation status were not changed.")}</b>{" "}
          {L("Схемата има издадени сертификати и те носят този статут — знака за акредитация или изречението за NA. Другите промени са запазени.", "The scheme has issued certificates and they carry this status — the accreditation mark or the NA sentence. Your other changes are saved.")}
        </div>
      )}

      {comText && (
        <div className="card p-3 mt-3 text-sm" data-commercial-refused style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f" }}>
          <b>{L("Цените и броят участници НЕ са запазени.", "The prices and participant numbers were NOT saved.")}</b>{" "}
          {L(`Не се разчита: ${comText.bg}. Другите промени са запазени.`, `Could not be read: ${comText.en}. Your other changes are saved.`)}
        </div>
      )}

      {lstText && (
        <div className="card p-3 mt-3 text-sm" data-lists-refused style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f" }}>
          <b>{lstText.length > 1 ? L("Двата списъка НЕ са запазени.", "Both lists were NOT saved.") : L("Този списък НЕ е запазен.", "This list was NOT saved.")}</b>{" "}
          {lstText.map((n) => L(n.bg, n.en)).join(". ")}. {L("Другите промени са запазени.", "Your other changes are saved.")}
        </div>
      )}

      {err === "calslots" && (
        <div className="card p-3 mt-3 text-sm" style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f" }}>
          <b>{L("Промените НЕ са запазени.", "The changes were NOT saved.")}</b>{" "}
          {L(
            `За тези точки/посоки на калибриране вече има въведени резултати: ${slots ?? ""}. Обикновено редакторът пита и, ако потвърдите, изчиства именно тези резултати — този път потвърждението не пристигна, затова нищо не е променено. Опитайте отново от страницата и потвърдете, когато ви попита.`,
            `These calibration points/directions already carry entered results: ${slots ?? ""}. The editor normally asks first and, if you agree, clears exactly those results — this time no confirmation arrived, so nothing was changed. Try again from the page and confirm when it asks.`
          )}
        </div>
      )}

      {/* keyed by the refusal's token: after a refusal the form shows what was SAVED —
          never typed values that look saved, even when the same refusal comes back (3.7 review) */}
      <SchemeEditor
        key={t ?? "form"}
        init={{
          id: s.id,
          number: s.number,
          type: s.type,
          kind: s.kind,
          activity: s.activity,
          accredited: s.accredited,
          titleEn: s.titleEn,
          titleBg: s.titleBg,
          objectEn: s.objectEn,
          objectBg: s.objectBg,
          status: s.status,
          coverImage: s.coverImage,
          coverImageWidth: s.coverImageWidth,
          coverImageAlign: s.coverImageAlign,
          minParticipants: s.minParticipants,
          commercial: s.commercial,
          lists: listsOf(s),
          openAdvanced: !!(comText || lstText || metaText || per),
          legacyProviders: legacyProviders(s),
          metaGaps: metaGaps(s),
          planSaved: !!(s.docs?.plan?.bg || s.docs?.plan?.en),
          period: s.period ?? "",
          externalProviders: s.externalProviders ?? [],
          designApproved: designApproved(s) ?? "",
          reportDate: reportDate(s) ?? "",
          certsIssued: Object.keys(s.certificates ?? {}).length > 0,
          m1Blocks: usesM1(s) ? M1_BLOCKS.map((b) => ({ ...b, bg: s.clauses?.[b.key]?.bg ?? "", en: s.clauses?.[b.key]?.en ?? "" })) : undefined,
          schedule: s.schedule,
          parameters: s.parameters,
          prices: s.prices,
          calibration: s.calibration,
          // so the editor can warn about results at stake BEFORE the save, rather
          // than the server refusing it and losing every other edit on the form
          calDataSlots: s.type === "C" ? calibrationDataSlots(s.scoring, s.formData?.["results"]) : [],
          staticReminder: s.staticReminder,
        }}
      />
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { getScheme } from "@/lib/store";
import { updateSchemeAction } from "@/lib/actions";
import CoverPhotoField from "@/components/CoverPhotoField";

const inputCls = "w-full rounded px-2 py-1 text-sm";
const inputStyle = { border: "1px solid var(--line)", background: "#fff" } as const;

function Field({ label, name, def }: { label: string; name: string; def: string }) {
  return (
    <label className="block">
      <span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{label}</span>
      <input name={name} defaultValue={def} className={inputCls} style={inputStyle} />
    </label>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-bold mt-7 mb-2 pb-1" style={{ color: "var(--green-dark)", borderBottom: "2px solid var(--red)" }}>
      {children}
    </h2>
  );
}

export default async function EditSchemePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const s = await getScheme(id);
  if (!s) notFound();

  return (
    <div>
      <Link href={`/schemes/${id}`} className="text-sm" style={{ color: "var(--muted)" }}>
        ← {s.number}
      </Link>
      <h1 className="text-2xl font-bold mt-2" style={{ color: "var(--green-dark)" }}>
        Edit scheme data
      </h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Change a value once — it updates every document, in both languages.
      </p>

      <form action={updateSchemeAction} className="mt-2">
        <input type="hidden" name="id" value={s.id} />

        <SectionTitle>Basics</SectionTitle>
        <label className="block mb-3">
          <span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>Official number (PTS №) — shown on every document &amp; sets the year folder</span>
          <input
            name="number"
            defaultValue={s.number}
            className="rounded px-3 py-2 text-sm font-bold"
            style={{ border: "1px solid var(--green-line)", background: "var(--green-soft)", color: "var(--green-dark)", maxWidth: 320, fontFamily: "var(--font-sans)" }}
          />
        </label>
        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <Field label="Title (EN)" name="titleEn" def={s.titleEn} />
          <Field label="Заглавие (БГ)" name="titleBg" def={s.titleBg} />
          <Field label="Object (EN)" name="objectEn" def={s.objectEn} />
          <Field label="Обект (БГ)" name="objectBg" def={s.objectBg} />
          <Field label="Minimum participants" name="minParticipants" def={String(s.minParticipants)} />
        </div>

        <SectionTitle>Cover photo (title page)</SectionTitle>
        <CoverPhotoField image={s.coverImage} width={s.coverImageWidth} align={s.coverImageAlign} />

        <SectionTitle>Schedule (the green calendars · §10)</SectionTitle>
        <div className="grid gap-3">
          {s.schedule.map((it, i) => (
            <div key={i} className="grid gap-2" style={{ gridTemplateColumns: "120px 1fr 1fr" }}>
              <Field label="Date" name={`sched_${i}_date`} def={it.date} />
              <Field label="Label (EN)" name={`sched_${i}_en`} def={it.labelEn} />
              <Field label="Етикет (БГ)" name={`sched_${i}_bg`} def={it.labelBg} />
            </div>
          ))}
        </div>

        <SectionTitle>Parameters (§6)</SectionTitle>
        <div className="grid gap-4">
          {s.parameters.map((p, i) => (
            <div key={i} className="card p-3 grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Field label="Standard (EN)" name={`param_${i}_stdEn`} def={p.standardEn} />
              <Field label="Стандарт (БГ)" name={`param_${i}_stdBg`} def={p.standardBg} />
              <Field label="Characteristic (EN)" name={`param_${i}_chEn`} def={p.characteristicEn} />
              <Field label="Характеристика (БГ)" name={`param_${i}_chBg`} def={p.characteristicBg} />
              <Field label="Range (EN)" name={`param_${i}_rgEn`} def={p.rangeEn} />
              <Field label="Обхват (БГ)" name={`param_${i}_rgBg`} def={p.rangeBg} />
              <Field label="Specimens (EN)" name={`param_${i}_spEn`} def={p.specimensEn} />
              <Field label="Проби (БГ)" name={`param_${i}_spBg`} def={p.specimensBg} />
              <Field label="σpt,min — proficiency-SD floor (optional)" name={`param_${i}_sigmaMin`} def={p.sigmaMin != null ? String(p.sigmaMin) : ""} />
            </div>
          ))}
        </div>

        <SectionTitle>Prices (§21)</SectionTitle>
        <div className="grid gap-2">
          {s.prices.map((pr, i) => (
            <div key={i} className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr 120px 120px" }}>
              <Field label="Characteristic (EN)" name={`price_${i}_chEn`} def={pr.characteristicEn} />
              <Field label="Характеристика (БГ)" name={`price_${i}_chBg`} def={pr.characteristicBg} />
              <Field label="First sample" name={`price_${i}_first`} def={pr.first} />
              <Field label="Each additional" name={`price_${i}_add`} def={pr.additional} />
            </div>
          ))}
        </div>

        {s.calibration && (
          <>
            <SectionTitle>Calibration</SectionTitle>
            <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
              <Field label="Quantity (EN)" name="cal_quantityEn" def={s.calibration.quantityEn} />
              <Field label="Величина (БГ)" name="cal_quantityBg" def={s.calibration.quantityBg} />
              <Field label="Unit" name="cal_unit" def={s.calibration.unit} />
            </div>
            <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Field label="Device (EN)" name="cal_deviceEn" def={s.calibration.deviceEn} />
              <Field label="Устройство (БГ)" name="cal_deviceBg" def={s.calibration.deviceBg} />
            </div>
            <div className="grid gap-3 mt-3">
              <Field label="Calibration points (comma-separated)" name="cal_points" def={s.calibration.points.join(", ")} />
            </div>
            <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Field label="Directions EN (comma-separated)" name="cal_dirEn" def={s.calibration.directionsEn.join(", ")} />
              <Field label="Посоки БГ (comma-separated)" name="cal_dirBg" def={s.calibration.directionsBg.join(", ")} />
              <Field label="Reference lab (EN)" name="cal_refLabEn" def={s.calibration.referenceLabEn} />
              <Field label="Референтна лаборатория (БГ)" name="cal_refLabBg" def={s.calibration.referenceLabBg} />
              <Field label="Reference lab location (EN)" name="cal_refLocEn" def={s.calibration.referenceLabLocEn} />
              <Field label="Местоположение (БГ)" name="cal_refLocBg" def={s.calibration.referenceLabLocBg} />
              <Field label="Method (EN)" name="cal_methodEn" def={s.calibration.methodEn} />
              <Field label="Метод (БГ)" name="cal_methodBg" def={s.calibration.methodBg} />
            </div>
          </>
        )}

        <div className="mt-7 flex gap-3">
          <button type="submit" className="btn btn-primary">Save & view Plan</button>
          <Link href={`/schemes/${id}`} className="btn">Cancel</Link>
        </div>
      </form>
    </div>
  );
}

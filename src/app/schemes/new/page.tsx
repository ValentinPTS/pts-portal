import Link from "next/link";
import { createSchemeAction } from "@/lib/actions";
import { getServerT } from "@/lib/i18n-server";

const inputCls = "w-full rounded px-2 py-1 text-sm";
const inputStyle = { border: "1px solid var(--line)", background: "#fff" } as const;

function Field({ label, name, def = "", placeholder = "" }: { label: string; name: string; def?: string; placeholder?: string }) {
  return (
    <label className="block">
      <span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{label}</span>
      <input name={name} defaultValue={def} placeholder={placeholder} className={inputCls} style={inputStyle} />
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

export default async function NewSchemePage() {
  const { tr } = await getServerT();
  return (
    <div>
      <Link href="/" className="text-sm" style={{ color: "var(--muted)" }}>← {tr("new.allSchemes")}</Link>
      <h1 className="text-2xl font-bold mt-2" style={{ color: "var(--green-dark)" }}>{tr("new.title")}</h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>{tr("new.subtitle")}</p>

      <form action={createSchemeAction} className="mt-2">
        <SectionTitle>{tr("new.identity")}</SectionTitle>
        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
          <label className="block">
            <span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("new.type")}</span>
            <select name="type" defaultValue="T" className={inputCls} style={inputStyle}>
              <option value="T">{tr("new.optTesting")}</option>
              <option value="C">{tr("new.optCalibration")}</option>
            </select>
          </label>
          <Field label={tr("new.yearYY")} name="year" def="26" />
          <Field label={tr("new.monthMM")} name="month" placeholder="01" />
          <Field label={tr("new.sequence")} name="seq" def="1" />
        </div>
        <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>{tr("new.numberNote")}</p>

        <SectionTitle>{tr("new.titleObject")}</SectionTitle>
        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <Field label="Title (EN)" name="titleEn" placeholder="Testing of …" />
          <Field label="Заглавие (БГ)" name="titleBg" placeholder="Изпитване на …" />
          <Field label="Object (EN)" name="objectEn" />
          <Field label="Обект (БГ)" name="objectBg" />
        </div>

        <SectionTitle>{tr("new.settings")}</SectionTitle>
        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <label className="block">
            <span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>{tr("new.distribution")}</span>
            <select name="distribution" defaultValue="simultaneous" className={inputCls} style={inputStyle}>
              <option value="simultaneous">{tr("new.optSimultaneous")}</option>
              <option value="sequential">{tr("new.optSequential")}</option>
            </select>
          </label>
          <Field label={tr("new.minParticipants")} name="minParticipants" def="5" />
        </div>

        <div className="mt-7 flex gap-3">
          <button type="submit" className="btn btn-primary">{tr("new.create")}</button>
          <Link href="/" className="btn">{tr("common.cancel")}</Link>
        </div>
      </form>
    </div>
  );
}

import Link from "next/link";
import { createSchemeAction } from "@/lib/actions";

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

export default function NewSchemePage() {
  return (
    <div>
      <Link href="/" className="text-sm" style={{ color: "var(--muted)" }}>← All schemes</Link>
      <h1 className="text-2xl font-bold mt-2" style={{ color: "var(--green-dark)" }}>New scheme</h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Set the basics — you’ll fill the parameters, dates and prices on the next screen, and all documents
        generate from them.
      </p>

      <form action={createSchemeAction} className="mt-2">
        <SectionTitle>Identity</SectionTitle>
        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
          <label className="block">
            <span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>Type</span>
            <select name="type" defaultValue="T" className={inputCls} style={inputStyle}>
              <option value="T">Testing (T)</option>
              <option value="C">Calibration (C)</option>
            </select>
          </label>
          <Field label="Year (YY)" name="year" def="26" />
          <Field label="Month (MM)" name="month" placeholder="01" />
          <Field label="Sequence" name="seq" def="1" />
        </div>
        <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
          Number becomes e.g. <b>PTS 26/01-T-1</b>. (Calibration documents currently use the testing layout —
          full calibration support is a later step.)
        </p>

        <SectionTitle>Title & object</SectionTitle>
        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <Field label="Title (EN)" name="titleEn" placeholder="Testing of …" />
          <Field label="Заглавие (БГ)" name="titleBg" placeholder="Изпитване на …" />
          <Field label="Object (EN)" name="objectEn" />
          <Field label="Обект (БГ)" name="objectBg" />
        </div>

        <SectionTitle>Settings</SectionTitle>
        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <label className="block">
            <span className="block text-xs mb-0.5" style={{ color: "var(--muted)" }}>Distribution</span>
            <select name="distribution" defaultValue="simultaneous" className={inputCls} style={inputStyle}>
              <option value="simultaneous">Simultaneous (Testing)</option>
              <option value="sequential">Sequential (Calibration)</option>
            </select>
          </label>
          <Field label="Minimum participants" name="minParticipants" def="5" />
        </div>

        <div className="mt-7 flex gap-3">
          <button type="submit" className="btn btn-primary">Create scheme →</button>
          <Link href="/" className="btn">Cancel</Link>
        </div>
      </form>
    </div>
  );
}

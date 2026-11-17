import { setProviderHeadAction } from "@/lib/actions";

// The head of the PT provider — who signs every Order (the real-user walk-through, M3). Set once, in both languages;
// a plain form (it reads its fields when sent — nothing held), on the page of the documents' common settings.
export default function ProviderHeadCard({ current, lang, saved }: { current: { bg: string; en: string } | null; lang: "bg" | "en"; saved?: boolean }) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  return (
    <form action={setProviderHeadAction} data-provider-head className="card p-4 mt-4" style={{ display: "grid", gap: 10, maxWidth: 720 }}>
      <div className="font-bold" style={{ color: "var(--green-dark)" }}>{L("Ръководител на организатора", "Head of the PT provider")}</div>
      <p className="text-sm" style={{ color: "var(--muted)", margin: 0 }}>
        {L("Подписва заповедите на всички схеми. Без име редът за подпис остава празен.", "Signs the Order of every scheme. Without a name the signature line is left blank.")}
      </p>
      <label className="text-sm" style={{ display: "grid", gap: 4 }}>
        {L("Име (на български)", "Name (Bulgarian)")}
        <input name="headBg" defaultValue={current?.bg ?? ""} maxLength={120} />
      </label>
      <label className="text-sm" style={{ display: "grid", gap: 4 }}>
        {L("Име (на английски)", "Name (English)")}
        <input name="headEn" defaultValue={current?.en ?? ""} maxLength={120} />
      </label>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button type="submit" className="btn btn-primary">{L("Запази", "Save")}</button>
        {saved && <span role="status" className="text-sm" style={{ color: "var(--green-dark)" }}>{L("Записано.", "Saved.")}</span>}
      </div>
    </form>
  );
}

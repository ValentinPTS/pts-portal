"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setParticipationStandingAction } from "@/lib/actions";

// A participation out of the round (plan part 5.1): refused (a category and a reason —
// told to the laboratory, held for «Изпрати»), annulled (entered wrongly) or withdrawn
// (the laboratory took it back) — each with its source; set once, never changed. The
// participation and its code stay. onSubmit — a refusal of the form keeps the typing.

export default function StandingForms({ lang, schemeId, participantId, categories, reachable }: { lang: "bg" | "en"; schemeId: string; participantId: string; categories: { key: string; bg: string; en: string }[]; reachable: boolean }) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"" | "refused" | "annulled" | "withdrawn">("");
  const [error, setError] = useState<string | null>(null);
  const field = { border: "1px solid var(--line)", borderRadius: 8, padding: "5px 8px", fontSize: 13, background: "#fff", fontFamily: "inherit" } as const;
  const btn = (m: "refused" | "annulled" | "withdrawn", label: string) => (
    <button type="button" className="btn btn-sm" data-standing-open={m} aria-pressed={mode === m} onClick={() => { setMode(mode === m ? "" : m); setError(null); }}>{label}</button>
  );
  return (
    <div data-standing={participantId} style={{ display: "grid", gap: 6 }}>
      <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
        {btn("refused", L("Откажи", "Refuse"))}
        {btn("annulled", L("Анулирай", "Annul"))}
        {btn("withdrawn", L("Оттеглена от лабораторията", "Withdrawn by the laboratory"))}
      </div>
      {mode && (
        <form data-standing-form={mode} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            if (!window.confirm(L("Участието излиза от кръга завинаги (кодът остава). Продължаване?", "The participation leaves the round for good (its code stays). Go on?"))) return;
            start(async () => {
              setError(null);
              let r: Awaited<ReturnType<typeof setParticipationStandingAction>>;
              try {
                r = await setParticipationStandingAction({ schemeId, participantId, state: mode, category: fd.get("category"), reason: fd.get("reason"), source: fd.get("source") });
              } catch {
                setError(L("Не стана — нищо не е записано. Опитайте отново.", "It did not go through — nothing was recorded. Try again."));
                return;
              }
              if ("error" in r) { setError(r.error); return; }
              setMode("");
              router.refresh();
            });
          }}>
          {mode === "refused" ? (
            <>
              <label style={{ display: "grid", gap: 3 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Категория *", "Category *")}</span>
                <select name="category" required defaultValue="" style={field}><option value="" disabled>—</option>{categories.map((c) => <option key={c.key} value={c.key}>{L(c.bg, c.en)}</option>)}</select></label>
              <label style={{ display: "grid", gap: 3 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Основание (вижда го лабораторията) *", "Reason (the laboratory sees it) *")}</span>
                <input name="reason" required minLength={3} maxLength={300} style={{ ...field, minWidth: 260 }} /></label>
              {!reachable && <span data-standing-unreachable style={{ fontSize: 12, color: "#8a5a00", alignSelf: "center" }}>{L("Участието не е свързано с лаборатория в портала — съобщете ѝ отказа сами.", "The participation is not linked to a laboratory in the portal — tell it of the refusal yourselves.")}</span>}
            </>
          ) : (
            <label style={{ display: "grid", gap: 3 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{mode === "annulled" ? L("Основание — напр. «грешно въведена от PTS» *", "Source — e.g. «entered wrongly by PTS» *") : L("Основание — писмото или имейлът на лабораторията *", "Source — the laboratory's letter or e-mail *")}</span>
              <input name="source" required minLength={3} maxLength={300} style={{ ...field, minWidth: 300 }} /></label>
          )}
          <button type="submit" className="btn btn-sm" disabled={pending} style={{ background: "#b4291f", color: "#fff", borderColor: "#b4291f" }}>{mode === "refused" ? L("Откажи участието", "Refuse the participation") : mode === "annulled" ? L("Анулирай заявката", "Annul the application") : L("Запиши оттеглянето", "Record the withdrawal")}</button>
          {error && <span role="alert" data-standing-error className="text-xs" style={{ color: "#8f2f2f" }}>{error}</span>}
        </form>
      )}
    </div>
  );
}

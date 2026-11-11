"use client";

import { useState, useTransition } from "react";
import { giveFeedbackAction } from "@/lib/actions";
import { QUESTION_TEXT } from "@/lib/feedback-model";

// The feedback sheet F 8.6-2 in the portal (plan part 10.3; Реш. 92, 122; К21): anonymous — PTS sees the
// answers together, never whose or when; once per participation. A complaint or an appeal is not feedback:
// the site's form (П 7.6).
export default function FeedbackForm({ participantId, given, lang, complaintsUrl }: { participantId: string; given: boolean; lang: "bg" | "en"; complaintsUrl: string }) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const [done, setDone] = useState(given);
  const [err, setErr] = useState("");
  const [again, setAgain] = useState("");
  const [pending, start] = useTransition();
  const complaint = (
    <p className="text-sm" style={{ color: "var(--muted)", margin: "6px 0 0" }} data-feedback-complaints>
      {L("Оплакване или жалба не е обратна връзка — подава се чрез ", "A complaint or an appeal is not feedback — it goes through ")}
      <a href={complaintsUrl} target="_blank" rel="noopener" style={{ color: "var(--green-dark)" }}>{L("формуляра на сайта (П 7.6)", "the website's form (П 7.6)")}</a>.
    </p>
  );
  if (done) return (
    <section className="card" data-feedback="given" style={{ padding: 14 }}>
      <b>{L("Обратна връзка", "Feedback")}</b>
      <p style={{ margin: "4px 0 0" }}>{L("Благодарим — обратната връзка е дадена. Тя е анонимна: PTS вижда отговорите заедно, никога чии са или кога.", "Thank you — the feedback is given. It is anonymous: PTS sees the answers together, never whose or when.")}</p>
      {complaint}
    </section>
  );
  const scale = (name: "q1" | "q2") => (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", margin: "4px 0 10px" }}>
      <span className="text-sm" style={{ color: "var(--muted)" }}>{L("Лошо", "Bad")}</span>
      {[1, 2, 3, 4, 5].map((n) => <label key={n} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><input type="radio" name={name} value={n} />{n}</label>)}
      <span className="text-sm" style={{ color: "var(--muted)" }}>{L("Отлично", "Excellent")}</span>
    </div>
  );
  const area = { width: "100%", border: "1px solid var(--line)", borderRadius: 8, padding: 8, fontFamily: "inherit", fontSize: 14 } as const;
  return (
    <section className="card" data-feedback="open" style={{ padding: 14 }}>
      <b>{L("Обратна връзка (по желание)", "Feedback (optional)")}</b>
      <p className="text-sm" style={{ margin: "4px 0 10px", color: "var(--muted)" }}>{L("Анонимна е: не се пази кой и кога я е дал — PTS вижда отговорите на всички заедно. Дава се веднъж за участието.", "It is anonymous: who gave it and when are not kept — PTS sees everyone's answers together. Given once for the participation.")}</p>
      <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); start(async () => { const r = await giveFeedbackAction(participantId, fd); if ("error" in r) { if (r.given) setDone(true); else setErr(r.error); } else { setErr(""); setDone(true); } }); }}>
        <div>{QUESTION_TEXT.q1[lang]}</div>{scale("q1")}
        <div>{QUESTION_TEXT.q2[lang]}</div>{scale("q2")}
        <div>{QUESTION_TEXT.q3[lang]}</div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", margin: "4px 0 10px" }}>
          {(["yes", "no", "other"] as const).map((v) => <label key={v} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><input type="radio" name="q3" value={v} onChange={() => setAgain(v)} />{v === "yes" ? L("Да", "Yes") : v === "no" ? L("Не", "No") : L("Друго", "Other")}</label>)}
          {again === "other" && <input name="q3text" maxLength={2000} style={{ ...area, width: "auto", flex: "1 1 220px" }} aria-label={L("Друго", "Other")} />}
        </div>
        <div>{QUESTION_TEXT.q4[lang]}</div>
        <textarea name="q4" rows={3} maxLength={2000} style={area} />
        <div style={{ marginTop: 8 }}>{QUESTION_TEXT.q5[lang]}</div>
        <textarea name="q5" rows={4} maxLength={2000} style={area} />
        <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
          <button type="submit" className="btn btn-primary btn-sm" disabled={pending} data-feedback-submit>{L("Изпрати обратната връзка", "Send the feedback")}</button>
          {err && <span role="alert" className="text-sm" style={{ color: "#b42318" }}>{err}</span>}
        </div>
      </form>
      {complaint}
    </section>
  );
}

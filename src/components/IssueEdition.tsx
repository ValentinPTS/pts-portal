"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLang } from "@/components/LangProvider";
import { issueEditionAction } from "@/lib/actions";
import { MIN_REASON, MAX_NOTE } from "@/lib/editions-model";

// «Издай редакция» (plan part 3.0): the document as it is now becomes its next
// edition — with the note of what changed and why (required from edition 2 on).

export type IssuableDoc = { key: string; name: string; next: number };

export default function IssueEdition({ schemeId, docs, initial }: { schemeId: string; docs: IssuableDoc[]; initial?: string }) {
  const { lang } = useLang();
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [doc, setDoc] = useState(docs.some((d) => d.key === initial) ? initial! : docs[0]?.key ?? "");
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const next = docs.find((d) => d.key === doc)?.next ?? 1;
  const needsReason = next >= 2;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    start(async () => {
      const r = await issueEditionAction(schemeId, doc, { reason, scope });
      if (r.error) { setMsg({ ok: false, text: r.error }); return; }
      setMsg({ ok: true, text: L(`Издадена е редакция № ${r.no}.`, `Edition No. ${r.no} issued.`) });
      setReason("");
      setScope("");
      router.refresh();
    });
  }

  if (!docs.length) return null;
  return (
    <form onSubmit={submit} data-issue-edition className="card p-4 mt-4" style={{ display: "grid", gap: 10, maxWidth: 720 }}>
      <div className="font-bold" style={{ color: "var(--green-dark)" }}>{L("Издай нова редакция", "Issue a new edition")}</div>
      <p className="text-sm" style={{ color: "var(--muted)", margin: 0 }}>
        {L("Документът, какъвто е сега, става следващата си редакция: замразен файл, който не се променя повече. Изпращането към участниците изпраща редакция.",
          "The document as it is now becomes its next edition: a frozen file that never changes again. Sending to the participants sends an edition.")}
      </p>
      <label className="text-sm" style={{ display: "grid", gap: 4 }}>
        {L("Документ", "Document")}
        <select value={doc} onChange={(e) => setDoc(e.target.value)} disabled={pending}>
          {docs.map((d) => <option key={d.key} value={d.key}>{d.name} — {L(`ще е редакция № ${d.next}`, `will be edition No. ${d.next}`)}</option>)}
        </select>
      </label>
      <label className="text-sm" style={{ display: "grid", gap: 4 }}>
        {needsReason ? L("Какво е променено и защо (задължително)", "What changed and why (required)") : L("Бележка (по желание — по подразбиране «Първа редакция»)", "Note (optional — «Първа редакция» by default)")}
        <textarea name="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={MAX_NOTE} required={needsReason} minLength={needsReason ? MIN_REASON : undefined} disabled={pending} />
      </label>
      <label className="text-sm" style={{ display: "grid", gap: 4 }}>
        {L("Обхват — кои части (по желание)", "Scope — which parts (optional)")}
        <input name="scope" value={scope} onChange={(e) => setScope(e.target.value)} maxLength={MAX_NOTE} disabled={pending} />
      </label>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button type="submit" className="btn btn-primary" disabled={pending || !doc}>{pending ? "…" : L(`Издай редакция № ${next}`, `Issue edition No. ${next}`)}</button>
        {msg && <span role={msg.ok ? "status" : "alert"} className="text-sm" style={{ color: msg.ok ? "var(--green-dark)" : "#9e2b2b" }}>{msg.text}</span>}
      </div>
    </form>
  );
}

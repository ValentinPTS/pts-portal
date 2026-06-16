"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSchemeSkinAction } from "@/lib/actions";

// Per-scheme skin picker. Changing it stores scheme.skin and re-renders the
// scheme's documents in the chosen skin (the document previews/PDFs pick it up).
export default function SkinPicker({
  schemeId,
  current,
  skins,
}: {
  schemeId: string;
  current: string;
  skins: { id: string; name: string }[];
}) {
  const [val, setVal] = useState(current);
  const [pending, start] = useTransition();
  const router = useRouter();

  function change(id: string) {
    setVal(id);
    start(async () => {
      await saveSchemeSkinAction(schemeId, id);
      router.refresh();
    });
  }

  return (
    <label className="flex items-center gap-2 text-sm" style={{ color: "var(--muted)" }}>
      Skin
      <select
        value={val}
        onChange={(e) => change(e.target.value)}
        disabled={pending}
        style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "7px 10px", background: "#fff", color: "var(--ink)", fontWeight: 600 }}
      >
        {skins.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      {pending && <span className="text-xs">saving…</span>}
      <Link href="/skins" className="text-xs" style={{ color: "var(--green-dark)", fontWeight: 600 }}>Manage</Link>
    </label>
  );
}

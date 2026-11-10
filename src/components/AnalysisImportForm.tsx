"use client";

import { useState, type ReactNode } from "react";
import { importAnalysisAction } from "@/lib/actions";

// The import form's size guard (plan part 7.2 review): a set larger than a server action takes
// (16 MB) never reaches the action — the browser would only show an error page. Totalled here, on
// every change and on submit: above 15 MB the same words the action says, and nothing is sent.
export default function AnalysisImportForm({ max, tooBig, children }: { max: number; tooBig: string; children: ReactNode }) {
  const [over, setOver] = useState(false);
  const total = (form: HTMLFormElement) => Array.from(form.querySelectorAll<HTMLInputElement>('input[type="file"]')).reduce((a, i) => a + Array.from(i.files ?? []).reduce((b, f) => b + f.size, 0), 0);
  return (
    <form action={importAnalysisAction} className="mt-3" data-import-form style={{ display: "grid", gap: 8, maxWidth: 640 }}
      onChange={(e) => setOver(total(e.currentTarget) > max)}
      onSubmit={(e) => { if (total(e.currentTarget) > max) { e.preventDefault(); setOver(true); } }}>
      {children}
      {over && <p role="alert" data-import-too-big className="text-sm" style={{ margin: 0, color: "#8f2f2f" }}>{tooBig}</p>}
    </form>
  );
}

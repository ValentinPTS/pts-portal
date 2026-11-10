"use client";

import { useActionState } from "react";
import Link from "next/link";
import { importReplayAction } from "@/lib/validation-actions";
import type { ReplayImportState } from "@/lib/replay-model";

// «Внеси приключил кръг» (plan part 8.2): the coded 2.0 input file of a closed round → a replay
// round in the test environment. What the file lacks, or holds that is not a code, is listed by its
// row — nothing is made unless the whole file reads.

const TEXT: Record<string, [string, string]> = {
  environment: ["Само в тестовата среда — истинският портал не приема възпроизвеждане.", "In the test environment only — the real portal takes no replay."],
  file: ["Това не е четим XLSX файл (до 16 MB).", "That is not a readable XLSX file (up to 16 MB)."],
  read: ["Файлът не е входен файл за 2.0 (договор 2.1) само с кодове — вижте редовете по-долу. Нищо не е внесено.", "The file is not a coded 2.0 input file (contract 2.1) — see the rows below. Nothing was loaded."],
  failed: ["Не е внесено докрай — опитайте пак.", "Not loaded whole — try again."],
};

export default function ReplayImport({ lang }: { lang: "bg" | "en" }) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const [state, act, pending] = useActionState<ReplayImportState, FormData>(importReplayAction, {});
  return (
    <div data-replay-import>
      <form action={act} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end" }}>
        <label className="text-sm" style={{ display: "grid", gap: 3 }}>{L("Входният файл за 2.0 на приключил кръг (XLSX, само кодове)", "A closed round's 2.0 input file (XLSX, codes only)")}
          <input type="file" name="file" required accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
        </label>
        <button type="submit" className="btn btn-sm btn-primary" disabled={pending} aria-busy={pending} data-replay-submit>{pending ? L("Внася се…", "Loading…") : L("Внеси", "Load")}</button>
      </form>
      {state.ok && state.schemeId && (
        <p className="text-sm" role="status" data-replay-done={state.schemeId} style={{ color: "var(--green-dark)", marginTop: 6 }}>
          {L("Внесен като ", "Loaded as ")}<Link href={`/schemes/${state.schemeId}#replay`}>{state.number}</Link>{L(" — в обработка, подаването заключено.", " — in processing, the submission locked.")}{state.unlogged ? L(" Редът в журнала не се записа — съобщете на администратора.", " Its journal line was not written — tell the administrator.") : ""}
        </p>
      )}
      {state.problem && (
        <div role="alert" className="text-sm" data-replay-problem={state.problem} style={{ color: "#8f2f2f", marginTop: 6 }}>
          <p style={{ margin: 0 }}>{L(...(TEXT[state.problem] ?? TEXT.failed))}{state.detail ? ` (${state.detail})` : ""}</p>
          {state.schemeId && <p style={{ margin: "2px 0 0" }} data-replay-failed-round={state.schemeId}>{L("Започнатият кръг е запазен и отбелязан като неуспешен: ", "The round begun is kept and marked as failed: ")}<Link href={`/schemes/${state.schemeId}#replay`}>{state.number}</Link></p>}
          {state.problems && state.problems.length > 0 && (
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }} data-replay-problems={state.problems.length}>
              {state.problems.map((p, i) => <li key={i}><b>{p.where}</b>: {p.why}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

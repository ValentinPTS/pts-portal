// «Запълнена» (plan part 3.7; Реш. 120 / К19): the participants and the applications
// still waiting have reached the scheme's maximum. A label and a warning to PTS —
// never a closing: applications stay open for the waiting list (9.3) and close only by
// date or by hand. Staff pages only — laboratories never see the maximum.
import { isFull, type Commercial } from "@/lib/commercial-model";

export default function SchemeFullNotice({ commercial, taken, lang }: { commercial?: Commercial; taken: number; lang: "bg" | "en" }) {
  if (!isFull(commercial, taken)) return null;
  const max = commercial!.maxParticipants;
  return (
    <div className="card p-3 mt-3 text-sm" data-scheme-full style={{ background: "#fdf6e3", border: "1px solid #ecd9a6", color: "#7a5a12" }}>
      <b>{lang === "bg" ? "Запълнена" : "Full"}</b> — {lang === "bg"
        ? `участниците и чакащите заявки (${taken}) достигнаха максималния брой (${max}). Заявяването остава отворено за списъка на изчакващите и се затваря само по дата или ръчно (Реш. 120). Лабораториите не виждат максималния брой.`
        : `the participants and the pending applications (${taken}) have reached the maximum (${max}). Applications stay open for the waiting list and close only by date or by hand (Реш. 120). Laboratories do not see the maximum.`}
    </div>
  );
}

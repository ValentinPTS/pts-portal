import Link from "next/link";
import { listSchemes } from "@/lib/store";

// Public landing for labs: the proficiency-testing schemes currently open for
// applications. No confidential data — title, object, dates, min participants.
export default async function ApplyHome() {
  const open = (await listSchemes()).filter((s) => s.status === "open");

  return (
    <div>
      <h1 className="text-4xl font-bold text-center" style={{ letterSpacing: "0.5px" }}>
        Изпитвания за пригодност
      </h1>
      <p className="text-center mt-2" style={{ color: "#aab59c" }}>
        Отворени схеми за заявки · Open proficiency testing schemes
      </p>
      <div className="mx-auto mt-3" style={{ width: 60, height: 3, background: "var(--green)" }} />

      {open.length === 0 ? (
        <div className="mt-10 text-center" style={{ color: "#aab59c" }}>
          В момента няма отворени схеми за заявки. / No schemes are open for applications right now.
        </div>
      ) : (
        <div className="mt-8 grid gap-4">
          {open.map((s) => (
            <Link
              key={s.id}
              href={`/apply/${s.id}`}
              className="no-underline"
              style={{
                display: "block",
                background: "#1b2016",
                border: "1px solid #36422c",
                borderRadius: 14,
                padding: "18px 22px",
                color: "#e7ece1",
              }}
            >
              <div className="flex items-center gap-3">
                <span style={{ fontWeight: 700, color: "var(--green-light)" }}>{s.number}</span>
                <span
                  className="chip"
                  style={{ background: "var(--green-dark)", marginLeft: "auto" }}
                >
                  {s.type === "C" ? "Калибриране" : "Изпитване"}
                </span>
              </div>
              <div className="mt-1" style={{ fontSize: "1.25rem", fontWeight: 700 }}>{s.titleBg}</div>
              <div style={{ color: "#aab59c" }}>{s.titleEn}</div>
              <div className="mt-2 text-sm" style={{ color: "#cdd6c2" }}>
                Обект: {s.objectBg} · мин. {s.minParticipants} участници
              </div>
              <div className="mt-3" style={{ color: "var(--green-light)", fontWeight: 700 }}>
                Заяви участие → / Apply →
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

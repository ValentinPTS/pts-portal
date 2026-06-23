"use client";

import { useLang } from "@/components/LangProvider";
import { UI_LANGS, type UiLang } from "@/lib/i18n";

const LABEL: Record<UiLang, string> = { bg: "БГ", en: "EN" };

// BG/EN switch. Default = light header (green on white, active = solid green pill).
// Pass `dark` on a dark background (e.g. the public apply flow) for white-on-dark.
export default function LanguageToggle({ dark = false }: { dark?: boolean }) {
  const { lang, setLang } = useLang();
  const borderC = dark ? "rgba(255,255,255,0.4)" : "var(--green-line)";
  return (
    <div
      role="group"
      aria-label="Language"
      style={{ display: "inline-flex", border: `1px solid ${borderC}`, borderRadius: 999, overflow: "hidden" }}
    >
      {UI_LANGS.map((l) => {
        const active = l === lang;
        const bg = active ? (dark ? "#fff" : "var(--green-dark)") : "transparent";
        const fg = active ? (dark ? "var(--green-dark)" : "#fff") : (dark ? "#fff" : "var(--green-dark)");
        return (
          <button
            key={l}
            type="button"
            onClick={() => setLang(l)}
            aria-pressed={active}
            style={{ border: "none", cursor: "pointer", padding: "5px 11px", fontSize: 12, fontWeight: 700, background: bg, color: fg }}
          >
            {LABEL[l]}
          </button>
        );
      })}
    </div>
  );
}

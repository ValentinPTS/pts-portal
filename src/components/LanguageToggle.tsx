"use client";

import { useLang } from "@/components/LangProvider";
import { UI_LANGS, type UiLang } from "@/lib/i18n";

const LABEL: Record<UiLang, string> = { bg: "БГ", en: "EN" };

// BG/EN switch for the (dark green) app headers. White-on-green; the active
// language gets a solid white pill. Flips the whole portal via LangProvider.
export default function LanguageToggle() {
  const { lang, setLang } = useLang();
  return (
    <div
      role="group"
      aria-label="Language"
      style={{ display: "inline-flex", border: "1px solid rgba(255,255,255,0.4)", borderRadius: 999, overflow: "hidden" }}
    >
      {UI_LANGS.map((l) => {
        const active = l === lang;
        return (
          <button
            key={l}
            type="button"
            onClick={() => setLang(l)}
            aria-pressed={active}
            style={{
              border: "none",
              cursor: "pointer",
              padding: "5px 11px",
              fontSize: 12,
              fontWeight: 700,
              background: active ? "#fff" : "transparent",
              color: active ? "var(--green-dark)" : "#fff",
            }}
          >
            {LABEL[l]}
          </button>
        );
      })}
    </div>
  );
}

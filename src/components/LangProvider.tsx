"use client";

import { createContext, useContext, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_LANG, LANG_COOKIE, makeT, type UiLang } from "@/lib/i18n";

type Ctx = {
  lang: UiLang;
  setLang: (l: UiLang) => void;
  t: (key: string) => string;
};

const LangCtx = createContext<Ctx | null>(null);

// Holds the current UI language for client components. Initialized from the cookie
// value the server already read (passed as `initial`), so the first client render
// matches the server render (no hydration flash). Changing the language writes the
// cookie and refreshes — that re-runs the server components, which read the same
// cookie via getUiLang(), keeping both halves of the app in sync.
export function LangProvider({ initial, children }: { initial: UiLang; children: React.ReactNode }) {
  const [lang, setLangState] = useState<UiLang>(initial);
  const router = useRouter();

  const setLang = useCallback(
    (l: UiLang) => {
      document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
      setLangState(l);
      router.refresh();
    },
    [router],
  );

  return (
    <LangCtx.Provider value={{ lang, setLang, t: makeT(lang) }}>{children}</LangCtx.Provider>
  );
}

// Client hook. Safe outside a provider (falls back to the default language) so a
// stray client component never crashes.
export function useLang(): Ctx {
  const ctx = useContext(LangCtx);
  if (ctx) return ctx;
  return { lang: DEFAULT_LANG, setLang: () => {}, t: makeT(DEFAULT_LANG) };
}

import { cookies } from "next/headers";
import { cache } from "react";
import { DEFAULT_LANG, LANG_COOKIE, isUiLang, makeT, type UiLang } from "./i18n";

// Server-side reader for the chosen UI language. Reads the `uiLang` cookie set by
// the LanguageToggle; defaults to Bulgarian. Memoized per request (cache) so many
// server components can call it without re-reading the cookie store.
export const getUiLang = cache(async (): Promise<UiLang> => {
  const store = await cookies();
  const v = store.get(LANG_COOKIE)?.value;
  return isUiLang(v) ? v : DEFAULT_LANG;
});

// Convenience: resolve the language AND a bound translator in one call, for server
// components — `const { lang, tr } = await getServerT();`.
export async function getServerT(): Promise<{ lang: UiLang; tr: (key: string) => string }> {
  const lang = await getUiLang();
  return { lang, tr: makeT(lang) };
}

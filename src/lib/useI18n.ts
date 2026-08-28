"use client";

import { useState, useEffect, useCallback } from "react";
import { getUILang, setUILang, t as translate, type Lang } from "@/lib/i18n";

/**
 * useI18n — React hook for multi-language UI
 *
 * Returns the current language + a translation function + a setter.
 * When the language changes, all components using this hook re-render
 * with the new translations.
 *
 * Usage:
 *   const { t, lang, setLang } = useI18n();
 *   <h1>{t("nav.home")}</h1>  // "Home" / "Nyumbani" / "Accueil"
 *   <button onClick={() => setLang("sw")}>Kiswahili</button>
 *
 * Phase 45: supports interpolation params:
 *   t("dash.reviewCards", { n: 5 })  →  "Review 5 cards"  (en)
 *   t("quiz.youNeed", { n: 70 })    →  "You need 70% to pass."  (en)
 */
export function useI18n() {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    setLangState(getUILang());
  }, []);

  const setLang = useCallback((newLang: Lang) => {
    setUILang(newLang);
    setLangState(newLang);
    // Force a re-render of all components using this hook
    window.dispatchEvent(new CustomEvent("lang-change", { detail: newLang }));
  }, []);

  // Listen for language changes from other components
  useEffect(() => {
    const handler = () => setLangState(getUILang());
    window.addEventListener("lang-change", handler);
    return () => window.removeEventListener("lang-change", handler);
  }, []);

  // Phase 45: t() now accepts optional interpolation params
  const t = useCallback((key: string, params?: Record<string, string | number>) => translate(key, lang, params), [lang]);

  return { t, lang, setLang };
}

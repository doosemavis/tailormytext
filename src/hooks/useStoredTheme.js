import { useState, useEffect, useMemo } from "react";
import { THEMES } from "../config/constants";
import { storageGet } from "../utils/storage";

// Pages outside App.jsx's main state surface (Privacy, Terms, Account,
// AdminPanel) previously inlined the same useState + useEffect +
// useMemo pattern to read the user's saved theme from localStorage so
// their chrome matches without spinning up AuthContext. Consolidated
// here so changes to the storage key or default land in one place.
export function useStoredTheme(defaultKey = "warm") {
  const [themeKey, setThemeKey] = useState(defaultKey);

  useEffect(() => {
    storageGet("theme").then((saved) => {
      if (saved && THEMES[saved]) setThemeKey(saved);
    });
  }, []);

  const t = useMemo(() => THEMES[themeKey], [themeKey]);

  return { themeKey, t };
}

import { useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  DisplayPreferencesContext,
  type AppScheme,
  type AppTheme,
} from './displayPreferences';

function readStoredOption<T extends string>(key: string, fallback: T, allowed: readonly T[], legacyKey?: string) {
  const value = window.localStorage.getItem(key) ?? (legacyKey ? window.localStorage.getItem(legacyKey) : null);
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function DisplayPreferencesProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<AppTheme>(() =>
    readStoredOption('gnss-app-theme', 'light', ['light', 'dark'] as const, 'gnss-overview-theme'),
  );
  const [scheme, setScheme] = useState<AppScheme>(() =>
    readStoredOption('gnss-app-scheme', 'standard', ['standard', 'glass'] as const, 'gnss-overview-scheme'),
  );

  useEffect(() => {
    window.localStorage.setItem('gnss-app-theme', theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem('gnss-app-scheme', scheme);
  }, [scheme]);

  const value = useMemo(() => ({ theme, scheme, setTheme, setScheme }), [scheme, theme]);

  return <DisplayPreferencesContext.Provider value={value}>{children}</DisplayPreferencesContext.Provider>;
}

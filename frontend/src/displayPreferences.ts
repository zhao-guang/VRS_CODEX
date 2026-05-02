import { createContext, useContext } from 'react';

export type AppTheme = 'light' | 'dark';
export type AppScheme = 'standard' | 'glass';

export type DisplayPreferencesContextValue = {
  theme: AppTheme;
  scheme: AppScheme;
  setTheme: (theme: AppTheme) => void;
  setScheme: (scheme: AppScheme) => void;
};

export const DisplayPreferencesContext = createContext<DisplayPreferencesContextValue | null>(null);

export function useDisplayPreferences() {
  const context = useContext(DisplayPreferencesContext);

  if (!context) {
    throw new Error('useDisplayPreferences must be used within DisplayPreferencesProvider');
  }

  return context;
}

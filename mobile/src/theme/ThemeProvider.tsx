import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import {
  darkColors,
  lightColors,
  radius,
  spacing,
  typography,
  hitTarget,
  type ColorScheme,
} from './tokens';

export interface Theme {
  mode: 'light' | 'dark';
  colors: ColorScheme;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  hitTarget: number;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const mode: 'light' | 'dark' = system === 'dark' ? 'dark' : 'light';

  const theme = useMemo<Theme>(
    () => ({
      mode,
      colors: mode === 'dark' ? darkColors : lightColors,
      spacing,
      radius,
      typography,
      hitTarget,
    }),
    [mode],
  );

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used within a ThemeProvider');
  return theme;
}

/**
 * StyleSheet factory helper. Usage:
 *   const useStyles = makeStyles((t) => ({ root: { padding: t.spacing.base } }));
 *   const styles = useStyles();
 */
export function makeStyles<T extends Record<string, object>>(
  factory: (theme: Theme) => T,
): () => T {
  return function useStyles() {
    const theme = useTheme();
    return useMemo(() => factory(theme), [theme]);
  };
}

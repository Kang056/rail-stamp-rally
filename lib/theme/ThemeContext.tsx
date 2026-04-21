'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type ColorMode = 'dark' | 'light';
export type ThemeColor = 'default' | 'blue' | 'green' | 'orange' | 'red';

const COLOR_MODE_KEY = 'rail-stamp-rally-color-mode';
const THEME_COLOR_KEY = 'rail-stamp-rally-theme-color';

interface ThemeContextValue {
  colorMode: ColorMode;
  themeColor: ThemeColor;
  setColorMode: (mode: ColorMode) => void;
  setThemeColor: (color: ThemeColor) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  colorMode: 'dark',
  themeColor: 'default',
  setColorMode: () => {},
  setThemeColor: () => {},
});

function applyTheme(colorMode: ColorMode, themeColor: ThemeColor) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-color-mode', colorMode);
  root.setAttribute('data-theme-color', themeColor);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [colorMode, setColorModeState] = useState<ColorMode>('dark');
  const [themeColor, setThemeColorState] = useState<ThemeColor>('default');

  useEffect(() => {
    const savedMode = localStorage.getItem(COLOR_MODE_KEY) as ColorMode | null;
    const savedColor = localStorage.getItem(THEME_COLOR_KEY) as ThemeColor | null;
    const mode = (savedMode === 'dark' || savedMode === 'light') ? savedMode : 'dark';
    const color: ThemeColor = (['default', 'blue', 'green', 'orange', 'red'] as ThemeColor[]).includes(savedColor as ThemeColor)
      ? (savedColor as ThemeColor)
      : 'default';
    setColorModeState(mode);
    setThemeColorState(color);
    applyTheme(mode, color);
  }, []);

  const setColorMode = useCallback((mode: ColorMode) => {
    setColorModeState(mode);
    localStorage.setItem(COLOR_MODE_KEY, mode);
    applyTheme(mode, themeColor);
  }, [themeColor]);

  const setThemeColor = useCallback((color: ThemeColor) => {
    setThemeColorState(color);
    localStorage.setItem(THEME_COLOR_KEY, color);
    applyTheme(colorMode, color);
  }, [colorMode]);

  // Apply on initial render (server-side default)
  useEffect(() => {
    applyTheme(colorMode, themeColor);
  }, [colorMode, themeColor]);

  return (
    <ThemeContext.Provider value={{ colorMode, themeColor, setColorMode, setThemeColor }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

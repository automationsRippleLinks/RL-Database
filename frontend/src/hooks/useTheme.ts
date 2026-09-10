import { useCallback, useEffect, useState } from 'react';

/**
 * Three states, not two. The account menu's Appearance control offers Light /
 * Dark / System, and "System" has to stay System: a user who picks it expects
 * the app to follow the OS when it flips at sunset, which a resolved-once
 * boolean cannot do. `theme` is the stored preference and `resolved` is what is
 * actually painted.
 */
export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'rl-theme';

function readStored(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // Private mode and blocked site data both throw here; the default is fine.
  }
  // Dark by default — this is a tool people keep open all day. Older builds
  // stored only 'light' | 'dark', so an unrecognised value lands here too.
  return 'dark';
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemePreference>(readStored);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  // Tracked whatever the preference is, so switching to "System" paints the
  // right thing immediately rather than after the next OS change.
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener('change', onChange);
    setSystemDark(query.matches);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const resolved: ResolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
    // Lets the browser paint form controls and scrollbars to match.
    document.documentElement.style.colorScheme = resolved;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Not being able to remember the choice is not a reason to fail the render.
    }
  }, [theme, resolved]);

  /** Kept for the plain light/dark switches outside the Pulse shell. */
  const toggle = useCallback(() => {
    setTheme(() => (resolved === 'dark' ? 'light' : 'dark'));
  }, [resolved]);

  return { theme, resolved, setTheme, toggle };
}

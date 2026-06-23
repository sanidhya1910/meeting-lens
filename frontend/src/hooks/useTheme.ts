import { useEffect, useState, useCallback } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'ml-theme';

function systemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(pref: ThemePref) {
  const resolved = pref === 'system' ? systemTheme() : pref;
  document.documentElement.setAttribute('data-theme', resolved);
}

/** Theme preference persisted to localStorage and applied as `data-theme` on <html>. */
export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(
    () => (localStorage.getItem(STORAGE_KEY) as ThemePref) || 'system',
  );

  useEffect(() => {
    applyTheme(pref);
    localStorage.setItem(STORAGE_KEY, pref);
  }, [pref]);

  // React to OS theme changes while in "system" mode.
  useEffect(() => {
    if (pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [pref]);

  const cycle = useCallback(() => {
    setPref(p => (p === 'light' ? 'dark' : p === 'dark' ? 'system' : 'light'));
  }, []);

  return { pref, setPref, cycle };
}

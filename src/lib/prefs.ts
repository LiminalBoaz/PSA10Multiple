import { useEffect, useState } from 'preact/hooks';

/** Per-device settings in localStorage. Storage can be unavailable (private mode), so every call is guarded. */
const KEY = (k: string) => `slab-scout:${k}`;

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(KEY(key));
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(KEY(key), JSON.stringify(value));
  } catch {
    /* not saved; the app still works for this visit */
  }
}

/** State that survives reloads on this device. */
export function usePref<T>(key: string, fallback: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => load(key, fallback));
  useEffect(() => save(key, value), [key, value]);
  return [value, setValue];
}

/** A card sent to GitHub to be added, waiting for its prices to show up in the data. */
export interface PendingCard {
  id: string;
  name: string;
  set: string;
  number: string;
  at: number;
}

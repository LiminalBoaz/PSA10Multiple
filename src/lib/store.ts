/** Per-device preferences. Storage can be unavailable (private mode), so every call is guarded. */
export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`slab-scout:${key}`);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(`slab-scout:${key}`, JSON.stringify(value));
  } catch {
    /* preference just won't persist */
  }
}

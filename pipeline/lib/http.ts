// Polite HTTP with an on-disk cache, so reruns don't hit the sites again.
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';

const CACHE_DIR = 'data/cache';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';

let last = 0;
export async function pace(ms: number): Promise<void> {
  const wait = last + ms - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
}

export function cachePath(key: string, ext = 'html'): string {
  return `${CACHE_DIR}/${createHash('sha1').update(key).digest('hex').slice(0, 16)}.${ext}`;
}

export async function readCache(key: string, maxAgeH: number, ext = 'html'): Promise<string | null> {
  const p = cachePath(key, ext);
  try {
    const s = await stat(p);
    if (Date.now() - s.mtimeMs > maxAgeH * 3600_000) return null;
    return await readFile(p, 'utf8');
  } catch {
    return null;
  }
}

export async function writeCache(key: string, body: string, ext = 'html'): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cachePath(key, ext), body);
}

/** GET text with caching, pacing and a few retries. Node's fetch uses HTTPS_PROXY when NODE_USE_ENV_PROXY=1. */
export async function getText(url: string, opts: { maxAgeH?: number; paceMs?: number; headers?: Record<string, string> } = {}): Promise<string> {
  const { maxAgeH = 20, paceMs = 1500, headers = {} } = opts;
  const cached = await readCache(url, maxAgeH);
  if (cached != null) return cached;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    await pace(paceMs * (attempt + 1));
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'en', ...headers }, redirect: 'follow' });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} for ${url}`), { fatal: true });
      const body = await res.text();
      await writeCache(url, body);
      return body;
    } catch (e) {
      lastErr = e;
      if ((e as { fatal?: boolean }).fatal) break;
    }
  }
  throw lastErr;
}

export async function getJson<T>(url: string, opts: Parameters<typeof getText>[1] = {}): Promise<T> {
  return JSON.parse(await getText(url, opts)) as T;
}

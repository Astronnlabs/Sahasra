/** Safe wrappers around Web Storage — storage can throw in private mode or when blocked. */
const PREFIX = 'sahasra.';

type StorageKind = 'local' | 'session';

function store(kind: StorageKind): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readStorage<T>(key: string, fallback: T, kind: StorageKind = 'local'): T {
  try {
    const raw = store(kind)?.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStorage<T>(key: string, value: T, kind: StorageKind = 'local') {
  try {
    store(kind)?.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable — preferences stay in memory */
  }
}

export function removeStorage(key: string, kind: StorageKind = 'local') {
  try {
    store(kind)?.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

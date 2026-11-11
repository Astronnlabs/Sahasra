const KEY = 'sahaasra:reloaded-for-update';

/**
 * Reloads the page once when a screen's file can't be loaded, which happens when the app was
 * updated while this tab was open (or the browser kept the previous version). Returns false if a
 * reload was already tried in the last minute, so a real network problem can't cause a loop.
 */
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/** True for the browser errors raised when a lazily loaded screen file is missing. */
export const isChunkLoadError = (e: unknown) =>
  e instanceof Error && /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk/i.test(e.message);

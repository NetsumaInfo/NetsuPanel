import { browser } from '@shared/browser';

const LAST_SOURCE_TAB_ID_KEY = 'lastSourceTabId';

function getTabIdFromLocation(): number | null {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('tabId');
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function isUsableSourceUrl(url?: string): boolean {
  if (!url) return false;
  return !(
    url.startsWith('chrome://') ||
    url.startsWith('about:') ||
    url.startsWith('moz-extension://') ||
    url.startsWith('chrome-extension://')
  );
}

function normalizeChapterIdentity(url: string): string {
  try {
    const parsed = new URL(url);
    const normalizedPath = parsed.pathname.replace(/\/+$/, '') || '/';
    return `${parsed.origin}${normalizedPath}`;
  } catch {
    return url.split('#')[0].replace(/\?.*$/, '').replace(/\/+$/, '');
  }
}

export function isSameChapterUrl(left: string, right: string): boolean {
  return normalizeChapterIdentity(left) === normalizeChapterIdentity(right);
}

export async function resolveBootstrapTabId(): Promise<number | null> {
  const queryTabId = getTabIdFromLocation();
  if (queryTabId) return queryTabId;

  const storage = await browser.storage.local.get(LAST_SOURCE_TAB_ID_KEY);
  const storedTabId = Number(storage[LAST_SOURCE_TAB_ID_KEY]);
  if (Number.isFinite(storedTabId)) {
    try {
      const storedTab = await browser.tabs.get(storedTabId);
      if (storedTab.id && isUsableSourceUrl(storedTab.url)) {
        return storedTab.id;
      }
    } catch {
      // Ignore and continue with active-tab fallback.
    }
  }

  const tabs = await browser.tabs.query({ lastFocusedWindow: true });
  const activeCandidate = tabs.find(
    (tab: { active?: boolean; id?: number; url?: string }) =>
      tab.active && tab.id && isUsableSourceUrl(tab.url)
  );
  if (activeCandidate?.id) return activeCandidate.id;

  const firstUsableCandidate = tabs.find(
    (tab: { id?: number; url?: string }) => tab.id && isUsableSourceUrl(tab.url)
  );
  return firstUsableCandidate?.id ?? null;
}

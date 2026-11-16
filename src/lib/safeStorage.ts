const memoryFallbackStorage = new Map<string, string>();

function isLocalStorageAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const testKey = '__educorrige_storage_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

const hasLocalStorage = isLocalStorageAvailable();

export function safeGetItem(key: string): string | null {
  try {
    if (hasLocalStorage && typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch {
    // Fallback to in-memory storage when WebView/browser blocks localStorage
  }
  return memoryFallbackStorage.get(key) ?? null;
}

export function safeSetItem(key: string, value: string): void {
  memoryFallbackStorage.set(key, value);
  try {
    if (hasLocalStorage && typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Ignore storage quota or security errors in restricted browsers/WebViews
  }
}

export function safeRemoveItem(key: string): void {
  memoryFallbackStorage.delete(key);
  try {
    if (hasLocalStorage && typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage errors
  }
}

export function safeGetJson<T>(key: string, validator?: (val: unknown) => val is T): T | null {
  const raw = safeGetItem(key);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (validator && !validator(parsed)) {
      safeRemoveItem(key);
      return null;
    }
    return parsed as T;
  } catch {
    safeRemoveItem(key);
    return null;
  }
}

export function clearAppLocalCache(): void {
  memoryFallbackStorage.clear();
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (
          key &&
          (key.startsWith('enem_') ||
            key.startsWith('cached_') ||
            key.startsWith('sb-') ||
            key === 'local_demo_session' ||
            key === 'last_reviewer_name')
        ) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => window.localStorage.removeItem(k));
    }
  } catch {
    // Ignore storage errors
  }
}

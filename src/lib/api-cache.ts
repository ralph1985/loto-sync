const API_CACHE_TTL_MS = 60 * 60 * 1000;

export const API_TICKETS_CACHE_KEY = "review:api:tickets";
export const API_GROUPS_CACHE_KEY = "review:api:groups";

type CacheOptions = {
  forceRefresh?: boolean;
};

export const readApiCache = <T,>(key: string, options: CacheOptions = {}): T | null => {
  if (options.forceRefresh || typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { cachedAt?: number; data?: T };
    if (
      typeof parsed.cachedAt === "number" &&
      Date.now() - parsed.cachedAt < API_CACHE_TTL_MS &&
      parsed.data !== undefined
    ) {
      return parsed.data;
    }
  } catch {
    window.localStorage.removeItem(key);
  }

  return null;
};

export const writeApiCache = <T,>(key: string, data: T) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    key,
    JSON.stringify({
      cachedAt: Date.now(),
      data,
    })
  );
};

export const invalidateApiCache = (...keys: string[]) => {
  if (typeof window === "undefined") return;
  keys.forEach((key) => window.localStorage.removeItem(key));
};

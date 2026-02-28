export type ClientSession = {
  id: string;
  name: string;
  memberships?: Array<{
    role: "OWNER" | "MEMBER";
    groupId?: string;
    group?: {
      id: string;
      name: string;
    };
  }>;
};

const SESSION_CACHE_KEY = "auth:session";
const SESSION_CACHE_TTL_MS = 2 * 60 * 1000;

type SessionCacheValue = {
  cachedAt: number;
  data: ClientSession | null;
};

const normalizeSession = (payload: unknown): ClientSession | null => {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as { data?: unknown };
  if (!root.data || typeof root.data !== "object") return null;
  const data = root.data as {
    id?: unknown;
    name?: unknown;
    memberships?: unknown;
  };
  if (typeof data.id !== "string" || typeof data.name !== "string") return null;
  return {
    id: data.id,
    name: data.name,
    memberships: Array.isArray(data.memberships)
      ? (data.memberships as ClientSession["memberships"])
      : [],
  };
};

const readSessionCache = (): ClientSession | null | undefined => {
  if (typeof window === "undefined") return undefined;
  const raw = window.localStorage.getItem(SESSION_CACHE_KEY);
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as SessionCacheValue;
    if (
      typeof parsed.cachedAt !== "number" ||
      Date.now() - parsed.cachedAt >= SESSION_CACHE_TTL_MS
    ) {
      window.localStorage.removeItem(SESSION_CACHE_KEY);
      return undefined;
    }
    return parsed.data ?? null;
  } catch {
    window.localStorage.removeItem(SESSION_CACHE_KEY);
    return undefined;
  }
};

const writeSessionCache = (data: ClientSession | null) => {
  if (typeof window === "undefined") return;
  const value: SessionCacheValue = {
    cachedAt: Date.now(),
    data,
  };
  window.localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(value));
};

export const clearSessionCache = () => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_CACHE_KEY);
};

export const loadSessionClient = async (options?: {
  forceRefresh?: boolean;
}): Promise<ClientSession | null> => {
  const forceRefresh = options?.forceRefresh ?? false;
  if (!forceRefresh) {
    const cached = readSessionCache();
    if (cached !== undefined) {
      return cached;
    }
  }

  const response = await fetch("/api/auth/session");
  if (response.status === 401) {
    writeSessionCache(null);
    return null;
  }
  if (!response.ok) {
    throw new Error("No se pudo cargar la sesión.");
  }

  const payload = await response.json();
  const session = normalizeSession(payload);
  writeSessionCache(session);
  return session;
};

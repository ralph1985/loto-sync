export type ResultGame = "PRIMITIVA" | "EUROMILLONES";
export type ResultFilter = "ALL" | ResultGame;

export type StoredResult = {
  id: string;
  game: ResultGame;
  drawDate: string | null;
  numbers: number[];
  stars?: number[];
  complementario?: number | null;
  reintegro?: number | null;
  fetchedAt: string;
};

export type DisplayedResult = StoredResult & { isMissing: boolean };

export const DRAW_WEEKDAYS = new Set([1, 4, 6]);

const STORED_RESULTS_CACHE_PREFIX = "results:stored:";
const STORED_RESULTS_CACHE_TTL_MS = 60 * 60 * 1000;

const getStoredResultsCacheKey = (gameFilter: ResultFilter) =>
  `${STORED_RESULTS_CACHE_PREFIX}${gameFilter}`;

export const clearStoredResultsCache = () => {
  if (typeof window === "undefined") return;
  const keys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key && key.startsWith(STORED_RESULTS_CACHE_PREFIX)) keys.push(key);
  }
  keys.forEach((key) => window.localStorage.removeItem(key));
};

export const loadStoredResults = async (
  gameFilter: ResultFilter,
  forceRefresh = false
): Promise<StoredResult[]> => {
  const cacheKey = getStoredResultsCacheKey(gameFilter);
  if (!forceRefresh && typeof window !== "undefined") {
    const cachedRaw = window.localStorage.getItem(cacheKey);
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw) as { cachedAt?: number; data?: StoredResult[] };
        if (
          Array.isArray(cached.data) &&
          typeof cached.cachedAt === "number" &&
          cached.cachedAt > 0 &&
          Date.now() - cached.cachedAt < STORED_RESULTS_CACHE_TTL_MS
        ) {
          return cached.data;
        }
      } catch {
        window.localStorage.removeItem(cacheKey);
      }
    }
  }

  const query = gameFilter === "ALL" ? "/api/results/stored" : `/api/results/stored?game=${gameFilter}`;
  const response = await fetch(query);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error || "No se pudieron cargar resultados.");
  const data = (payload.data ?? []) as StoredResult[];
  if (typeof window !== "undefined") {
    window.localStorage.setItem(cacheKey, JSON.stringify({ cachedAt: Date.now(), data }));
  }
  return data;
};

export const buildDisplayedResults = (
  storedResults: StoredResult[],
  gameFilter: ResultFilter,
  today = new Date()
): DisplayedResult[] => {
  const rows: DisplayedResult[] = storedResults.map((item) => ({ ...item, isMissing: false }));
  const shouldInjectPrimitivaGaps = gameFilter === "ALL" || gameFilter === "PRIMITIVA";
  if (shouldInjectPrimitivaGaps) {
    const primitivaDates = storedResults
      .filter((item) => item.game === "PRIMITIVA" && item.drawDate)
      .map((item) => item.drawDate as string)
      .sort();

    if (primitivaDates.length > 0) {
      const firstDate = new Date(`${primitivaDates[0]}T00:00:00Z`);
      const endDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      const available = new Set(primitivaDates);
      for (let cursor = new Date(firstDate); cursor <= endDate; cursor = new Date(cursor.getTime() + 86400000)) {
        if (!DRAW_WEEKDAYS.has(cursor.getUTCDay())) continue;
        const drawDate = cursor.toISOString().slice(0, 10);
        if (!available.has(drawDate)) {
          rows.push({
            id: `missing-${drawDate}`,
            game: "PRIMITIVA",
            drawDate,
            numbers: [],
            stars: [],
            complementario: null,
            reintegro: null,
            fetchedAt: "",
            isMissing: true,
          });
        }
      }
    }
  }

  return rows.sort((left, right) => {
    const leftTime = left.drawDate ? Date.parse(`${left.drawDate}T00:00:00Z`) : 0;
    const rightTime = right.drawDate ? Date.parse(`${right.drawDate}T00:00:00Z`) : 0;
    if (rightTime !== leftTime) return rightTime - leftTime;
    if (left.isMissing !== right.isMissing) return left.isMissing ? 1 : -1;
    if (!left.fetchedAt || !right.fetchedAt) return 0;
    return Date.parse(right.fetchedAt) - Date.parse(left.fetchedAt);
  });
};

export const getRecentResults = (
  results: StoredResult[],
  game: ResultGame,
  limit = 3
) => results
  .filter((result) => result.game === game && result.drawDate)
  .sort((left, right) => Date.parse(`${right.drawDate}T00:00:00Z`) - Date.parse(`${left.drawDate}T00:00:00Z`))
  .slice(0, limit);

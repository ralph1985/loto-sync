type DrawType = 'PRIMITIVA' | 'EUROMILLONES'

export type NormalizedResult = {
  game: DrawType
  drawDate: string
  numbers: number[]
  stars?: number[]
  source: 'loteriasapi'
}

type CacheEntry = {
  expiresAt: number
  data: NormalizedResult
}

const CACHE_TTL_MS = 10 * 60 * 1000
const cache = new Map<string, CacheEntry>()

const GAME_MAP: Record<DrawType, string> = {
  PRIMITIVA: 'primitiva',
  EUROMILLONES: 'euromillones'
}

const normalizeResult = (game: DrawType, payload: any): NormalizedResult => {
  const data = payload?.data ?? payload
  const drawDate = data?.date ?? data?.drawDate

  return {
    game,
    drawDate,
    numbers: data?.numbers ?? [],
    stars: data?.stars ?? undefined,
    source: 'loteriasapi'
  }
}

export const fetchLatestResult = async (
  game: DrawType
): Promise<NormalizedResult> => {
  const cached = cache.get(game)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data
  }

  const apiKey = process.env.LOTERIAS_API_KEY
  if (!apiKey) {
    throw new Error('LOTERIAS_API_KEY no configurada.')
  }

  const baseUrl = process.env.LOTERIAS_API_BASE || 'https://api.loteriasapi.com/api/v1'
  const response = await fetch(
    `${baseUrl}/results/${GAME_MAP[game]}/latest`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    }
  )

  if (!response.ok) {
    throw new Error('No se pudo obtener el resultado.')
  }

  const payload = await response.json()
  const normalized = normalizeResult(game, payload)
  cache.set(game, {
    data: normalized,
    expiresAt: Date.now() + CACHE_TTL_MS
  })

  return normalized
}

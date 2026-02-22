type DrawType = 'PRIMITIVA' | 'EUROMILLONES'

export type NormalizedResult = {
  game: DrawType
  drawDate: string
  numbers: number[]
  stars?: number[]
  source: 'loteriasapi'
}

import { prisma } from '@/lib/prisma'

type CacheEntry = {
  expiresAt: number
  data: NormalizedResult
}

const CACHE_TTL_MS = 10 * 60 * 1000
const CACHE_RATE_LIMIT_MS = 30 * 1000
const cache = new Map<string, CacheEntry>()
const rateLimit = new Map<string, number>()

const GAME_MAP: Record<DrawType, string> = {
  PRIMITIVA: 'primitiva',
  EUROMILLONES: 'euromillones'
}

type RawResultPayload = {
  success?: boolean
  timestamp?: string
  data?:
    | {
        date?: string
        drawDate?: string
        numbers?: unknown[]
        stars?: unknown[]
        combination?: unknown[]
        resultData?: {
          estrellas?: unknown[]
          stars?: unknown[]
        }
        [key: string]: unknown
      }
    | Array<Record<string, unknown>>
    | null
  date?: string
  drawDate?: string
  numbers?: unknown[]
  stars?: unknown[]
  combination?: unknown[]
  resultData?: {
    estrellas?: unknown[]
    stars?: unknown[]
  }
  [key: string]: unknown
}

const coerceNumberArray = (value: unknown): number[] => {
  if (!Array.isArray(value)) return []
  return value
    .map((item) =>
      typeof item === 'number'
        ? item
        : typeof item === 'string'
          ? Number.parseInt(item, 10)
          : NaN
    )
    .filter((item) => Number.isFinite(item))
}

const pickResultObject = (payload: RawResultPayload): Record<string, unknown> | null => {
  const data = payload.data
  if (Array.isArray(data)) {
    return (data[0] as Record<string, unknown>) ?? null
  }
  if (data && typeof data === 'object') {
    return data as Record<string, unknown>
  }
  if (Array.isArray(payload as unknown as unknown[])) {
    return ((payload as unknown as unknown[])[0] as Record<string, unknown>) ?? null
  }
  return payload as Record<string, unknown>
}

const normalizeResult = (
  game: DrawType,
  payload: RawResultPayload,
  options?: {
    fallbackDrawDate?: string
  }
): NormalizedResult => {
  const data = pickResultObject(payload)
  const drawDateRaw = (data?.date as string | undefined) ?? (data?.drawDate as string | undefined)
  const drawDate =
    typeof drawDateRaw === 'string'
      ? drawDateRaw
      : options?.fallbackDrawDate ?? new Date().toISOString()

  const resultData = (data?.resultData ?? {}) as Record<string, unknown>
  const numbers = [
    ...coerceNumberArray(data?.numbers),
    ...coerceNumberArray(data?.combination),
    ...coerceNumberArray(resultData.numbers),
    ...coerceNumberArray(resultData.combination)
  ]
  const uniqueNumbers = [...new Set(numbers)]

  const stars = [
    ...coerceNumberArray(data?.stars),
    ...coerceNumberArray(data?.estrellas),
    ...coerceNumberArray(resultData.stars),
    ...coerceNumberArray(resultData.estrellas)
  ]
  const uniqueStars = [...new Set(stars)]

  return {
    game,
    drawDate,
    numbers: uniqueNumbers,
    stars: uniqueStars.length > 0 ? uniqueStars : undefined,
    source: 'loteriasapi'
  }
}

export const fetchLatestResult = async (
  game: DrawType
): Promise<NormalizedResult> => {
  const cacheKey = `${game}:latest`
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data
  }

  const apiKey = process.env.LOTERIAS_API_KEY
  if (!apiKey) {
    throw new Error('LOTERIAS_API_KEY no configurada.')
  }

  const dbCached = await prisma.resultCache.findFirst({
    where: {
      game
    },
    orderBy: { fetchedAt: 'desc' }
  })

  if (dbCached) {
    const isFresh = Date.now() - dbCached.fetchedAt.getTime() < CACHE_TTL_MS
    const normalized = normalizeResult(game, dbCached.payload)
    if (isFresh && normalized.numbers.length > 0) {
      cache.set(cacheKey, {
        data: normalized,
        expiresAt: Date.now() + CACHE_TTL_MS
      })
      return normalized
    }
  }

  const lastRequest = rateLimit.get(game)
  if (lastRequest && Date.now() - lastRequest < CACHE_RATE_LIMIT_MS) {
    if (dbCached) {
      const normalized = normalizeResult(game, dbCached.payload)
      cache.set(cacheKey, {
        data: normalized,
        expiresAt: Date.now() + CACHE_TTL_MS
      })
      return normalized
    }
  }

  rateLimit.set(game, Date.now())

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

  const drawDateValue = normalized.drawDate ? new Date(normalized.drawDate) : null
  await prisma.resultCache.upsert({
    where: {
      game_drawDate: {
        game,
        drawDate: drawDateValue
      }
    },
    update: {
      payload,
      fetchedAt: new Date()
    },
    create: {
      game,
      drawDate: drawDateValue,
      payload,
      fetchedAt: new Date()
    }
  })

  cache.set(cacheKey, {
    data: normalized,
    expiresAt: Date.now() + CACHE_TTL_MS
  })

  return normalized
}

const toDateOnly = (value: string) => new Date(value).toISOString().slice(0, 10)

const findCacheForDrawDate = async (
  game: DrawType,
  drawDate: string
) => {
  const dayStart = new Date(`${drawDate}T00:00:00.000Z`)
  const dayEnd = new Date(`${drawDate}T23:59:59.999Z`)

  return prisma.resultCache.findFirst({
    where: {
      game,
      drawDate: {
        gte: dayStart,
        lte: dayEnd
      }
    },
    orderBy: { fetchedAt: 'desc' }
  })
}

const fetchWithDate = async (
  game: DrawType,
  drawDate: string,
  apiKey: string,
  baseUrl: string
) => {
  const gamePath = GAME_MAP[game]
  const candidates = [
    `${baseUrl}/results/${gamePath}/${drawDate}`,
    `${baseUrl}/results/${gamePath}?date=${drawDate}`
  ]

  for (const url of candidates) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    })
    if (!response.ok) {
      continue
    }
    const payload = (await response.json()) as RawResultPayload
    if (payload?.success === true && payload?.data == null) {
      continue
    }
    const normalized = normalizeResult(game, payload, {
      fallbackDrawDate: drawDate
    })
    if (normalized.numbers.length === 0) {
      continue
    }
    return { payload, normalized }
  }

  return null
}

export const fetchResultForDrawDate = async (
  game: DrawType,
  drawDate: string
): Promise<NormalizedResult> => {
  const cacheKey = `${game}:${drawDate}`
  const memoryCached = cache.get(cacheKey)
  if (memoryCached && memoryCached.expiresAt > Date.now()) {
    return memoryCached.data
  }

  const dbCached = await findCacheForDrawDate(game, drawDate)
  if (dbCached) {
    const isFresh = Date.now() - dbCached.fetchedAt.getTime() < CACHE_TTL_MS
    const normalized = normalizeResult(game, dbCached.payload, {
      fallbackDrawDate: drawDate
    })
    if (isFresh && normalized.numbers.length > 0) {
      cache.set(cacheKey, {
        data: normalized,
        expiresAt: Date.now() + CACHE_TTL_MS
      })
      return normalized
    }
  }

  const apiKey = process.env.LOTERIAS_API_KEY
  if (!apiKey) {
    throw new Error('LOTERIAS_API_KEY no configurada.')
  }

  const baseUrl = process.env.LOTERIAS_API_BASE || 'https://api.loteriasapi.com/api/v1'
  const resultByDate = await fetchWithDate(game, drawDate, apiKey, baseUrl)
  if (resultByDate) {
    const normalizedDateOnly = resultByDate.normalized.drawDate
      ? toDateOnly(resultByDate.normalized.drawDate)
      : null
    const drawDateValue = normalizedDateOnly
      ? new Date(`${normalizedDateOnly}T00:00:00.000Z`)
      : null

    await prisma.resultCache.upsert({
      where: {
        game_drawDate: {
          game,
          drawDate: drawDateValue
        }
      },
      update: {
        payload: resultByDate.payload,
        fetchedAt: new Date()
      },
      create: {
        game,
        drawDate: drawDateValue,
        payload: resultByDate.payload,
        fetchedAt: new Date()
      }
    })

    cache.set(cacheKey, {
      data: resultByDate.normalized,
      expiresAt: Date.now() + CACHE_TTL_MS
    })

    return resultByDate.normalized
  }

  if (dbCached) {
    const normalized = normalizeResult(game, dbCached.payload, {
      fallbackDrawDate: drawDate
    })
    if (normalized.numbers.length > 0) {
      cache.set(cacheKey, {
        data: normalized,
        expiresAt: Date.now() + CACHE_TTL_MS
      })
      return normalized
    }
  }

  return {
    game,
    drawDate,
    numbers: [],
    source: 'loteriasapi'
  }
}

import { NextResponse } from 'next/server'

import { ApiAuthError, requireGroupAccess, requireSessionUser } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { prisma } from '@/lib/prisma'

type TicketLineInput = {
  mainNumbers: number[]
  starNumbers?: number[]
  complement?: number
  reintegro?: number
}

type TicketInput = {
  ticketId?: string
  groupId: string
  drawId?: string
  drawType?: 'PRIMITIVA' | 'EUROMILLONES'
  drawDate?: string
  drawDates?: string[]
  priceCents?: number
  playsJoker?: boolean
  jokerNumber?: string
  notes?: string
  lines: TicketLineInput[]
}

const PRIMITIVA_DRAW_WEEKDAYS = new Set([1, 4, 6])

const isValidNumberArray = (values: number[], expected: number, min: number, max: number) => {
  if (values.length !== expected) {
    return `Necesitas ${expected} numeros.`
  }
  const unique = new Set(values)
  if (unique.size !== values.length) {
    return 'Hay numeros repetidos.'
  }
  if (values.some((value) => value < min || value > max)) {
    return `Los numeros deben estar entre ${min} y ${max}.`
  }
  return null
}

const ensureOptionalNumber = (value: number | undefined, min: number, max: number) => {
  if (value === undefined || value === null) {
    return null
  }
  if (!Number.isInteger(value)) {
    return 'Debe ser un numero entero.'
  }
  if (value < min || value > max) {
    return `Debe estar entre ${min} y ${max}.`
  }
  return null
}

const validateTicket = (input: TicketInput, drawType: 'PRIMITIVA' | 'EUROMILLONES') => {
  const issues: string[] = []

  if (!input.groupId) {
    issues.push('groupId es obligatorio.')
  }
  if (!input.drawId && (!input.drawType || !input.drawDate)) {
    issues.push('drawId o drawType+drawDate son obligatorios.')
  }
  if (input.drawDates !== undefined && (!Array.isArray(input.drawDates) || input.drawDates.length === 0)) {
    issues.push('drawDates debe incluir al menos una fecha.')
  }
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    issues.push('Debes incluir al menos una linea.')
  }
  if (input.priceCents !== undefined && input.priceCents < 0) {
    issues.push('priceCents no puede ser negativo.')
  }
  if (input.priceCents !== undefined && !Number.isInteger(input.priceCents)) {
    issues.push('priceCents debe ser un entero.')
  }
  if (typeof input.playsJoker !== 'undefined' && typeof input.playsJoker !== 'boolean') {
    issues.push('playsJoker debe ser true o false.')
  }

  const jokerNumber = input.jokerNumber?.trim()
  if (jokerNumber && !/^\d{7}$/.test(jokerNumber)) {
    issues.push('jokerNumber debe tener 7 digitos.')
  }
  if (drawType !== 'PRIMITIVA' && input.playsJoker) {
    issues.push('Joker solo aplica a Primitiva.')
  }
  if (drawType !== 'PRIMITIVA' && jokerNumber) {
    issues.push('jokerNumber solo aplica a Primitiva.')
  }
  if (drawType === 'PRIMITIVA' && input.playsJoker && !jokerNumber) {
    issues.push('jokerNumber es obligatorio cuando playsJoker es true.')
  }
  if (drawType === 'PRIMITIVA' && !input.playsJoker && jokerNumber) {
    issues.push('No puedes enviar jokerNumber si playsJoker es false.')
  }

  input.lines.forEach((line, index) => {
    const linePrefix = `Linea ${index + 1}: `
    const main = line.mainNumbers ?? []
    const stars = line.starNumbers ?? []

    if (drawType === 'PRIMITIVA') {
      const error = isValidNumberArray(main, 6, 1, 49)
      if (error) issues.push(`${linePrefix}Numeros: ${error}`)

      if (line.complement !== undefined) {
        const errorComplement = ensureOptionalNumber(line.complement, 1, 49)
        if (errorComplement) {
          issues.push(`${linePrefix}Complementario: ${errorComplement}`)
        } else if (main.includes(line.complement)) {
          issues.push(`${linePrefix}Complementario no puede repetirse.`)
        }
      }

      if (line.reintegro !== undefined) {
        const errorReintegro = ensureOptionalNumber(line.reintegro, 0, 9)
        if (errorReintegro) {
          issues.push(`${linePrefix}Reintegro: ${errorReintegro}`)
        }
      }
    }

    if (drawType === 'EUROMILLONES') {
      const errorMain = isValidNumberArray(main, 5, 1, 50)
      if (errorMain) issues.push(`${linePrefix}Numeros: ${errorMain}`)

      const errorStars = isValidNumberArray(stars, 2, 1, 12)
      if (errorStars) issues.push(`${linePrefix}Estrellas: ${errorStars}`)
    }
  })

  return issues
}

const parseDateOnly = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const normalizeDrawDates = (
  drawDates: string[] | undefined,
  fallbackDrawDate: string | undefined
) => {
  const dates = (drawDates && drawDates.length > 0 ? drawDates : fallbackDrawDate ? [fallbackDrawDate] : [])
    .map((value) => value.trim())
    .filter(Boolean)
  const unique = Array.from(new Set(dates))
  return unique.sort((left, right) => left.localeCompare(right))
}

const validateDrawDatesForType = (drawType: 'PRIMITIVA' | 'EUROMILLONES', drawDates: string[]) => {
  const issues: string[] = []
  drawDates.forEach((date) => {
    const parsed = parseDateOnly(date)
    if (!parsed) {
      issues.push(`drawDate no es valida: ${date}`)
      return
    }
    if (drawType === 'PRIMITIVA' && !PRIMITIVA_DRAW_WEEKDAYS.has(parsed.getUTCDay())) {
      issues.push(`Primitiva solo admite lunes, jueves o sabado: ${date}`)
    }
  })
  return issues
}

const toDateKey = (value: Date) => value.toISOString().slice(0, 10)

type PrimitivaExtras = {
  complementario: number | null
  reintegro: number | null
}

const normalizeNumberArray = (value: unknown): number[] => {
  const parseValue = (input: unknown): unknown => {
    if (typeof input !== 'string') return input
    try {
      return JSON.parse(input)
    } catch {
      return input
    }
  }

  const parsed = parseValue(value)
  if (!Array.isArray(parsed)) return []

  return parsed
    .map((item) => {
      if (typeof item === 'number') return item
      if (typeof item === 'string') return Number.parseInt(item, 10)
      return NaN
    })
    .filter((item) => Number.isFinite(item))
}

const extractPrimitivaExtras = (payload: unknown): PrimitivaExtras => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { complementario: null as number | null, reintegro: null as number | null }
  }
  const root = payload as Record<string, unknown>
  const data =
    root.data && typeof root.data === 'object' && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : root
  const resultData =
    data.resultData && typeof data.resultData === 'object' && !Array.isArray(data.resultData)
      ? (data.resultData as Record<string, unknown>)
      : null

  const complementarioRaw = resultData?.complementario
  const reintegroRaw = resultData?.reintegro
  const complementario =
    typeof complementarioRaw === 'number'
      ? complementarioRaw
      : typeof complementarioRaw === 'string'
        ? Number.parseInt(complementarioRaw, 10)
        : null
  const reintegro =
    typeof reintegroRaw === 'number'
      ? reintegroRaw
      : typeof reintegroRaw === 'string'
        ? Number.parseInt(reintegroRaw, 10)
        : null

  return {
    complementario: Number.isFinite(complementario as number) ? complementario : null,
    reintegro: Number.isFinite(reintegro as number) ? reintegro : null
  }
}

export async function GET() {
  try {
    const user = await requireSessionUser()

    const tickets = await prisma.ticket.findMany({
      where: {
        group: {
          members: {
            some: {
              userId: user.id
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      include: {
        group: true,
        draw: true,
        lines: {
          include: {
            numbers: true
          }
        },
        receipt: true,
        checks: {
          orderBy: { drawDate: 'desc' }
        }
      }
    })

  const primitiveCheckDateSet = new Set<string>()
  tickets.forEach((ticket: (typeof tickets)[number]) => {
    if (ticket.draw?.type !== 'PRIMITIVA') return
    ticket.checks.forEach((check: (typeof ticket.checks)[number]) => {
      primitiveCheckDateSet.add(toDateKey(check.drawDate))
    })
  })

  const primitiveDates = Array.from(primitiveCheckDateSet)
  const primitiveCaches = primitiveDates.length
    ? await prisma.resultCache.findMany({
        where: {
          game: 'PRIMITIVA',
          drawDate: {
            in: primitiveDates.map((date: (typeof primitiveDates)[number]) => new Date(`${date}T00:00:00.000Z`))
          }
        }
      })
    : []

  const cacheByDate = new Map<string, PrimitivaExtras>(
    primitiveCaches.map(
      (cache: (typeof primitiveCaches)[number]): [string, PrimitivaExtras] => [
        toDateKey(cache.drawDate as Date),
        extractPrimitivaExtras(cache.payload)
      ]
    )
  )

    const enriched = tickets.map((ticket: (typeof tickets)[number]) => ({
      ...ticket,
      checks: ticket.checks.map((check: (typeof ticket.checks)[number]) => {
        const extras = ticket.draw?.type === 'PRIMITIVA' ? cacheByDate.get(toDateKey(check.drawDate)) : null
        return {
          ...check,
          winningNumbers: normalizeNumberArray(check.winningNumbers),
          winningStars: normalizeNumberArray(check.winningStars),
          winningComplementario: extras?.complementario ?? null,
          winningReintegro: extras?.reintegro ?? null
        }
      })
    }))

    return NextResponse.json({ data: enriched })
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'No se pudieron cargar boletos.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser()
    const payload = (await request.json()) as TicketInput

  let draw:
    | {
        id: string
        type: 'PRIMITIVA' | 'EUROMILLONES'
      }
    | null = null

  if (payload.drawId) {
    draw = await prisma.draw.findUnique({
      where: { id: payload.drawId },
      select: { id: true, type: true }
    })
    if (!draw) {
      return NextResponse.json(
        { error: 'drawId no existe.' },
        { status: 400 }
      )
    }
  } else {
    if (!payload.drawType || !payload.drawDate) {
      return NextResponse.json(
        { error: 'drawType y drawDate son obligatorios.' },
        { status: 400 }
      )
    }

    const normalizedDrawDates = normalizeDrawDates(payload.drawDates, payload.drawDate)
    if (normalizedDrawDates.length === 0) {
      return NextResponse.json(
        { error: 'drawDate o drawDates son obligatorios.' },
        { status: 400 }
      )
    }
    const drawDateIssues = validateDrawDatesForType(payload.drawType, normalizedDrawDates)
    if (drawDateIssues.length > 0) {
      return NextResponse.json(
        { error: 'Validacion de fechas fallida.', issues: drawDateIssues },
        { status: 400 }
      )
    }
    const primaryDrawDate = normalizedDrawDates[normalizedDrawDates.length - 1]
    const parsedDate = parseDateOnly(primaryDrawDate)
    if (!parsedDate) {
      return NextResponse.json(
        { error: 'drawDate no es valida.' },
        { status: 400 }
      )
    }

    draw = await prisma.draw.upsert({
      where: {
        type_drawDate: {
          type: payload.drawType,
          drawDate: parsedDate
        }
      },
      update: {},
      create: {
        type: payload.drawType,
        drawDate: parsedDate
      },
      select: { id: true, type: true }
    })
    payload.drawDates = normalizedDrawDates
    payload.drawDate = primaryDrawDate
  }

    const groupExists = await prisma.group.findUnique({
      where: { id: payload.groupId }
    })
    if (!groupExists) {
      return NextResponse.json(
        { error: 'groupId no existe.' },
        { status: 400 }
      )
    }
    await requireGroupAccess(user.id, payload.groupId, { ownerOnly: true })

    if (!draw) {
      return NextResponse.json(
        { error: 'No se pudo resolver el sorteo.' },
        { status: 400 }
      )
    }

    const issues = validateTicket(payload, draw.type)
    if (issues.length > 0) {
      return NextResponse.json(
        { error: 'Validacion fallida.', issues },
        { status: 400 }
      )
    }

    const drawDates = normalizeDrawDates(payload.drawDates, payload.drawDate)

    const created = await prisma.$transaction(async (tx: unknown) => {
      const db = tx as typeof prisma
      const ticket = await db.ticket.create({
        data: {
          groupId: payload.groupId,
          drawId: draw.id,
          status: 'PENDIENTE',
          priceCents: payload.priceCents ?? null,
          playsJoker: payload.playsJoker ?? false,
          jokerNumber: payload.jokerNumber?.trim() || null,
          notes: payload.notes ?? null,
          lines: {
            create: payload.lines.map((line, index) => ({
              lineIndex: index + 1,
              complement: line.complement ?? null,
              reintegro: line.reintegro ?? null,
              numbers: {
                create: [
                  ...line.mainNumbers.map((value, position) => ({
                    kind: 'MAIN',
                    position: position + 1,
                    value
                  })),
                  ...(draw.type === 'EUROMILLONES'
                    ? (line.starNumbers ?? []).map((value, position) => ({
                        kind: 'STAR',
                        position: position + 1,
                        value
                      }))
                    : [])
                ]
              }
            }))
          }
        },
        include: {
          group: true,
          draw: true,
          lines: {
            include: { numbers: true }
          },
          receipt: true,
          checks: {
            orderBy: { drawDate: 'desc' }
          }
        }
      })

      if (drawDates.length > 0) {
        await db.ticketCheck.createMany({
          data: drawDates
            .map((date) => parseDateOnly(date))
            .filter((date): date is Date => Boolean(date))
            .map((date) => ({
              ticketId: ticket.id,
              drawDate: date,
              status: 'PENDIENTE' as const,
              reason: 'Pendiente de comprobacion.',
              winningNumbers: [],
              winningStars: [],
              matchesMain: 0,
              matchesStars: 0,
              checkedAt: new Date()
            })),
          skipDuplicates: true
        })
      }

      const priceCents = payload.priceCents ?? 0
      if (priceCents > 0) {
        await db.groupMovement.create({
          data: {
            groupId: payload.groupId,
            type: 'TICKET_EXPENSE',
            amountCents: -priceCents,
            occurredAt: new Date(),
            note: `Boleto ${draw.type} ${payload.drawDate ?? ''}`.trim(),
            relatedTicketId: ticket.id
          }
        })
      }

      return ticket
    })

    await writeAuditLog({
      actorId: user.id,
      entityType: 'TICKET',
      entityId: created.id,
      action: 'CREATE',
      payload: {
        groupId: payload.groupId,
        drawType: draw.type
      }
    })

    return NextResponse.json({ data: created }, { status: 201 })
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo guardar el boleto.' },
      { status: 500 }
    )
  }
}

type TicketPatchInput = {
  ticketId?: string
  drawDate?: string
  drawDates?: string[]
}

export async function PATCH(request: Request) {
  try {
    const user = await requireSessionUser()
    const payload = (await request.json()) as TicketPatchInput
    const ticketId = payload.ticketId?.trim()
    if (!ticketId) {
      return NextResponse.json({ error: 'ticketId es obligatorio.' }, { status: 400 })
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        draw: true,
        checks: true
      }
    })
    if (!ticket || !ticket.draw) {
      return NextResponse.json({ error: 'ticketId no existe.' }, { status: 404 })
    }

    await requireGroupAccess(user.id, ticket.groupId, { ownerOnly: true })

    const normalizedDrawDates = normalizeDrawDates(payload.drawDates, payload.drawDate)
    if (normalizedDrawDates.length === 0) {
      return NextResponse.json(
        { error: 'drawDate o drawDates son obligatorios.' },
        { status: 400 }
      )
    }

    const drawDateIssues = validateDrawDatesForType(ticket.draw.type, normalizedDrawDates)
    if (drawDateIssues.length > 0) {
      return NextResponse.json(
        { error: 'Validacion de fechas fallida.', issues: drawDateIssues },
        { status: 400 }
      )
    }

    const primaryDrawDate = normalizedDrawDates[normalizedDrawDates.length - 1]
    const parsedPrimaryDate = parseDateOnly(primaryDrawDate)
    if (!parsedPrimaryDate) {
      return NextResponse.json({ error: 'drawDate no es valida.' }, { status: 400 })
    }

    const normalizedDateSet = new Set(normalizedDrawDates)

    const updated = await prisma.$transaction(async (tx: unknown) => {
      const db = tx as typeof prisma

      const draw = await db.draw.upsert({
        where: {
          type_drawDate: {
            type: ticket.draw.type,
            drawDate: parsedPrimaryDate
          }
        },
        update: {},
        create: {
          type: ticket.draw.type,
          drawDate: parsedPrimaryDate
        }
      })

      await db.ticket.update({
        where: { id: ticketId },
        data: {
          drawId: draw.id
        }
      })

      const existingChecks = await db.ticketCheck.findMany({
        where: { ticketId },
        select: { drawDate: true }
      })
      const existingDateSet = new Set(
        existingChecks.map((check) => toDateKey(check.drawDate))
      )

      await db.ticketCheck.deleteMany({
        where: {
          ticketId,
          drawDate: {
            notIn: normalizedDrawDates
              .map((date) => parseDateOnly(date))
              .filter((date): date is Date => Boolean(date))
          }
        }
      })

      const missingDates = normalizedDrawDates.filter((date) => !existingDateSet.has(date))
      if (missingDates.length > 0) {
        await db.ticketCheck.createMany({
          data: missingDates
            .map((date) => parseDateOnly(date))
            .filter((date): date is Date => Boolean(date))
            .map((date) => ({
              ticketId,
              drawDate: date,
              status: 'PENDIENTE' as const,
              reason: 'Pendiente de comprobacion.',
              winningNumbers: [],
              winningStars: [],
              matchesMain: 0,
              matchesStars: 0,
              checkedAt: new Date()
            })),
          skipDuplicates: true
        })
      }

      const checks = await db.ticketCheck.findMany({
        where: { ticketId },
        orderBy: { drawDate: 'desc' }
      })
      const ticketData = await db.ticket.findUnique({
        where: { id: ticketId },
        include: {
          group: true,
          draw: true,
          lines: {
            include: { numbers: true }
          },
          receipt: true,
          checks: {
            orderBy: { drawDate: 'desc' }
          }
        }
      })

      return {
        checksCount: checks.length,
        normalizedDrawDates: Array.from(normalizedDateSet).sort((a, b) => a.localeCompare(b)),
        ticket: ticketData
      }
    })

    return NextResponse.json({ data: updated.ticket })
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo actualizar el boleto.' },
      { status: 500 }
    )
  }
}

import { NextResponse } from 'next/server'

import { ApiAuthError, requireGroupAccess, requireSessionUser } from '@/lib/auth'
import { validateEuromillionsNumbers } from '@/lib/recurring-tickets'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const user = await requireSessionUser()
    const rows = await prisma.recurringTicket.findMany({
      where: { group: { members: { some: { userId: user.id } } } },
      orderBy: { createdAt: 'asc' },
      include: { group: { select: { id: true, name: true } } }
    })
    return NextResponse.json({ data: rows })
  } catch (error) {
    if (error instanceof ApiAuthError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'No se pudieron cargar las apuestas recurrentes.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser()
    const payload = await request.json() as { groupId?: string; startDate?: string; mainNumbers?: number[]; starNumbers?: number[] }
    const groupId = payload.groupId?.trim()
    if (!groupId || !payload.startDate || !Array.isArray(payload.mainNumbers) || !Array.isArray(payload.starNumbers)) {
      return NextResponse.json({ error: 'groupId, startDate, mainNumbers y starNumbers son obligatorios.' }, { status: 400 })
    }
    await requireGroupAccess(user.id, groupId, { ownerOnly: true })
    const startDate = new Date(`${payload.startDate}T00:00:00.000Z`)
    if (Number.isNaN(startDate.getTime())) return NextResponse.json({ error: 'startDate no es valida.' }, { status: 400 })
    const issues = validateEuromillionsNumbers({ mainNumbers: payload.mainNumbers, starNumbers: payload.starNumbers })
    if (issues.length > 0) return NextResponse.json({ error: 'Validacion fallida.', issues }, { status: 400 })
    const recurring = await prisma.recurringTicket.create({
      data: { groupId, startDate, mainNumbers: payload.mainNumbers, starNumbers: payload.starNumbers },
      include: { group: { select: { id: true, name: true } } }
    })
    return NextResponse.json({ data: recurring }, { status: 201 })
  } catch (error) {
    if (error instanceof ApiAuthError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'No se pudo crear la apuesta recurrente.' }, { status: 500 })
  }
}

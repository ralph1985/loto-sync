import { NextResponse } from 'next/server'

import { ApiAuthError, requireGroupAccess, requireSessionUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED_TYPES = ['OPENING', 'ADJUSTMENT', 'CONTRIBUTION', 'TICKET_EXPENSE', 'PRIZE'] as const
type MovementType = (typeof ALLOWED_TYPES)[number]

export async function GET(
  request: Request,
  context: { params: Promise<{ groupId: string }> }
) {
  try {
    const actor = await requireSessionUser()
    const { groupId } = await context.params
    await requireGroupAccess(actor.id, groupId)

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    if (type && !ALLOWED_TYPES.includes(type as MovementType)) {
      return NextResponse.json({ error: 'type no valido.' }, { status: 400 })
    }

    const where = {
      groupId,
      ...(type ? { type: type as MovementType } : {})
    }

    const ascending = await prisma.groupMovement.findMany({
      where,
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }]
    })

    let runningBalance = 0
    const withBalance = ascending.map((movement: (typeof ascending)[number]) => {
      runningBalance += movement.amountCents
      return {
        ...movement,
        runningBalanceCents: runningBalance
      }
    })

    const data = withBalance.reverse()
    return NextResponse.json({ data })
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'No se pudo cargar historial.' }, { status: 500 })
  }
}

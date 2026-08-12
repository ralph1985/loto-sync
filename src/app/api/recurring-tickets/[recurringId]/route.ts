import { NextResponse } from 'next/server'

import { ApiAuthError, requireGroupAccess, requireSessionUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(request: Request, context: { params: Promise<{ recurringId: string }> }) {
  try {
    const user = await requireSessionUser()
    const { recurringId } = await context.params
    const recurring = await prisma.recurringTicket.findUnique({ where: { id: recurringId } })
    if (!recurring) return NextResponse.json({ error: 'Apuesta recurrente no encontrada.' }, { status: 404 })
    await requireGroupAccess(user.id, recurring.groupId, { ownerOnly: true })
    const payload = await request.json() as { active?: boolean }
    if (typeof payload.active !== 'boolean') return NextResponse.json({ error: 'active debe ser booleano.' }, { status: 400 })
    const updated = await prisma.recurringTicket.update({ where: { id: recurringId }, data: { active: payload.active } })
    return NextResponse.json({ data: updated })
  } catch (error) {
    if (error instanceof ApiAuthError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'No se pudo actualizar la apuesta recurrente.' }, { status: 500 })
  }
}

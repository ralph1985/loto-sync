import { NextResponse } from 'next/server'

import { ApiAuthError, requireGroupAccess, requireSessionUser } from '@/lib/auth'
import { isBalanceTracked } from '@/lib/group-balance'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request, context: { params: Promise<{ ticketId: string }> }) {
  try {
    const user = await requireSessionUser()
    const { ticketId } = await context.params
    const payload = await request.json() as { elMillionCode?: string; elMillionCodes?: string[]; priceCents?: number }
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, include: { draw: true, group: true, lines: true } })
    if (!ticket) return NextResponse.json({ error: 'Boleto no encontrado.' }, { status: 404 })
    await requireGroupAccess(user.id, ticket.groupId, { ownerOnly: true })
    if (ticket.draw.type !== 'EUROMILLONES') {
      return NextResponse.json({ error: 'El codigo de El Millon solo aplica a Euromillones.' }, { status: 400 })
    }
    const codes = Array.isArray(payload.elMillionCodes)
      ? payload.elMillionCodes.map((value) => value.trim().toUpperCase())
      : payload.elMillionCode ? [payload.elMillionCode.trim().toUpperCase()] : []
    if (codes.length !== ticket.lines.length || codes.some((code) => !/^[A-Z]{3}\d{5}$/.test(code))) {
      return NextResponse.json({ error: `Debes indicar un código válido de El Millón para cada una de las ${ticket.lines.length} líneas.` }, { status: 400 })
    }
    if (payload.priceCents !== undefined && (!Number.isInteger(payload.priceCents) || payload.priceCents < 0)) {
      return NextResponse.json({ error: 'priceCents no es valido.' }, { status: 400 })
    }
    const updated = await prisma.$transaction(async (tx) => {
      const confirmed = await tx.ticket.update({
        where: { id: ticketId },
        data: {
          purchaseStatus: 'CONFIRMED',
          elMillionCode: codes[0] ?? null,
          lines: {
            update: ticket.lines.map((line, index) => ({
              where: { id: line.id },
              data: { elMillionCode: codes[index] }
            }))
          },
          priceCents: payload.priceCents ?? ticket.priceCents
        },
        include: { draw: true, group: true, lines: { include: { numbers: true } }, checks: true }
      })
      const priceCents = payload.priceCents ?? ticket.priceCents ?? 0
      if (priceCents > 0 && isBalanceTracked(ticket.group)) {
        const movement = await tx.groupMovement.findFirst({ where: { relatedTicketId: ticketId, type: 'TICKET_EXPENSE' } })
        if (!movement) {
          await tx.groupMovement.create({
            data: {
              groupId: ticket.groupId,
              type: 'TICKET_EXPENSE',
              amountCents: -priceCents,
              note: `Boleto recurrente ${ticket.draw.type} ${ticket.draw.drawDate.toISOString().slice(0, 10)}`,
              relatedTicketId: ticketId
            }
          })
        }
      }
      return confirmed
    })
    return NextResponse.json({ data: updated })
  } catch (error) {
    if (error instanceof ApiAuthError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo confirmar el boleto.' }, { status: 500 })
  }
}

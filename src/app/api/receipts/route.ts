import { NextResponse } from 'next/server'

import { ApiAuthError, requireGroupAccess, requireSessionUser } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { storage } from '@/lib/storage'

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser()
    const formData = await request.formData()
    const ticketId = formData.get('ticketId')
    const file = formData.get('file')

    if (typeof ticketId !== 'string' || !ticketId) {
      return NextResponse.json(
        { error: 'ticketId es obligatorio.' },
        { status: 400 }
      )
    }

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'file es obligatorio.' },
        { status: 400 }
      )
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'El archivo debe ser una imagen.' },
        { status: 400 }
      )
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { receipt: true }
    })

    if (!ticket) {
      return NextResponse.json({ error: 'ticketId no existe.' }, { status: 404 })
    }
    await requireGroupAccess(user.id, ticket.groupId)

    if (ticket.receipt) {
      return NextResponse.json(
        { error: 'El ticket ya tiene resguardo.' },
        { status: 409 }
      )
    }

    const stored = await storage.save(file, { prefix: 'receipts' })

    const receipt = await prisma.receipt.create({
      data: {
        ticketId,
        blobUrl: stored.url,
        blobPath: stored.path,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes
      }
    })

    await writeAuditLog({
      actorId: user.id,
      entityType: 'RECEIPT',
      entityId: receipt.id,
      action: 'CREATE',
      payload: {
        ticketId
      }
    })

    return NextResponse.json({ data: receipt }, { status: 201 })
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'No se pudo guardar el resguardo.' }, { status: 500 })
  }
}

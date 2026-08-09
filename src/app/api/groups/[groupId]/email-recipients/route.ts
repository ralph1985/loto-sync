import { NextResponse } from 'next/server'

import { ApiAuthError, requireGroupAccess, requireSessionUser } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { prisma } from '@/lib/prisma'

type RecipientPayload = {
  email?: string
  label?: string | null
  enabled?: boolean
  recipientId?: string
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function GET(
  _request: Request,
  context: { params: Promise<{ groupId: string }> }
) {
  try {
    const user = await requireSessionUser()
    const { groupId } = await context.params
    await requireGroupAccess(user.id, groupId)

    const recipients = await prisma.groupEmailRecipient.findMany({
      where: { groupId },
      orderBy: [{ enabled: 'desc' }, { email: 'asc' }]
    })
    return NextResponse.json({ data: recipients })
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Error al cargar destinatarios.' }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ groupId: string }> }
) {
  try {
    const actor = await requireSessionUser()
    const { groupId } = await context.params
    await requireGroupAccess(actor.id, groupId, { ownerOnly: true })
    const payload = (await request.json()) as RecipientPayload
    const email = payload.email?.trim().toLowerCase()
    if (!email || !emailPattern.test(email)) {
      return NextResponse.json({ error: 'email no es valido.' }, { status: 400 })
    }
    if (payload.enabled !== undefined && typeof payload.enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled debe ser booleano.' }, { status: 400 })
    }

    const recipient = await prisma.groupEmailRecipient.upsert({
      where: { groupId_email: { groupId, email } },
      update: {
        label: payload.label?.trim() || null,
        enabled: payload.enabled ?? true
      },
      create: {
        groupId,
        email,
        label: payload.label?.trim() || null,
        enabled: payload.enabled ?? true
      }
    })
    await writeAuditLog({
      actorId: actor.id,
      entityType: 'GROUP_EMAIL_RECIPIENT',
      entityId: recipient.id,
      action: 'UPSERT',
      payload: { groupId, email, enabled: recipient.enabled }
    })
    return NextResponse.json({ data: recipient }, { status: 201 })
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Error al guardar destinatario.' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ groupId: string }> }
) {
  try {
    const actor = await requireSessionUser()
    const { groupId } = await context.params
    await requireGroupAccess(actor.id, groupId, { ownerOnly: true })
    const payload = (await request.json()) as RecipientPayload
    const recipientId = payload.recipientId?.trim()
    if (!recipientId) {
      return NextResponse.json({ error: 'recipientId es obligatorio.' }, { status: 400 })
    }
    const recipient = await prisma.groupEmailRecipient.findFirst({ where: { id: recipientId, groupId } })
    if (!recipient) return NextResponse.json({ error: 'Destinatario no encontrado.' }, { status: 404 })
    await prisma.groupEmailRecipient.delete({ where: { id: recipient.id } })
    await writeAuditLog({
      actorId: actor.id,
      entityType: 'GROUP_EMAIL_RECIPIENT',
      entityId: recipient.id,
      action: 'DELETE',
      payload: { groupId, email: recipient.email }
    })
    return NextResponse.json({ data: { id: recipient.id } })
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Error al eliminar destinatario.' }, { status: 500 })
  }
}

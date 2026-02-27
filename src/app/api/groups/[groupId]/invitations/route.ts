import { NextResponse } from 'next/server'

import { ApiAuthError, requireGroupAccess, requireSessionUser } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { prisma } from '@/lib/prisma'

type InvitationPayload = {
  inviteeId?: string
  role?: 'OWNER' | 'MEMBER'
  note?: string
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ groupId: string }> }
) {
  try {
    const actor = await requireSessionUser()
    const { groupId } = await context.params
    await requireGroupAccess(actor.id, groupId)

    const invitations = await prisma.groupInvitation.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        role: true,
        status: true,
        note: true,
        createdAt: true,
        inviter: {
          select: { id: true, name: true }
        },
        invitee: {
          select: { id: true, name: true }
        }
      }
    })

    return NextResponse.json({ data: invitations })
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Error al cargar invitaciones.' }, { status: 500 })
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

    const payload = (await request.json()) as InvitationPayload
    const inviteeId = payload.inviteeId?.trim()
    const role = payload.role ?? 'MEMBER'
    if (!inviteeId) {
      return NextResponse.json({ error: 'inviteeId es obligatorio.' }, { status: 400 })
    }
    if (role !== 'OWNER' && role !== 'MEMBER') {
      return NextResponse.json({ error: 'role no valido.' }, { status: 400 })
    }

    const invitee = await prisma.user.findUnique({
      where: { id: inviteeId },
      select: { id: true }
    })
    if (!invitee) {
      return NextResponse.json({ error: 'Usuario invitado no encontrado.' }, { status: 404 })
    }

    const invitation = await prisma.groupInvitation.create({
      data: {
        groupId,
        inviterId: actor.id,
        inviteeId,
        role,
        note: payload.note?.trim() || null
      },
      select: {
        id: true,
        role: true,
        status: true,
        note: true,
        createdAt: true,
        invitee: {
          select: { id: true, name: true }
        }
      }
    })

    await writeAuditLog({
      actorId: actor.id,
      entityType: 'GROUP_INVITATION',
      entityId: invitation.id,
      action: 'CREATE',
      payload: { groupId, inviteeId, role }
    })

    return NextResponse.json({ data: invitation }, { status: 201 })
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Error al crear invitacion.' }, { status: 500 })
  }
}

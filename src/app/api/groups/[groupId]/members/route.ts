import { NextResponse } from 'next/server'

import { ApiAuthError, requireGroupAccess, requireSessionUser } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { prisma } from '@/lib/prisma'

type MemberPayload = {
  userId?: string
  role?: 'OWNER' | 'MEMBER'
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ groupId: string }> }
) {
  try {
    const user = await requireSessionUser()
    const { groupId } = await context.params
    await requireGroupAccess(user.id, groupId)

    const members = await prisma.groupMember.findMany({
      where: { groupId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            name: true
          }
        }
      }
    })

    return NextResponse.json({ data: members })
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Error al cargar miembros.' }, { status: 500 })
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

    const payload = (await request.json()) as MemberPayload
    const userId = payload.userId?.trim()
    const role = payload.role ?? 'MEMBER'
    if (!userId) {
      return NextResponse.json({ error: 'userId es obligatorio.' }, { status: 400 })
    }
    if (role !== 'OWNER' && role !== 'MEMBER') {
      return NextResponse.json({ error: 'role no valido.' }, { status: 400 })
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true }
    })
    if (!targetUser) {
      return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 })
    }

    const member = await prisma.groupMember.upsert({
      where: {
        groupId_userId: {
          groupId,
          userId
        }
      },
      update: {
        role
      },
      create: {
        groupId,
        userId,
        role
      },
      select: {
        id: true,
        role: true,
        user: {
          select: {
            id: true,
            name: true
          }
        }
      }
    })

    await writeAuditLog({
      actorId: actor.id,
      entityType: 'GROUP_MEMBER',
      entityId: member.id,
      action: 'UPSERT',
      payload: { groupId, userId, role }
    })

    return NextResponse.json({ data: member }, { status: 201 })
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Error al guardar miembro.' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'

import { requireSessionUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type UserPayload = {
  name?: string
}

export async function GET() {
  await requireSessionUser()

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      createdAt: true
    }
  })

  return NextResponse.json({ data: users })
}

export async function POST(request: Request) {
  const actor = await requireSessionUser()

  const payload = (await request.json()) as UserPayload
  const name = payload.name?.trim()
  if (!name) {
    return NextResponse.json({ error: 'name es obligatorio.' }, { status: 400 })
  }

  const existing = await prisma.user.findUnique({
    where: { name },
    select: { id: true }
  })
  if (existing) {
    return NextResponse.json({ error: 'El usuario ya existe.' }, { status: 409 })
  }

  const created = await prisma.$transaction(async (tx) => {
    const nextUser = await tx.user.create({
      data: { name },
      select: {
        id: true,
        name: true,
        createdAt: true
      }
    })

    const actorMemberships = await tx.groupMember.findMany({
      where: { userId: actor.id },
      select: { groupId: true, role: true }
    })

    if (actorMemberships.length > 0) {
      await tx.groupMember.createMany({
        data: actorMemberships.map((membership: (typeof actorMemberships)[number]) => ({
          groupId: membership.groupId,
          userId: nextUser.id,
          role: membership.role === 'OWNER' ? 'MEMBER' : membership.role
        })),
        skipDuplicates: true
      })
    }

    return nextUser
  })

  return NextResponse.json({ data: created }, { status: 201 })
}

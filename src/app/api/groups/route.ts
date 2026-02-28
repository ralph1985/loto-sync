import { NextResponse } from 'next/server'

import { ApiAuthError, requireSessionUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const user = await requireSessionUser()

    const memberships = await prisma.groupMember.findMany({
      where: { userId: user.id },
      select: {
        groupId: true,
        role: true
      }
    })

    const groupIds = memberships.map((item: (typeof memberships)[number]) => item.groupId)
    if (groupIds.length === 0) {
      return NextResponse.json({ data: [] })
    }

    const [groups, balances] = await Promise.all([
      prisma.group.findMany({
        where: {
          id: {
            in: groupIds
          }
        },
        orderBy: { createdAt: 'asc' }
      }),
      prisma.groupMovement.groupBy({
        by: ['groupId'],
        where: {
          groupId: {
            in: groupIds
          }
        },
        _sum: {
          amountCents: true
        }
      })
    ])

    const roleByGroup = new Map(
      memberships.map((item: (typeof memberships)[number]) => [item.groupId, item.role])
    )
    const balanceByGroup = new Map(
      balances.map((item: (typeof balances)[number]) => [item.groupId, item._sum.amountCents ?? 0])
    )

    const groupsWithBalance = groups.map((group: (typeof groups)[number]) => ({
      ...group,
      role: roleByGroup.get(group.id) ?? 'MEMBER',
      balanceCents: balanceByGroup.get(group.id) ?? 0
    }))

    return NextResponse.json({ data: groupsWithBalance })
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'No se pudieron cargar los grupos.' }, { status: 500 })
  }
}

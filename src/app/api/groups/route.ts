import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'

export async function GET() {
  const [groups, balances] = await Promise.all([
    prisma.group.findMany({
      orderBy: { createdAt: 'asc' }
    }),
    prisma.groupMovement.groupBy({
      by: ['groupId'],
      _sum: {
        amountCents: true
      }
    })
  ])

  const balanceByGroup = new Map(
    balances.map((item) => [item.groupId, item._sum.amountCents ?? 0])
  )

  const groupsWithBalance = groups.map((group) => ({
    ...group,
    balanceCents: balanceByGroup.get(group.id) ?? 0
  }))

  return NextResponse.json({ data: groupsWithBalance })
}

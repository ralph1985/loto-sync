import { NextResponse } from 'next/server'

import { requireSessionUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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

export async function POST() {
  await requireSessionUser()
  return NextResponse.json(
    { error: 'La creacion de usuarios desde el frontal esta desactivada.' },
    { status: 403 }
  )
}

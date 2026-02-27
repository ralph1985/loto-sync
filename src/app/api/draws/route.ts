import { NextResponse } from 'next/server'

import { ApiAuthError, requireSessionUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    await requireSessionUser()
    const draws = await prisma.draw.findMany({
      orderBy: [{ drawDate: 'asc' }]
    })

    return NextResponse.json({ data: draws })
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'No se pudieron cargar sorteos.' }, { status: 500 })
  }
}

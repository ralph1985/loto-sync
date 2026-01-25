import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'

export async function GET() {
  const draws = await prisma.draw.findMany({
    orderBy: [{ drawDate: 'asc' }]
  })

  return NextResponse.json({ data: draws })
}

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

import { getSessionCookieName } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const SESSION_COOKIE = getSessionCookieName()

const serializeUser = async (userId: string) => {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      memberships: {
        select: {
          groupId: true,
          role: true,
          group: {
            select: {
              id: true,
              name: true
            }
          }
        }
      }
    }
  })
}

export async function GET() {
  const store = await cookies()
  const cookieUserId = store.get(SESSION_COOKIE)?.value ?? null

  if (!cookieUserId) {
    return NextResponse.json({ error: 'Sesion no iniciada.' }, { status: 401 })
  }

  const user = await serializeUser(cookieUserId)
  if (!user) {
    return NextResponse.json({ error: 'Sesion no valida.' }, { status: 401 })
  }

  return NextResponse.json({ data: user })
}

export async function DELETE() {
  const response = NextResponse.json({ data: { loggedOut: true } })
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0
  })
  return response
}

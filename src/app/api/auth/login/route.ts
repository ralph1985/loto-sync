import { createHash } from 'node:crypto'

import { NextResponse } from 'next/server'

import { getSessionCookieName } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type LoginPayload = {
  name?: string
  password?: string
}

const SESSION_COOKIE = getSessionCookieName()

const md5 = (value: string) => createHash('md5').update(value).digest('hex')

export async function POST(request: Request) {
  const payload = (await request.json()) as LoginPayload
  const name = payload.name?.trim()
  const password = payload.password ?? ''

  if (!name || !password) {
    return NextResponse.json(
      { error: 'Usuario y contraseña son obligatorios.' },
      { status: 400 }
    )
  }

  const user = await prisma.user.findUnique({
    where: { name },
    select: {
      id: true,
      name: true,
      passwordHash: true
    }
  })

  if (!user || user.passwordHash !== md5(password)) {
    return NextResponse.json({ error: 'Credenciales incorrectas.' }, { status: 401 })
  }

  const response = NextResponse.json({
    data: {
      id: user.id,
      name: user.name
    }
  })
  response.cookies.set(SESSION_COOKIE, user.id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365
  })

  return response
}

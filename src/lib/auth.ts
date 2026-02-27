import { cookies } from 'next/headers'

import { prisma } from '@/lib/prisma'

const SESSION_COOKIE = 'loto_user'

export class ApiAuthError extends Error {
  status: number

  constructor(message: string, status = 401) {
    super(message)
    this.status = status
  }
}

export const getSessionCookieName = () => SESSION_COOKIE

export const getSessionUserId = async () => {
  const store = await cookies()
  return store.get(SESSION_COOKIE)?.value ?? null
}

export const requireSessionUser = async () => {
  const userId = await getSessionUserId()
  if (!userId) {
    throw new ApiAuthError('Sesion no iniciada.', 401)
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true }
  })

  if (!user) {
    throw new ApiAuthError('Usuario de sesion no valido.', 401)
  }

  return user
}

export const requireGroupAccess = async (
  userId: string,
  groupId: string,
  options?: {
    ownerOnly?: boolean
  }
) => {
  const membership = await prisma.groupMember.findUnique({
    where: {
      groupId_userId: {
        groupId,
        userId
      }
    },
    select: {
      role: true
    }
  })

  if (!membership) {
    throw new ApiAuthError('No tienes acceso al grupo.', 403)
  }
  if (options?.ownerOnly && membership.role !== 'OWNER') {
    throw new ApiAuthError('Solo el owner puede realizar esta accion.', 403)
  }

  return membership
}

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const SESSION_COOKIE = 'loto_user'

const isPublicPath = (pathname: string) => {
  if (pathname === '/login') return true
  if (pathname.startsWith('/_next')) return true
  if (pathname.startsWith('/api/auth/login')) return true
  if (pathname.startsWith('/api/auth/session')) return true
  if (pathname.startsWith('/api/admin/db-sync')) return true
  if (pathname === '/favicon.ico') return true
  return false
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  const session = request.cookies.get(SESSION_COOKIE)?.value
  if (session) {
    return NextResponse.next()
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Sesion no iniciada.' }, { status: 401 })
  }

  const loginUrl = new URL('/login', request.url)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: '/:path*'
}

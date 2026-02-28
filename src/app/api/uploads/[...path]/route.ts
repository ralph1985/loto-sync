import { existsSync, promises as fs } from 'node:fs'
import path from 'node:path'
import { NextRequest, NextResponse } from 'next/server'

const getProjectRoot = () => {
  const cwd = process.cwd()
  if (path.basename(cwd) === 'loto-sync') {
    return cwd
  }

  const candidate = path.join(cwd, 'projects', 'loto-sync')
  if (existsSync(path.join(candidate, 'package.json'))) {
    return candidate
  }

  return cwd
}

const uploadsRoot = path.join(getProjectRoot(), 'uploads')

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path: pathParts } = await context.params
  const filePath = pathParts?.join('/')
  if (!filePath) {
    return NextResponse.json({ error: 'Archivo no encontrado.' }, { status: 404 })
  }

  const resolved = path.normalize(path.join(uploadsRoot, filePath))
  if (!resolved.startsWith(uploadsRoot)) {
    return NextResponse.json({ error: 'Ruta no valida.' }, { status: 400 })
  }

  try {
    const buffer = await fs.readFile(resolved)
    const ext = path.extname(resolved)
    const mime =
      ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : ext === '.png'
          ? 'image/png'
          : ext === '.webp'
            ? 'image/webp'
            : 'application/octet-stream'

    return new Response(buffer, {
      headers: {
        'Content-Type': mime
      }
    })
  } catch {
    return NextResponse.json({ error: 'Archivo no encontrado.' }, { status: 404 })
  }
}

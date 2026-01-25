import { promises as fs } from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'

const uploadsRoot = path.join(process.cwd(), 'uploads')

export async function GET(
  _request: Request,
  context: { params: { path?: string[] } }
) {
  const filePath = context.params.path?.join('/')
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

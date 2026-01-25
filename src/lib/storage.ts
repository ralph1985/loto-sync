import { promises as fs } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export type StoredFile = {
  url: string
  path: string
  mimeType: string
  sizeBytes: number
}

export type StorageSaveOptions = {
  prefix?: string
}

export interface StorageAdapter {
  save(file: File, options?: StorageSaveOptions): Promise<StoredFile>
}

const ensureDir = async (dir: string) => {
  await fs.mkdir(dir, { recursive: true })
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')

const getUploadsRoot = () => path.join(process.cwd(), 'uploads')

const buildFilename = (originalName: string) => {
  const ext = path.extname(originalName)
  const base = slugify(path.basename(originalName, ext)) || 'file'
  const hash = crypto.randomBytes(6).toString('hex')
  const stamp = Date.now().toString(36)

  return `${base}-${stamp}-${hash}${ext}`
}

const normalizePath = (value: string) => value.replace(/\\/g, '/')

class LocalStorageAdapter implements StorageAdapter {
  async save(file: File, options: StorageSaveOptions = {}): Promise<StoredFile> {
    const prefix = options.prefix ? slugify(options.prefix) : ''
    const uploadsRoot = getUploadsRoot()
    const targetDir = prefix ? path.join(uploadsRoot, prefix) : uploadsRoot

    await ensureDir(targetDir)

    const filename = buildFilename(file.name)
    const targetPath = path.join(targetDir, filename)
    const buffer = Buffer.from(await file.arrayBuffer())

    await fs.writeFile(targetPath, buffer)

    const relativePath = normalizePath(path.relative(uploadsRoot, targetPath))

    return {
      url: `/api/uploads/${relativePath}`,
      path: relativePath,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: buffer.length
    }
  }
}

export const storage = new LocalStorageAdapter()

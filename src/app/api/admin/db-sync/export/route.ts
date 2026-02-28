import { NextResponse } from 'next/server'

import {
  buildSyncSummary,
  exportSyncDataset,
  requireSyncToken
} from '@/lib/db-sync'

export async function GET(request: Request) {
  const auth = requireSyncToken(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: 401 })
  }

  try {
    const dataset = await exportSyncDataset()
    return NextResponse.json({
      data: {
        dataset,
        summary: buildSyncSummary(dataset)
      }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo exportar la base de datos.'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}

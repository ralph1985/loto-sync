import { NextResponse } from 'next/server'

import {
  buildSyncSummary,
  exportSyncDataset,
  isSyncDataset,
  replaceSyncDataset,
  requireSyncToken,
  shouldBlockOverwrite
} from '@/lib/db-sync'

type ImportPayload = {
  dataset?: unknown
  force?: boolean
  dryRun?: boolean
}

export async function POST(request: Request) {
  const auth = requireSyncToken(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: 401 })
  }

  try {
    const payload = (await request.json()) as ImportPayload
    if (!isSyncDataset(payload.dataset)) {
      return NextResponse.json(
        { error: 'Payload invalido: dataset requerido.' },
        { status: 400 }
      )
    }

    const incoming = payload.dataset
    const incomingSummary = buildSyncSummary(incoming)
    const current = await exportSyncDataset()
    const currentSummary = buildSyncSummary(current)

    const blocked = shouldBlockOverwrite(incomingSummary, currentSummary)
    if (blocked && !payload.force) {
      return NextResponse.json(
        {
          error:
            'Destino con mas datos o mas reciente. Reintenta con force=true para sobrescribir.',
          sourceSummary: incomingSummary,
          targetSummary: currentSummary
        },
        { status: 409 }
      )
    }

    if (payload.dryRun) {
      return NextResponse.json({
        data: {
          applied: false,
          sourceSummary: incomingSummary,
          targetSummary: currentSummary
        }
      })
    }

    await replaceSyncDataset(incoming)
    return NextResponse.json({
      data: {
        applied: true,
        sourceSummary: incomingSummary
      }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo importar la base de datos.'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}

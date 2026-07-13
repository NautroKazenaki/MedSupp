import { authorizeMigrateSecret, migrateFlatMedicinesToHousehold, parseBody } from '../_lib.js'

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Метод не поддерживается' })
  if (!process.env.MIGRATE_SECRET?.trim()) {
    return res.status(503).json({ error: 'MIGRATE_SECRET не задан в Environment Variables' })
  }
  if (!authorizeMigrateSecret(req.headers.authorization)) {
    return res.status(401).json({ error: 'Неверный секрет миграции' })
  }

  try {
    const body = (parseBody(req) ?? {}) as {
      household?: unknown
      deleteOld?: unknown
      dryRun?: unknown
    }
    const result = await migrateFlatMedicinesToHousehold({
      household: typeof body.household === 'string' ? body.household : 'family',
      deleteOld: Boolean(body.deleteOld),
      dryRun: Boolean(body.dryRun)
    })
    return res.status(200).json(result)
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Не удалось выполнить миграцию'
    return res.status(500).json({ error: message })
  }
}

const deleteOld = process.argv.includes('--delete-old')
const dryRun = process.argv.includes('--dry-run')
const household = (process.env.MIGRATE_HOUSEHOLD || 'family').trim()
const baseUrl = process.env.MIGRATE_URL?.replace(/\/$/, '')
const secret = process.env.MIGRATE_SECRET?.trim()

if (!baseUrl || !secret) {
  console.error('Добавьте MIGRATE_URL и MIGRATE_SECRET в .env.local. См. README.')
  process.exit(1)
}

const response = await fetch(`${baseUrl}/api/admin/migrate-household`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${secret}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ household, dryRun, deleteOld })
})

const result = await response.json().catch(() => null)
if (!response.ok) {
  console.error(result?.error ?? `Миграция завершилась HTTP ${response.status}`)
  process.exit(1)
}

console.log(JSON.stringify(result, null, 2))

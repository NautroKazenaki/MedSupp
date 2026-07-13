import { del, head, list, put } from '@vercel/blob'
import { createHmac, timingSafeEqual } from 'node:crypto'

export type Medicine = {
  id: string
  name: string
  purpose: string
  expiryDate: string
  quantity: number | null
  quantityTracking: boolean
  createdAt: string
  updatedAt: string
}

export type Session = {
  username: string
  household: string
}

type UserRecord = Session & {
  password: string
}

const cookieName = 'medsupp_session'
const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000
const maxUsers = 20

function secret() {
  const value = process.env.SESSION_SECRET
  if (!value) throw new Error('SESSION_SECRET is not configured')
  return value
}

function sign(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

function normalizeHousehold(value: string) {
  const household = value.trim().toLowerCase()
  return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(household) ? household : null
}

function configuredUsers(): UserRecord[] {
  const users: UserRecord[] = []
  for (let index = 1; index <= maxUsers; index += 1) {
    const username = process.env[`USER_${index}_NAME`]?.trim()
    const password = process.env[`USER_${index}_PASSWORD_HASH`]?.trim()
    const householdRaw = process.env[`USER_${index}_HOUSEHOLD`]?.trim()
    if (!username && !password && !householdRaw) continue
    if (!username || !password || !householdRaw) continue
    const household = normalizeHousehold(householdRaw)
    if (!household) continue
    users.push({ username, password, household })
  }
  return users
}

function medicinePath(household: string, id: string) {
  return `medicines/${household}/${id}.json`
}

async function listAllBlobs(prefix: string) {
  const blobs: Awaited<ReturnType<typeof list>>['blobs'] = []
  let cursor: string | undefined
  do {
    const page = await list({ prefix, cursor })
    blobs.push(...page.blobs)
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)
  return blobs
}

function issueToken({ username, household }: Session) {
  const payload = Buffer.from(JSON.stringify({ username, household, exp: Date.now() + thirtyDaysMs })).toString('base64url')
  return `${payload}.${sign(payload)}`
}

function verifyToken(token: string): Session | null {
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return null
  const expected = sign(payload)
  const provided = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (provided.length !== expectedBuffer.length || !timingSafeEqual(provided, expectedBuffer)) return null
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  if (
    typeof data.username !== 'string' ||
    typeof data.household !== 'string' ||
    typeof data.exp !== 'number' ||
    data.exp < Date.now()
  ) {
    return null
  }
  const household = normalizeHousehold(data.household)
  if (!household) return null
  return { username: data.username, household }
}

function cookies(header = '') {
  return Object.fromEntries(header.split(';').filter(Boolean).map((part) => {
    const [key, ...value] = part.trim().split('=')
    return [key, decodeURIComponent(value.join('='))]
  }))
}

export async function session(req: any): Promise<Session | null> {
  try {
    const token = cookies(req.headers.cookie)[cookieName]
    if (!token) return null
    return verifyToken(token)
  } catch {
    return null
  }
}

export async function authenticate(username: string, password: string): Promise<Session | null> {
  const user = configuredUsers().find(
    (candidate) => candidate.username.toLocaleLowerCase('ru') === username.trim().toLocaleLowerCase('ru')
  )
  return user && user.password === password ? { username: user.username, household: user.household } : null
}

export async function setSession(res: any, user: Session) {
  const token = issueToken(user)
  res.setHeader('Set-Cookie', `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${process.env.VERCEL ? '; Secure' : ''}`)
}

export function clearSession(res: any) {
  res.setHeader('Set-Cookie', `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.VERCEL ? '; Secure' : ''}`)
}

export function requireSession(req: any, res: any) {
  return session(req).then((value) => {
    if (!value) {
      res.status(401).json({ error: 'Войдите в аккаунт, чтобы продолжить' })
      return null
    }
    return value
  })
}

export function parseBody(req: any): unknown {
  return typeof req.body === 'string' ? JSON.parse(req.body) : req.body
}

export function medicineInput(value: any): Omit<Medicine, 'id' | 'createdAt' | 'updatedAt'> | null {
  if (!value || typeof value.name !== 'string' || !value.name.trim() || typeof value.expiryDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.expiryDate)) return null
  const quantityTracking = Boolean(value.quantityTracking)
  const quantity = quantityTracking && Number.isInteger(value.quantity) && value.quantity >= 0 ? value.quantity : null
  return { name: value.name.trim(), purpose: typeof value.purpose === 'string' ? value.purpose.trim() : '', expiryDate: value.expiryDate, quantity, quantityTracking }
}

export async function allMedicines(household: string): Promise<Medicine[]> {
  const blobs = await listAllBlobs(`medicines/${household}/`)
  const medicines = await Promise.all(blobs.map(async (blob) => {
    const response = await fetch(blob.url)
    return response.ok ? response.json() as Promise<Medicine> : null
  }))
  return medicines.filter((medicine): medicine is Medicine => medicine !== null)
}

export async function getMedicine(household: string, id: string): Promise<Medicine | null> {
  const pathname = medicinePath(household, id)
  const blobs = await listAllBlobs(pathname)
  const blob = blobs.find((entry) => entry.pathname === pathname)
  if (!blob) return null
  const response = await fetch(blob.url)
  return response.ok ? response.json() as Promise<Medicine> : null
}

export function saveMedicine(household: string, medicine: Medicine) {
  return put(medicinePath(household, medicine.id), JSON.stringify(medicine), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json'
  })
}

export async function removeMedicine(household: string, id: string) {
  const pathname = medicinePath(household, id)
  const blobs = await listAllBlobs(pathname)
  const blob = blobs.find((entry) => entry.pathname === pathname)
  if (blob) await del(blob.url)
}

export async function migrateFlatMedicinesToHousehold(options: {
  household?: string
  deleteOld?: boolean
  dryRun?: boolean
}) {
  const household = normalizeHousehold(options.household ?? 'family')
  if (!household) throw new Error('Некорректный household')

  const deleteOld = Boolean(options.deleteOld)
  const dryRun = Boolean(options.dryRun)
  const flatPattern = /^medicines\/[^/]+\.json$/
  const blobs = await listAllBlobs('medicines/')
  const flat = blobs.filter((blob) => flatPattern.test(blob.pathname))

  const copied: string[] = []
  const skipped: string[] = []
  const deleted: string[] = []

  for (const blob of flat) {
    const filename = blob.pathname.slice('medicines/'.length)
    const id = filename.endsWith('.json') ? filename.slice(0, -'.json'.length) : filename
    const target = medicinePath(household, id)

    if (dryRun) {
      copied.push(`${blob.pathname} → ${target}`)
      continue
    }

    if (deleteOld) {
      await head(target)
      continue
    }

    try {
      await head(target)
      skipped.push(`${blob.pathname} → ${target}`)
      continue
    } catch {
      // The target does not exist yet; create it without overwriting a newer copy.
    }

    const response = await fetch(blob.url)
    if (!response.ok) {
      throw new Error(`Не удалось прочитать ${blob.pathname}: HTTP ${response.status}`)
    }

    const body = await response.text()
    await put(target, body, {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: 'application/json'
    })
    await head(target)
    copied.push(`${blob.pathname} → ${target}`)
  }

  if (dryRun || !deleteOld) {
    return { household, found: flat.length, copied, skipped, deleted, dryRun, deleteOld }
  }

  for (const blob of flat) {
    await del(blob.url)
    deleted.push(blob.pathname)
  }

  return { household, found: flat.length, copied, skipped, deleted, dryRun, deleteOld }
}

export function authorizeMigrateSecret(headerValue: unknown) {
  const secret = process.env.MIGRATE_SECRET?.trim()
  if (!secret || typeof headerValue !== 'string' || !headerValue.startsWith('Bearer ')) return false
  const provided = headerValue.slice('Bearer '.length).trim()
  const expected = Buffer.from(secret)
  const actual = Buffer.from(provided)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

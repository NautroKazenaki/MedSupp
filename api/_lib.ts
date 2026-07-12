import { del, list, put } from '@vercel/blob'
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

const cookieName = 'medsupp_session'
const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000

function secret() {
  const value = process.env.SESSION_SECRET
  if (!value) throw new Error('SESSION_SECRET is not configured')
  return value
}

function sign(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

function issueToken(username: string) {
  const payload = Buffer.from(JSON.stringify({ username, exp: Date.now() + thirtyDaysMs })).toString('base64url')
  return `${payload}.${sign(payload)}`
}

function verifyToken(token: string): { username: string } | null {
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return null
  const expected = sign(payload)
  const provided = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (provided.length !== expectedBuffer.length || !timingSafeEqual(provided, expectedBuffer)) return null
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  if (typeof data.username !== 'string' || typeof data.exp !== 'number' || data.exp < Date.now()) return null
  return { username: data.username }
}

function cookies(header = '') {
  return Object.fromEntries(header.split(';').filter(Boolean).map((part) => {
    const [key, ...value] = part.trim().split('=')
    return [key, decodeURIComponent(value.join('='))]
  }))
}

export async function session(req: any): Promise<{ username: string } | null> {
  try {
    const token = cookies(req.headers.cookie)[cookieName]
    if (!token) return null
    return verifyToken(token)
  } catch {
    return null
  }
}

export async function authenticate(username: string, password: string) {
  const users = [
    { username: process.env.USER_1_NAME?.trim(), password: process.env.USER_1_PASSWORD_HASH?.trim() },
    { username: process.env.USER_2_NAME?.trim(), password: process.env.USER_2_PASSWORD_HASH?.trim() }
  ]
  const user = users.find((candidate) => candidate.username?.toLocaleLowerCase('ru') === username.trim().toLocaleLowerCase('ru'))
  return user?.username && user.password && user.password === password ? user.username : null
}

export async function setSession(res: any, username: string) {
  const token = issueToken(username)
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

export async function allMedicines(): Promise<Medicine[]> {
  const blobs = await list({ prefix: 'medicines/' })
  const medicines = await Promise.all(blobs.blobs.map(async (blob) => {
    const response = await fetch(blob.url)
    return response.ok ? response.json() as Promise<Medicine> : null
  }))
  return medicines.filter((medicine): medicine is Medicine => medicine !== null)
}

export async function getMedicine(id: string): Promise<Medicine | null> {
  const blobs = await list({ prefix: `medicines/${id}.json` })
  const blob = blobs.blobs.find((entry) => entry.pathname === `medicines/${id}.json`)
  if (!blob) return null
  const response = await fetch(blob.url)
  return response.ok ? response.json() as Promise<Medicine> : null
}

export function saveMedicine(medicine: Medicine) {
  return put(`medicines/${medicine.id}.json`, JSON.stringify(medicine), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json'
  })
}

export async function removeMedicine(id: string) {
  const blobs = await list({ prefix: `medicines/${id}.json` })
  const blob = blobs.blobs.find((entry) => entry.pathname === `medicines/${id}.json`)
  if (blob) await del(blob.url)
}

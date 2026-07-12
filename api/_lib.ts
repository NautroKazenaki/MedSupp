import { del, list, put } from '@vercel/blob'
import { SignJWT, jwtVerify } from 'jose'

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

const encoder = new TextEncoder()
const cookieName = 'medsupp_session'

function secret() {
  const value = process.env.SESSION_SECRET
  if (!value) throw new Error('SESSION_SECRET is not configured')
  return encoder.encode(value)
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
    const { payload } = await jwtVerify(token, secret())
    return typeof payload.username === 'string' ? { username: payload.username } : null
  } catch {
    return null
  }
}

export async function authenticate(username: string, password: string) {
  const users = [
    { username: process.env.USER_1_NAME, password: process.env.USER_1_PASSWORD },
    { username: process.env.USER_2_NAME, password: process.env.USER_2_PASSWORD }
  ]
  const user = users.find((candidate) => candidate.username?.toLocaleLowerCase('ru') === username.trim().toLocaleLowerCase('ru'))
  return user?.username && user.password === password ? user.username : null
}

export async function setSession(res: any, username: string) {
  const token = await new SignJWT({ username }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('30d').sign(secret())
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

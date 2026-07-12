import { clearSession } from '../_lib.js'

export default function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Метод не поддерживается' })
  clearSession(res)
  return res.status(204).end()
}

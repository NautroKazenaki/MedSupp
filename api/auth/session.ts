import { session } from '../_lib.js'

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Метод не поддерживается' })
  return res.status(200).json(await session(req))
}

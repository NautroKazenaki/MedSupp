import { authenticate, parseBody, setSession } from '../_lib'

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Метод не поддерживается' })
  try {
    const { username, password } = parseBody(req) as { username?: unknown; password?: unknown }
    if (typeof username !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Укажите логин и пароль' })
    const authenticated = await authenticate(username, password)
    if (!authenticated) return res.status(401).json({ error: 'Неверный логин или пароль' })
    await setSession(res, authenticated)
    return res.status(200).json({ username: authenticated })
  } catch {
    return res.status(500).json({ error: 'Не удалось выполнить вход' })
  }
}

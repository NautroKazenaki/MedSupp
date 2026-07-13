import { getMedicine, medicineInput, parseBody, removeMedicine, requireSession, saveMedicine } from '../_lib.js'

export default async function handler(req: any, res: any) {
  const sess = await requireSession(req, res)
  if (!sess) return
  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id
  if (typeof id !== 'string') return res.status(400).json({ error: 'Некорректный идентификатор' })
  try {
    const current = await getMedicine(sess.household, id)
    if (!current) return res.status(404).json({ error: 'Лекарство не найдено' })
    if (req.method === 'DELETE') {
      await removeMedicine(sess.household, id)
      return res.status(204).end()
    }
    if (req.method === 'PUT') {
      const body = parseBody(req) as { updatedAt?: unknown }
      const input = medicineInput(body)
      if (!input) return res.status(400).json({ error: 'Проверьте обязательные поля лекарства' })
      if (body.updatedAt !== current.updatedAt) return res.status(409).json({ error: 'Запись изменилась на другом устройстве. Обновите список и повторите попытку.' })
      const medicine = { ...current, ...input, updatedAt: new Date().toISOString() }
      await saveMedicine(sess.household, medicine)
      return res.status(200).json(medicine)
    }
    return res.status(405).json({ error: 'Метод не поддерживается' })
  } catch {
    return res.status(500).json({ error: 'Не удалось обработать лекарство' })
  }
}

import { allMedicines, medicineInput, parseBody, requireSession, saveMedicine } from '../_lib.js'

export default async function handler(req: any, res: any) {
  if (!await requireSession(req, res)) return
  try {
    if (req.method === 'GET') return res.status(200).json(await allMedicines())
    if (req.method === 'POST') {
      const input = medicineInput(parseBody(req))
      if (!input) return res.status(400).json({ error: 'Проверьте обязательные поля лекарства' })
      const now = new Date().toISOString()
      const medicine = { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now }
      await saveMedicine(medicine)
      return res.status(201).json(medicine)
    }
    return res.status(405).json({ error: 'Метод не поддерживается' })
  } catch {
    return res.status(500).json({ error: 'Не удалось обработать лекарства' })
  }
}

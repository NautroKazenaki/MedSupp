import type { Medicine, MedicineInput, Session } from '../types'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error ?? 'Не удалось выполнить запрос')
  }
  return response.status === 204 ? (undefined as T) : response.json()
}

export const api = {
  session: () => request<Session | null>('/api/auth/session'),
  login: (username: string, password: string) =>
    request<Session>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  medicines: () => request<Medicine[]>('/api/medicines'),
  createMedicine: (input: MedicineInput) =>
    request<Medicine>('/api/medicines', { method: 'POST', body: JSON.stringify(input) }),
  updateMedicine: (id: string, input: MedicineInput, updatedAt: string) =>
    request<Medicine>(`/api/medicines/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...input, updatedAt })
    }),
  deleteMedicine: (id: string) =>
    request<void>(`/api/medicines/${id}`, { method: 'DELETE' })
}

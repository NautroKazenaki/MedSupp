import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, LogOut, PackagePlus, Pencil, Pill, Trash2 } from 'lucide-react'
import { api } from './lib/api'
import type { Medicine, MedicineInput, Session } from './types'

const emptyMedicine: MedicineInput = {
  name: '',
  purpose: '',
  expiryDate: '',
  quantity: null,
  quantityTracking: true
}

function expiryState(value: string) {
  const diff = new Date(`${value}T00:00:00`).getTime() - new Date().setHours(0, 0, 0, 0)
  if (diff < 0) return ['expired', 'Просрочено']
  if (diff <= 30 * 86400000) return ['soon', 'Скоро истекает']
  return ['good', 'В порядке']
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(`${value}T00:00:00`)
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [medicines, setMedicines] = useState<Medicine[]>([])
  const [error, setError] = useState('')
  const [modal, setModal] = useState<Medicine | 'new' | null>(null)

  const load = async () => {
    try {
      setMedicines(await api.medicines())
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить аптечку')
    }
  }

  useEffect(() => {
    api.session().then(setSession).catch(() => setSession(null))
  }, [])

  useEffect(() => {
    if (session) void load()
  }, [session])

  const sorted = useMemo(
    () => [...medicines].sort((a, b) => a.expiryDate.localeCompare(b.expiryDate)),
    [medicines]
  )

  if (session === undefined) return <main className="auth-shell"><p className="muted">Открываем аптечку…</p></main>
  if (!session) return <Login onLogin={setSession} />

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-icon"><Pill size={20} /></span><span>Домашняя аптечка</span></div>
        <div className="header-actions">
          <span className="user-label">{session.username}</span>
          <button className="icon-button" onClick={() => api.logout().finally(() => setSession(null))} title="Выйти"><LogOut size={18} /></button>
        </div>
      </header>

      <section className="hero">
        <div><p className="eyebrow">ВАША АПТЕЧКА</p><h1>Забота — в порядке.</h1><p className="muted">Все лекарства и сроки годности в одном месте.</p></div>
        <button className="primary-button" onClick={() => setModal('new')}><PackagePlus size={18} /> Добавить</button>
      </section>

      {error && <div className="notice">{error} <button onClick={() => void load()}>Повторить</button></div>}
      {sorted.length === 0 ? (
        <section className="empty-card"><span className="empty-icon"><Pill size={28} /></span><h2>Аптечка пока пуста</h2><p>Добавьте первое лекарство, чтобы не потерять срок годности.</p><button className="primary-button" onClick={() => setModal('new')}>Добавить лекарство</button></section>
      ) : (
        <section className="medicine-grid">
          {sorted.map((medicine) => <MedicineCard key={medicine.id} medicine={medicine} onEdit={() => setModal(medicine)} onDelete={async () => {
            if (!confirm(`Удалить «${medicine.name}»?`)) return
            try { await api.deleteMedicine(medicine.id); await load() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось удалить запись') }
          }} />)}
        </section>
      )}
      {modal && <MedicineDialog medicine={modal === 'new' ? undefined : modal} onClose={() => setModal(null)} onSaved={async () => { setModal(null); await load() }} />}
    </main>
  )
}

function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    try { onLogin(await api.login(username, password)) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось войти') }
  }
  return <main className="auth-shell"><section className="auth-card"><span className="brand-icon"><Pill size={24} /></span><p className="eyebrow">ДОМАШНЯЯ АПТЕЧКА</p><h1>Рады видеть</h1><p className="muted">Войдите, чтобы открыть общую аптечку.</p><form onSubmit={submit}><label>Имя пользователя<input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required /></label><label>Пароль<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>{error && <p className="form-error">{error}</p>}<button className="primary-button full" type="submit">Войти</button></form></section></main>
}

function MedicineCard({ medicine, onEdit, onDelete }: { medicine: Medicine; onEdit: () => void; onDelete: () => void }) {
  const [state, label] = expiryState(medicine.expiryDate)
  return <article className="medicine-card"><div className="card-heading"><span className="medicine-mark"><Pill size={19} /></span><div className="card-actions"><button className="icon-button" onClick={onEdit} title="Изменить"><Pencil size={16} /></button><button className="icon-button danger" onClick={onDelete} title="Удалить"><Trash2 size={16} /></button></div></div><h2>{medicine.name}</h2><p className="purpose">{medicine.purpose || 'Не указано назначение'}</p><div className="card-footer"><div><span className="field-label"><CalendarDays size={14} /> Годен до</span><strong>{formatDate(medicine.expiryDate)}</strong><span className={`status ${state}`}>{label}</span></div><div className="quantity"><span className="field-label">Остаток</span><strong>{medicine.quantityTracking ? `${medicine.quantity ?? 0} шт.` : 'Рассыпное'}</strong></div></div></article>
}

function MedicineDialog({ medicine, onClose, onSaved }: { medicine?: Medicine; onClose: () => void; onSaved: () => Promise<void> }) {
  const [data, setData] = useState<MedicineInput>(medicine ? { name: medicine.name, purpose: medicine.purpose, expiryDate: medicine.expiryDate, quantity: medicine.quantity, quantityTracking: medicine.quantityTracking } : emptyMedicine)
  const [error, setError] = useState('')
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    try {
      if (medicine) await api.updateMedicine(medicine.id, data, medicine.updatedAt)
      else await api.createMedicine(data)
      await onSaved()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось сохранить запись') }
  }
  return <div className="dialog-backdrop" role="presentation"><form className="dialog" onSubmit={save}><div className="dialog-title"><div><p className="eyebrow">{medicine ? 'РЕДАКТИРОВАНИЕ' : 'НОВОЕ ЛЕКАРСТВО'}</p><h2>{medicine ? medicine.name : 'Добавить лекарство'}</h2></div><button className="icon-button" type="button" onClick={onClose}>×</button></div><label>Название<input value={data.name} onChange={(e) => setData({ ...data, name: e.target.value })} required autoFocus /></label><label>От чего помогает<textarea value={data.purpose} onChange={(e) => setData({ ...data, purpose: e.target.value })} rows={2} /></label><label>Срок годности<input type="date" value={data.expiryDate} onChange={(e) => setData({ ...data, expiryDate: e.target.value })} required /></label><label className="check-label"><input type="checkbox" checked={data.quantityTracking} onChange={(e) => setData({ ...data, quantityTracking: e.target.checked, quantity: e.target.checked ? data.quantity : null })} /> Учитывать количество таблеток</label>{data.quantityTracking && <label>Осталось таблеток<input type="number" min="0" value={data.quantity ?? ''} onChange={(e) => setData({ ...data, quantity: e.target.value === '' ? null : Number(e.target.value) })} /></label>}{error && <p className="form-error">{error}</p>}<div className="dialog-buttons"><button type="button" className="secondary-button" onClick={onClose}>Отмена</button><button type="submit" className="primary-button">Сохранить</button></div></form></div>
}

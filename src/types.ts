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

export type MedicineInput = Pick<
  Medicine,
  'name' | 'purpose' | 'expiryDate' | 'quantity' | 'quantityTracking'
>

export type Session = { username: string; household: string }

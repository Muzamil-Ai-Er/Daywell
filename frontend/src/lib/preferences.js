export const DEFAULT_CURRENCY = 'INR'

export const CURRENCIES = [
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'AED' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: 'CN¥' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$' },
]

export const PROFILE_ROLES = ['Student', 'Professional', 'Student & professional', 'Other']

export function normalizeCurrency(value) {
  return CURRENCIES.some(({ code }) => code === value) ? value : DEFAULT_CURRENCY
}

export function readStoredString(value, fallback = '') {
  if (typeof value !== 'string') return fallback
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === 'string' ? parsed : value
  } catch { return value }
}

export function formatCurrency(amount, currency = DEFAULT_CURRENCY) {
  const numericAmount = Number(amount)
  const safeAmount = Number.isFinite(numericAmount) ? numericAmount : 0
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: normalizeCurrency(currency),
  }).format(safeAmount)
}

export function readBudgetAmount(value) {
  if (value === '' || value === null || value === undefined) return 0
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 ? amount : null
}

export function normalizeProfile(value) {
  const profile = value && typeof value === 'object' ? value : {}
  return {
    name: typeof profile.name === 'string' ? profile.name.slice(0, 80) : '',
    role: PROFILE_ROLES.includes(profile.role) ? profile.role : '',
    focus: typeof profile.focus === 'string' ? profile.focus.slice(0, 120) : '',
  }
}

export function profileInitials(name) {
  const parts = typeof name === 'string' ? name.trim().split(/\s+/).filter(Boolean).slice(0, 2) : []
  return parts.length ? parts.map((part) => part[0].toLocaleUpperCase()).join('') : 'DW'
}

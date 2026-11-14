import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CURRENCIES, DEFAULT_CURRENCY, formatCurrency, normalizeCurrency,
  normalizeProfile, profileInitials, readBudgetAmount, readStoredString,
} from '../src/lib/preferences.js'
import { clockMinutes, displayClock, scheduleError } from '../src/lib/plannerTime.js'

test('INR is the default and unsupported currency preferences fall back safely', () => {
  assert.equal(DEFAULT_CURRENCY, 'INR')
  assert.equal(normalizeCurrency('INVALID'), 'INR')
  assert.ok(formatCurrency(1250, 'INR').includes('₹'))
  assert.ok(formatCurrency(1250, 'EUR').includes('€'))
  assert.equal(CURRENCIES.length >= 10, true)
})

test('saved string preferences load from raw and JSON-encoded browser storage values', () => {
  assert.equal(readStoredString('dark', 'light'), 'dark')
  assert.equal(readStoredString('"USD"', 'INR'), 'USD')
  assert.equal(readStoredString(null, 'INR'), 'INR')
})

test('budget amounts reject negative and non-finite input while allowing blanks during editing', () => {
  assert.equal(readBudgetAmount(''), 0)
  assert.equal(readBudgetAmount('0'), 0)
  assert.equal(readBudgetAmount('1250.50'), 1250.5)
  assert.equal(readBudgetAmount('-1'), null)
  assert.equal(readBudgetAmount('not money'), null)
})

test('profile fields are normalized and initials reflect the saved name', () => {
  assert.deepEqual(normalizeProfile({ name: 'Riya Shah', role: 'Student', focus: 'Biology' }), {
    name: 'Riya Shah', role: 'Student', focus: 'Biology',
  })
  assert.deepEqual(normalizeProfile({ name: 5, role: 'admin', focus: null }), {
    name: '', role: '', focus: '',
  })
  assert.equal(profileInitials('Riya Shah'), 'RS')
  assert.equal(profileInitials(''), 'DW')
})

test('planner time parsing and display are safe for temporarily empty or incomplete values', () => {
  for (const value of ['', '09:', '24:00', null]) {
    assert.equal(clockMinutes(value), null)
    assert.doesNotThrow(() => displayClock(value))
    assert.equal(displayClock(value), '—')
  }
  assert.equal(clockMinutes('09:30'), 570)
  assert.notEqual(displayClock('17:30'), '—')
  assert.equal(scheduleError('', '17:00'), 'missing')
  assert.equal(scheduleError('09:00', '09:00'), 'order')
  assert.equal(scheduleError('09:00', '17:00'), null)
})

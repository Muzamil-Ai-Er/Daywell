import test from 'node:test'
import assert from 'node:assert/strict'
import { createDaywellApi } from '../src/lib/api.js'

function makeApi() {
  const calls = []
  const supabaseClient = {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'test-user-token' } }, error: null }),
    },
  }
  const api = createDaywellApi({
    apiBase: 'https://daywell-api.example.test',
    supabaseClient,
    fetchImpl: async (url, options) => {
      calls.push({ url, options })
      if (options.method === 'DELETE') return new Response(null, { status: 204 })
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    },
  })
  return { api, calls }
}

test('the workspace loader and every user-data section use authenticated cloud endpoints', async () => {
  const { api, calls } = makeApi()
  await api.getWorkspace()
  await api.createTask({ title: 'Review notes', priority: 'high', duration: 30, category: 'Study', completed: false, dueDate: '2026-11-12', dueLabel: 'Today', dueAt: '2026-11-12T17:00:00' })
  await api.saveSchedule({ start: '08:30', end: '16:30' })
  await api.saveBudget({ income: '42000', expenses: '18000' })
  await api.saveProfile({ name: 'Riya Shah', role: 'Student', focus: 'Exams' })
  await api.savePreferences({ currency: 'INR', theme: 'dark' })
  await api.saveFocusSessionState({ session_id: 'c4abbb73-eab1-4a1f-9b3a-d9e9b92b02c4', duration_seconds: 1500, remaining_seconds: 1200, started_at: '2026-11-12T06:00:00Z', resumed_at: '2026-11-12T06:05:00Z', is_running: true })
  await api.saveFocusSession({ session_id: 'c4abbb73-eab1-4a1f-9b3a-d9e9b92b02c4', duration_seconds: 1500, started_at: '2026-11-12T06:00:00Z' })
  await api.clearFocusSessionState()

  assert.deepEqual(calls.map(({ url, options }) => [new URL(url).pathname, options.method]), [
    ['/api/workspace', 'GET'],
    ['/api/tasks', 'POST'],
    ['/api/schedule', 'PUT'],
    ['/api/budget', 'PUT'],
    ['/api/profile', 'PUT'],
    ['/api/preferences', 'PUT'],
    ['/api/focus-session-state', 'PUT'],
    ['/api/focus-sessions', 'POST'],
    ['/api/focus-session-state', 'DELETE'],
  ])
  for (const { options } of calls) {
    assert.equal(options.headers.Authorization, 'Bearer test-user-token')
    if (options.method !== 'GET') assert.equal(options.keepalive, true)
  }
  assert.deepEqual(JSON.parse(calls[2].options.body), { day_start: '08:30', day_end: '16:30' })
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    title: 'Review notes', priority: 'high', duration: 30, category: 'Study', completed: false,
    due_date: '2026-11-12', due_label: 'Today', due_at: '2026-11-12T17:00:00',
  })
  assert.deepEqual(JSON.parse(calls[3].options.body), { monthly_income: '42000', monthly_expenses: '18000' })
  assert.deepEqual(JSON.parse(calls[4].options.body), { full_name: 'Riya Shah', role: 'Student', focus: 'Exams' })
  assert.deepEqual(JSON.parse(calls[5].options.body), { currency: 'INR', theme: 'dark' })
  assert.deepEqual(JSON.parse(calls[6].options.body), {
    session_id: 'c4abbb73-eab1-4a1f-9b3a-d9e9b92b02c4', duration_seconds: 1500,
    remaining_seconds: 1200, started_at: '2026-11-12T06:00:00Z',
    resumed_at: '2026-11-12T06:05:00Z', is_running: true,
  })
  assert.deepEqual(JSON.parse(calls[7].options.body), {
    session_id: 'c4abbb73-eab1-4a1f-9b3a-d9e9b92b02c4', duration_seconds: 1500,
    started_at: '2026-11-12T06:00:00Z',
  })
})

test('the cloud client refuses writes without an authenticated session', async () => {
  const api = createDaywellApi({
    apiBase: 'https://daywell-api.example.test',
    supabaseClient: { auth: { getSession: async () => ({ data: { session: null }, error: null }) } },
    fetchImpl: async () => { throw new Error('should not send an unauthenticated request') },
  })
  await assert.rejects(api.saveBudget({ income: '1', expenses: '0' }), /session expired/i)
})

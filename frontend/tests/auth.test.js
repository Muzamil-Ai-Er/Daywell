import test from 'node:test'
import assert from 'node:assert/strict'
import { loginWithPassword, logoutAccount, registerAccount, requestPasswordReset, updatePassword } from '../src/lib/auth.js'

function fakeClient() {
  const calls = []
  const auth = Object.fromEntries(['signUp', 'signInWithPassword', 'signOut', 'resetPasswordForEmail', 'updateUser'].map((method) => [method, async (...args) => {
    calls.push([method, ...args])
    return { data: { session: null, user: { id: 'account-1' } }, error: null }
  }]))
  return { client: { auth }, calls }
}

test('registration creates an email/password account with the profile name', async () => {
  const { client, calls } = fakeClient()
  const result = await registerAccount(client, { email: 'riya@example.test', password: 'a-long-password', name: 'Riya Shah' })
  assert.equal(result.user.id, 'account-1')
  assert.deepEqual(calls[0], ['signUp', {
    email: 'riya@example.test', password: 'a-long-password', options: { data: { full_name: 'Riya Shah' } },
  }])
})

test('login, logout, password reset, and password update call Supabase Auth', async () => {
  const { client, calls } = fakeClient()
  await loginWithPassword(client, { email: 'riya@example.test', password: 'a-long-password' })
  await requestPasswordReset(client, 'riya@example.test', 'https://daywell.example')
  await updatePassword(client, 'a-new-long-password')
  await logoutAccount(client)
  assert.deepEqual(calls.map(([method]) => method), ['signInWithPassword', 'resetPasswordForEmail', 'updateUser', 'signOut'])
  assert.deepEqual(calls[1], ['resetPasswordForEmail', 'riya@example.test', { redirectTo: 'https://daywell.example' }])
  assert.deepEqual(calls[2], ['updateUser', { password: 'a-new-long-password' }])
})

test('authentication errors are surfaced to the UI', async () => {
  const client = { auth: { signInWithPassword: async () => ({ data: null, error: new Error('Invalid login credentials') }) } }
  await assert.rejects(loginWithPassword(client, { email: 'bad@example.test', password: 'wrongpass' }), /Invalid login credentials/)
})

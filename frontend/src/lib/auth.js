function unwrap(result) {
  if (result?.error) throw result.error
  return result?.data ?? null
}

export function registerAccount(client, { email, password, name }) {
  return client.auth.signUp({
    email,
    password,
    options: { data: { full_name: name } },
  }).then(unwrap)
}

export function loginWithPassword(client, { email, password }) {
  return client.auth.signInWithPassword({ email, password }).then(unwrap)
}

export function logoutAccount(client) {
  return client.auth.signOut().then(unwrap)
}

export function requestPasswordReset(client, email, redirectTo) {
  return client.auth.resetPasswordForEmail(email, { redirectTo }).then(unwrap)
}

export function updatePassword(client, password) {
  return client.auth.updateUser({ password }).then(unwrap)
}

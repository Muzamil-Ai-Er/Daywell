import { createClient } from '@supabase/supabase-js'

const env = import.meta.env || {}
const supabaseUrl = env.VITE_SUPABASE_URL?.trim()
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY?.trim()

let validSupabaseUrl = false
try {
  const parsed = new URL(supabaseUrl)
  validSupabaseUrl = parsed.protocol === 'https:' || parsed.protocol === 'http:'
} catch { /* Show the configuration screen instead of crashing on malformed settings. */ }

export const supabaseConfigured = Boolean(validSupabaseUrl && supabaseAnonKey)
export const supabaseConfigurationError = !supabaseUrl || !supabaseAnonKey
  ? 'Set both the Supabase project URL and public anon/publishable key.'
  : !validSupabaseUrl
    ? 'VITE_SUPABASE_URL must be a valid http:// or https:// project URL.'
    : ''
export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

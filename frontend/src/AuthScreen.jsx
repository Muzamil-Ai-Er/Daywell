import { useEffect, useState } from 'react'
import { AlertCircle, ArrowLeft, LoaderCircle, Sparkles } from 'lucide-react'
import { loginWithPassword, registerAccount, requestPasswordReset, updatePassword } from './lib/auth.js'

const fieldClass = 'mt-1.5 w-full rounded-xl border border-line bg-canvas px-3.5 py-3 text-[13px] text-ink outline-none placeholder:text-muted focus:border-[#91ac97] focus:bg-white'

function Button({ children, disabled = false, className = '', type = 'button' }) {
  return <button type={type} disabled={disabled} className={`inline-flex items-center justify-center gap-2 rounded-xl bg-leaf px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-leaf-dark disabled:cursor-wait disabled:opacity-60 ${className}`}>{children}</button>
}

export default function AuthScreen({ supabase, recovery = false, onRecovered }) {
  const [mode, setMode] = useState(recovery ? 'reset' : 'login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (recovery) setMode('reset')
  }, [recovery])

  const changeMode = (nextMode) => {
    setMode(nextMode)
    setError('')
    setNotice('')
    setPassword('')
    setConfirmPassword('')
  }

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setNotice('')
    if (mode === 'signup' && !name.trim()) { setError('Enter your name to create your profile.'); return }
    if (mode !== 'forgot' && password.length < 8) { setError('Use a password with at least 8 characters.'); return }
    if (mode === 'reset' && password !== confirmPassword) { setError('The passwords do not match.'); return }
    setBusy(true)
    try {
      if (mode === 'signup') {
        const data = await registerAccount(supabase, { email: email.trim(), password, name: name.trim() })
        setNotice(data.session
          ? 'Your account is ready.'
          : 'If registration can be completed, Supabase will send a confirmation email. Follow that link to sign in.')
      } else if (mode === 'login') {
        await loginWithPassword(supabase, { email: email.trim(), password })
      } else if (mode === 'forgot') {
        await requestPasswordReset(supabase, email.trim(), window.location.origin)
        setNotice('If an account matches that address, Supabase will send a password reset link.')
      } else {
        await updatePassword(supabase, password)
        setNotice('Your password has been updated.')
        onRecovered?.()
        setMode('login')
      }
    } catch (authError) {
      setError(authError?.message || 'Authentication could not be completed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const title = mode === 'signup' ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : mode === 'reset' ? 'Choose a new password' : 'Welcome back'
  const description = mode === 'signup'
    ? 'Your plans and personal data will be saved to your account.'
    : mode === 'forgot'
      ? 'We’ll email a secure link if the account exists.'
      : mode === 'reset'
        ? 'Choose a new password for your Daywell account.'
        : 'Sign in to continue to your personal workspace.'

  return <main className="grid min-h-screen place-items-center bg-canvas px-4 py-10 text-ink">
    <section className="w-full max-w-[420px] rounded-3xl border border-line bg-white p-6 shadow-soft sm:p-8">
      <div className="mb-7 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-leaf text-white"><Sparkles size={20} /></span>
        <div><div className="font-display text-[20px] font-extrabold tracking-[-.045em]">daywell<span className="text-leaf">.</span></div><div className="text-[10px] font-medium tracking-[.12em] text-muted">YOUR DAILY COMPANION</div></div>
      </div>
      <h1 className="font-display text-[24px] font-bold tracking-[-.04em]">{title}</h1>
      <p className="mb-5 mt-1.5 text-[12px] leading-5 text-muted">{description}</p>
      <form onSubmit={submit} className="space-y-3.5">
        {mode === 'signup' && <label className="block text-[11px] font-semibold text-muted">Name<input autoComplete="name" maxLength={80} required value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" className={fieldClass} /></label>}
        {mode !== 'reset' && <label className="block text-[11px] font-semibold text-muted">Email<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className={fieldClass} /></label>}
        {mode !== 'forgot' && <label className="block text-[11px] font-semibold text-muted">{mode === 'reset' ? 'New password' : 'Password'}<input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" className={fieldClass} /></label>}
        {mode === 'reset' && <label className="block text-[11px] font-semibold text-muted">Confirm new password<input type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter the password again" className={fieldClass} /></label>}
        {error && <p role="alert" className="flex items-start gap-2 rounded-xl border border-[#f0d9c7] bg-[#fff8f1] px-3 py-2.5 text-[11px] leading-5 text-[#765b49]"><AlertCircle size={14} className="mt-0.5 shrink-0" />{error}</p>}
        {notice && <p role="status" className="rounded-xl border border-line bg-canvas px-3 py-2.5 text-[11px] leading-5 text-muted">{notice}</p>}
        <Button type="submit" disabled={busy} className="mt-2 w-full">{busy && <LoaderCircle size={15} className="animate-spin" />}{mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : mode === 'reset' ? 'Update password' : 'Sign in'}</Button>
      </form>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
        {mode === 'login' && <><button onClick={() => changeMode('forgot')} className="font-semibold text-leaf hover:text-leaf-dark">Forgot password?</button><button onClick={() => changeMode('signup')} className="font-semibold text-muted hover:text-ink">Create account</button></>}
        {mode === 'signup' && <button onClick={() => changeMode('login')} className="flex items-center gap-1 font-semibold text-muted hover:text-ink"><ArrowLeft size={13} />Back to sign in</button>}
        {mode === 'forgot' && <button onClick={() => changeMode('login')} className="flex items-center gap-1 font-semibold text-muted hover:text-ink"><ArrowLeft size={13} />Back to sign in</button>}
        {mode === 'reset' && <button onClick={() => changeMode('login')} className="flex items-center gap-1 font-semibold text-muted hover:text-ink"><ArrowLeft size={13} />Back to sign in</button>}
      </div>
      <p className="mt-6 border-t border-line pt-4 text-center text-[9px] leading-4 text-muted">Your Daywell data is linked to your signed-in account. Keep your password private.</p>
    </section>
  </main>
}

import type { ReactElement } from 'react'
import { useState } from 'react'
import { Lock, Mail, Loader2, ArrowRight, Eye, EyeOff, ShieldCheck, User } from 'lucide-react'
import { useRegisterUser } from '@workspace/api-client-react'
import { useUiStore } from '../store/uiStore'
import { getTheme, serif } from '../theme'
import { useAuth } from '../hooks/useAuth'
import appIcon from '../assets/icon.png'

// Desktop port of artifacts/web/src/pages/Register.tsx — first-run setup.
// Only reachable when GET /api/setup/status reports hasUsers: false (see
// App.tsx Gate), so the account created here is always the first admin.
export default function Setup(): ReactElement {
  const { dark } = useUiStore()
  const theme = getTheme(dark)
  const { loginWithToken } = useAuth()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const registerMutation = useRegisterUser({
    mutation: {
      onSuccess: (data: any) => {
        loginWithToken(data.token)
      },
      onError: (err: any) => {
        const detail = err?.data?.detail || err?.data?.error || err?.message || 'Something went wrong.'
        setError(detail)
      }
    }
  })

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError("Passwords don't match")
      return
    }
    registerMutation.mutate({ data: { name, email, password, role: 'admin' } } as any)
  }

  const disabled = registerMutation.isPending || !name || !email || !password || !confirm

  const fieldShell =
    'flex items-center gap-2 rounded-lg px-3 py-2 transition-all duration-150 focus-within:border-transparent focus-within:ring-2 focus-within:ring-emerald-500/40'

  return (
    <div className="h-full flex items-center justify-center relative overflow-hidden">
      {/* Ambient background — matches the Login screen */}
      <div
        aria-hidden
        style={{
          background:
            'radial-gradient(600px circle at 15% 20%, rgba(47,191,143,0.14), transparent 60%),' +
            'radial-gradient(500px circle at 85% 80%, rgba(47,178,191,0.10), transparent 60%)'
        }}
        className="absolute inset-0 pointer-events-none"
      />

      <form
        onSubmit={handleSubmit}
        style={{
          background: theme.card,
          border: `1px solid ${theme.border}`,
          boxShadow: theme.shadowLg
        }}
        className="w-full max-w-sm rounded-2xl p-8 flex flex-col gap-4 relative animate-fade-up"
      >
        <div
          aria-hidden
          style={{
            background: 'linear-gradient(90deg, #34D399, #0E8A64)',
            height: 3,
            top: 0,
            left: 0,
            right: 0
          }}
          className="absolute rounded-t-2xl"
        />
        <div className="flex flex-col items-center gap-1 mb-1">
          <img
            src={appIcon}
            alt="PharmaCore"
            draggable={false}
            style={{ boxShadow: '0 8px 24px rgba(16,24,20,0.18)' }}
            className="w-14 h-14 rounded-xl mb-2 select-none"
          />
          <h1 style={{ ...serif, color: theme.text }} className="text-xl font-semibold">
            Create your admin account
          </h1>
          <p style={{ color: theme.muted }} className="text-xs text-center">
            No accounts exist yet. Set up the first administrator to get started.
          </p>
          <div
            style={{ background: theme.primarySoft, color: theme.primaryText }}
            className="flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full text-[11px] font-semibold"
          >
            <ShieldCheck size={12} /> First-time setup
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span style={{ color: theme.muted }} className="text-xs font-medium">
            Full name
          </span>
          <div
            style={{ background: theme.cardAlt, border: `1px solid ${theme.border}` }}
            className={fieldShell}
          >
            <User size={14} color={theme.muted} />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              autoComplete="name"
              required
              style={{ color: theme.text, background: 'transparent' }}
              className="flex-1 text-sm outline-none"
              placeholder="Admin name"
            />
          </div>
        </label>

        <label className="flex flex-col gap-1.5">
          <span style={{ color: theme.muted }} className="text-xs font-medium">
            Email
          </span>
          <div
            style={{ background: theme.cardAlt, border: `1px solid ${theme.border}` }}
            className={fieldShell}
          >
            <Mail size={14} color={theme.muted} />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              style={{ color: theme.text, background: 'transparent' }}
              className="flex-1 text-sm outline-none"
              placeholder="admin@pharmacy.com"
            />
          </div>
        </label>

        <label className="flex flex-col gap-1.5">
          <span style={{ color: theme.muted }} className="text-xs font-medium">
            Password
          </span>
          <div
            style={{ background: theme.cardAlt, border: `1px solid ${theme.border}` }}
            className={fieldShell}
          >
            <Lock size={14} color={theme.muted} />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
              style={{ color: theme.text, background: 'transparent' }}
              className="flex-1 text-sm outline-none"
              placeholder="Min. 8 characters"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword((s) => !s)}
              title={showPassword ? 'Hide password' : 'Show password'}
              style={{ color: theme.muted }}
              className="hover:opacity-70 transition-opacity"
            >
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </label>

        <label className="flex flex-col gap-1.5">
          <span style={{ color: theme.muted }} className="text-xs font-medium">
            Confirm password
          </span>
          <div
            style={{ background: theme.cardAlt, border: `1px solid ${theme.border}` }}
            className={fieldShell}
          >
            <Lock size={14} color={theme.muted} />
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
              style={{ color: theme.text, background: 'transparent' }}
              className="flex-1 text-sm outline-none"
              placeholder="Repeat your password"
            />
          </div>
        </label>

        {error && (
          <div
            style={{ background: theme.redBg, color: theme.red }}
            className="text-xs font-medium rounded-lg px-3 py-2 flex items-center gap-2"
          >
            <span style={{ background: theme.red }} className="w-1.5 h-1.5 rounded-full shrink-0" />
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={disabled}
          style={{
            background: 'linear-gradient(135deg, #22B57F 0%, #0E8A64 100%)',
            boxShadow: disabled ? 'none' : '0 4px 16px rgba(16,138,100,0.35)',
            opacity: disabled ? 0.55 : 1
          }}
          className="w-full rounded-lg py-2.5 text-white text-sm font-semibold tracking-tight flex items-center justify-center gap-2 mt-1 transition-transform active:scale-[0.98] disabled:active:scale-100"
        >
          {registerMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : null}
          Create admin account
          {!registerMutation.isPending && <ArrowRight size={15} />}
        </button>
      </form>
    </div>
  )
}

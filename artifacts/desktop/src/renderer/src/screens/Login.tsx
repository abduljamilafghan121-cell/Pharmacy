import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Lock, Mail, LogIn, Loader2, Eye, EyeOff, ArrowLeft, MailCheck, CheckCircle2, KeyRound } from 'lucide-react'
import { useUiStore } from '../store/uiStore'
import { getTheme, serif } from '../theme'
import { useAuth } from '../hooks/useAuth'
import { apiUrl, jsonOrThrow } from '../lib/apiClient'
import { getRecallEmails, rememberEmail } from '../lib/emailRecall'
import appIcon from '../assets/icon.png'
import loginBg from '../assets/for log.jpg'

type LoginView = 'login' | 'forgot' | 'reset'

// Desktop port of web's /forgot-password and /reset-password pages. There is
// no router pre-auth, so both flows live as in-card views here. The emailed
// link points at the web app's URL, so the reset view accepts the pasted
// link (token is extracted) or the bare `<userId>.<rawToken>` token.
export default function Login(): ReactElement {
  const { dark } = useUiStore()
  const theme = getTheme(dark)
  const { login, loginError } = useAuth()

  const [view, setView] = useState<LoginView>('login')

  // login
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [emailFocus, setEmailFocus] = useState(false)
  const [activeSuggestion, setActiveSuggestion] = useState(-1)

  // Email autocomplete — remembered accounts, filtered live as the user types
  // (case-insensitive substring over the full address). The dropdown only
  // appears once the user starts typing, never on focus with an empty field.
  const recallEmails = getRecallEmails()
  const query = email.trim().toLowerCase()
  const suggestions = query ? recallEmails.filter((e) => e.toLowerCase().includes(query)) : []
  const showSuggestions =
    emailFocus && query.length > 0 && suggestions.length > 0 && !loginError && !submitting
  const emailRef = useRef<HTMLInputElement>(null)
  const emailWrapRef = useRef<HTMLDivElement>(null)

  // Close the dropdown when clicking outside the email field. Using a
  // document-level mousedown makes "click outside to dismiss" immediate and
  // reliable (no reliance on blur timing races).
  useEffect(() => {
    const onMouseDown = (e: MouseEvent): void => {
      if (emailWrapRef.current && !emailWrapRef.current.contains(e.target as Node)) {
        setEmailFocus(false)
        setActiveSuggestion(-1)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  // Highlights the part of the email that matches the current query, so the
  // match is visible at a glance like a browser autocomplete.
  const renderHighlight = (value: string): ReactElement => {
    if (!query) return <>{value}</>
    const idx = value.toLowerCase().indexOf(query)
    if (idx === -1) return <>{value}</>
    return (
      <>
        {value.slice(0, idx)}
        <span style={{ color: theme.primary, fontWeight: 600 }}>{value.slice(idx, idx + query.length)}</span>
        {value.slice(idx + query.length)}
      </>
    )
  }

  // forgot
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotBusy, setForgotBusy] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotError, setForgotError] = useState<string | null>(null)

  // reset
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetBusy, setResetBusy] = useState(false)
  const [resetDone, setResetDone] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!email || !password || submitting) return
    setSubmitting(true)
    try {
      await login(email, password)
    } catch {
      // loginError is already set by useAuth
    } finally {
      setSubmitting(false)
    }
  }

  const handleForgot = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!forgotEmail || forgotBusy) return
    setForgotBusy(true)
    setForgotError(null)
    try {
      const res = await fetch(apiUrl('auth/forgot-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail })
      })
      await jsonOrThrow(res, 'Something went wrong')
      setForgotSent(true)
    } catch (err) {
      setForgotError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setForgotBusy(false)
    }
  }

  const handleReset = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setResetError(null)
    if (newPassword !== confirmPassword) {
      setResetError('Passwords do not match')
      return
    }
    // Accept either the full reset link ("...reset-password?token=1.abc") or
    // the bare token ("1.abc") — whatever the user copies out of the email.
    const pasted = resetToken.trim()
    const tokenParam = pasted.includes('token=')
      ? pasted.split('token=')[1]?.split('&')[0] ?? ''
      : pasted
    const token = decodeURIComponent(tokenParam)
    if (!token) {
      setResetError('Paste the reset link or token from your email')
      return
    }
    if (resetBusy) return
    setResetBusy(true)
    try {
      const res = await fetch(apiUrl('auth/reset-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword })
      })
      await jsonOrThrow(res, 'Something went wrong')
      setResetDone(true)
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setResetBusy(false)
    }
  }

  const inputShell =
    'flex items-center gap-2 rounded-lg px-3 py-2 transition-all duration-150 focus-within:border-transparent focus-within:ring-2 focus-within:ring-emerald-500/40'

  const subtitle =
    view === 'login'
      ? 'Sign in to open the register'
      : view === 'forgot'
        ? 'Reset your password'
        : 'Set a new password'

  const loginDisabled = submitting || !email || !password

  const handleEmailKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (!showSuggestions || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveSuggestion((i) => (i + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveSuggestion((i) => (i - 1 + suggestions.length) % suggestions.length)
    } else if (e.key === 'Enter' && activeSuggestion >= 0) {
      e.preventDefault()
      const pick = suggestions[activeSuggestion]
      if (pick) {
        setEmail(pick)
        setEmailFocus(false)
        setActiveSuggestion(-1)
        emailRef.current?.focus()
      }
    } else if (e.key === 'Escape') {
      setEmailFocus(false)
      setActiveSuggestion(-1)
    }
  }

  return (
    <div className="h-full flex items-center justify-center relative overflow-hidden">
      {/* Full-bleed background photo for the login page */}
      <div
        aria-hidden
        style={{
          backgroundImage: `url(${loginBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
        className="absolute inset-0 pointer-events-none"
      />
      {/* Modern ambient background — layered emerald glows + subtle grain/grid */}
      <div
        aria-hidden
        style={{
          background:
            'radial-gradient(800px circle at 12% 10%, rgba(47,191,143,0.16), transparent 55%),' +
            'radial-gradient(650px circle at 88% 85%, rgba(47,178,191,0.12), transparent 55%),' +
            'radial-gradient(500px circle at 80% 15%, rgba(47,191,143,0.08), transparent 60%)'
        }}
        className="absolute inset-0 pointer-events-none"
      />
      <div
        aria-hidden
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
          backgroundSize: '42px 42px',
          maskImage: 'radial-gradient(ellipse at center, black 20%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 20%, transparent 75%)'
        }}
        className="absolute inset-0 pointer-events-none"
      />
      <div
        aria-hidden
        style={{
          background: dark
            ? 'linear-gradient(180deg, rgba(6,12,10,0.55), rgba(6,12,10,0.72))'
            : 'linear-gradient(180deg, rgba(6,12,10,0.30), rgba(6,12,10,0.48))'
        }}
        className="absolute inset-0 pointer-events-none"
      />

      <form
        onSubmit={view === 'login' ? handleLogin : view === 'forgot' ? handleForgot : handleReset}
        style={{
          background: theme.card,
          border: `1px solid ${theme.borderStrong}`,
          boxShadow: `0 2px 4px rgba(0,0,0,0.06), ${theme.shadowLg}`
        }}
        className="w-full max-w-[22rem] rounded-2xl p-8 flex flex-col gap-4 relative animate-fade-up login-form"
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
            PharmaCore
          </h1>
          <p style={{ color: theme.muted }} className="text-xs">
            {subtitle}
          </p>
        </div>

        {view === 'login' && (
          <>
            <div className="relative" ref={emailWrapRef}>
              <label className="flex flex-col gap-1.5">
                <span style={{ color: theme.muted }} className="text-xs font-medium">
                  Email
                </span>
                <div
                  style={{ background: theme.cardAlt, border: `1px solid ${theme.border}` }}
                  className={inputShell}
                >
                  <Mail size={14} color={theme.muted} />
                  <input
                    ref={emailRef}
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      setActiveSuggestion(-1)
                    }}
                    onKeyDown={handleEmailKeyDown}
                    onFocus={() => setEmailFocus(true)}
                    onBlur={() => setEmailFocus(false)}
                    autoFocus
                    autoComplete="off"
                    style={{ color: theme.text }}
                    className="flex-1 text-sm bg-transparent border-none outline-none"
                    placeholder="you@pharmacy.com"
                  />
                </div>
              </label>

              {showSuggestions && (
                <div
                  style={{
                    background: theme.card,
                    border: `1px solid ${theme.borderStrong}`
                  }}
                  className="login-autocomplete absolute z-20 top-full left-0 right-0 animate-scale-in"
                >
                  {suggestions.map((s, idx) => (
                    <button
                      key={s}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        setEmail(s)
                        setEmailFocus(false)
                        setActiveSuggestion(-1)
                        emailRef.current?.focus()
                      }}
                      onMouseEnter={() => setActiveSuggestion(idx)}
                      style={{
                        color: theme.text,
                        background: idx === activeSuggestion ? theme.hover : 'transparent',
                        '--row-hover': theme.hover
                      } as React.CSSProperties}
                      className="login-autocomplete-option w-full text-left"
                    >
                      <span
                        style={{ background: theme.primarySoft, color: theme.primary }}
                        className="login-autocomplete-avatar"
                      >
                        {s.charAt(0).toUpperCase()}
                      </span>
                      <span className="truncate flex-1">{renderHighlight(s)}</span>
                      <span style={{ color: theme.muted }} className="login-autocomplete-meta">
                        Previously used
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <label className="flex flex-col gap-1.5">
              <span style={{ color: theme.muted }} className="text-xs font-medium">
                Password
              </span>
              <div
                style={{ background: theme.cardAlt, border: `1px solid ${theme.border}` }}
                className={inputShell}
              >
                <Lock size={14} color={theme.muted} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  style={{ color: theme.text }}
                  className="flex-1 text-sm bg-transparent border-none outline-none"
                  placeholder="••••••••"
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

            {loginError && (
              <div
                style={{ background: theme.redBg, color: theme.red }}
                className="text-xs font-medium rounded-lg px-3 py-2 flex items-center gap-2"
              >
                <span style={{ background: theme.red }} className="w-1.5 h-1.5 rounded-full shrink-0" />
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={loginDisabled}
              style={{
                background: 'linear-gradient(135deg, #22B57F 0%, #0E8A64 100%)',
                boxShadow: loginDisabled ? 'none' : '0 4px 16px rgba(16,138,100,0.35)',
                opacity: loginDisabled ? 0.55 : 1
              }}
              className="w-full rounded-lg py-2.5 text-white text-sm font-semibold tracking-tight flex items-center justify-center gap-2 mt-1 transition-transform active:scale-[0.98] disabled:active:scale-100"
            >
              {submitting ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />}
              Sign in
            </button>

            <button
              type="button"
              onClick={() => {
                setForgotEmail(email)
                setView('forgot')
              }}
              style={{ color: theme.muted }}
              className="text-xs hover:underline text-center -mt-1"
            >
              Forgot your password?
            </button>
          </>
        )}

        {view === 'forgot' && (
          <>
            {forgotSent ? (
              <>
                <div className="flex flex-col items-center gap-2 py-2 text-center">
                  <MailCheck size={32} color={theme.primaryText} />
                  <p style={{ color: theme.text }} className="text-sm font-medium">
                    Check your email
                  </p>
                  <p style={{ color: theme.muted }} className="text-xs">
                    If an account exists for <strong>{forgotEmail}</strong>, a reset link has been
                    sent. The link expires in 1 hour.
                  </p>
                  <p style={{ color: theme.muted }} className="text-xs mt-1">
                    The email opens the web app — here, use the link's token directly.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setResetToken('')
                    setNewPassword('')
                    setConfirmPassword('')
                    setResetDone(false)
                    setResetError(null)
                    setView('reset')
                  }}
                  style={{ background: 'linear-gradient(135deg, #22B57F 0%, #0E8A64 100%)' }}
                  className="w-full rounded-lg py-2.5 text-white text-sm font-semibold flex items-center justify-center gap-2"
                >
                  <KeyRound size={14} /> I have a reset link
                </button>
                <button
                  type="button"
                  onClick={() => setView('login')}
                  style={{ color: theme.muted }}
                  className="text-xs hover:underline text-center flex items-center justify-center gap-1"
                >
                  <ArrowLeft size={11} /> Back to login
                </button>
              </>
            ) : (
              <>
                <p style={{ color: theme.muted }} className="text-xs -mt-1">
                  Enter your email and we'll send you a reset link.
                </p>
                <label className="flex flex-col gap-1.5">
                  <span style={{ color: theme.muted }} className="text-xs font-medium">
                    Email
                  </span>
                  <div
                    style={{ background: theme.cardAlt, border: `1px solid ${theme.border}` }}
                    className={inputShell}
                  >
                    <Mail size={14} color={theme.muted} />
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      autoFocus
                      required
                      style={{ color: theme.text }}
                      className="flex-1 text-sm bg-transparent border-none outline-none"
                      placeholder="you@pharmacy.com"
                    />
                  </div>
                </label>

                {forgotError && (
                  <div
                    style={{ background: theme.redBg, color: theme.red }}
                    className="text-xs font-medium rounded-lg px-3 py-2 flex items-center gap-2"
                  >
                    <span style={{ background: theme.red }} className="w-1.5 h-1.5 rounded-full shrink-0" />
                    {forgotError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={forgotBusy || !forgotEmail}
                  style={{
                    background: 'linear-gradient(135deg, #22B57F 0%, #0E8A64 100%)',
                    opacity: forgotBusy || !forgotEmail ? 0.55 : 1
                  }}
                  className="w-full rounded-lg py-2.5 text-white text-sm font-semibold flex items-center justify-center gap-2 mt-1"
                >
                  {forgotBusy ? <Loader2 size={15} className="animate-spin" /> : <MailCheck size={15} />}
                  Send reset link
                </button>
                <button
                  type="button"
                  onClick={() => setView('login')}
                  style={{ color: theme.muted }}
                  className="text-xs hover:underline text-center flex items-center justify-center gap-1"
                >
                  <ArrowLeft size={11} /> Back to login
                </button>
              </>
            )}
          </>
        )}

        {view === 'reset' && (
          <>
            {resetDone ? (
              <>
                <div className="flex flex-col items-center gap-2 py-2 text-center">
                  <CheckCircle2 size={32} color={theme.green} />
                  <p style={{ color: theme.text }} className="text-sm font-medium">
                    Password reset
                  </p>
                  <p style={{ color: theme.muted }} className="text-xs">
                    You can now log in with your new password.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setView('login')}
                  style={{ background: 'linear-gradient(135deg, #22B57F 0%, #0E8A64 100%)' }}
                  className="w-full rounded-lg py-2.5 text-white text-sm font-semibold flex items-center justify-center gap-2"
                >
                  <LogIn size={14} /> Go to login
                </button>
              </>
            ) : (
              <>
                <label className="flex flex-col gap-1.5">
                  <span style={{ color: theme.muted }} className="text-xs font-medium">
                    Reset link or token
                  </span>
                  <div
                    style={{ background: theme.cardAlt, border: `1px solid ${theme.border}` }}
                    className={inputShell}
                  >
                    <KeyRound size={14} color={theme.muted} />
                    <input
                      type="text"
                      value={resetToken}
                      onChange={(e) => setResetToken(e.target.value)}
                      autoFocus
                      required
                      style={{ color: theme.text }}
                      className="flex-1 text-xs bg-transparent border-none outline-none"
                      placeholder="Paste the link or token from the email"
                    />
                  </div>
                </label>

                <label className="flex flex-col gap-1.5">
                  <span style={{ color: theme.muted }} className="text-xs font-medium">
                    New password
                  </span>
                  <div
                    style={{ background: theme.cardAlt, border: `1px solid ${theme.border}` }}
                    className={inputShell}
                  >
                    <Lock size={14} color={theme.muted} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                      minLength={6}
                      required
                      style={{ color: theme.text }}
                      className="flex-1 text-sm bg-transparent border-none outline-none"
                      placeholder="Min. 6 characters"
                    />
                  </div>
                </label>

                <label className="flex flex-col gap-1.5">
                  <span style={{ color: theme.muted }} className="text-xs font-medium">
                    Confirm new password
                  </span>
                  <div
                    style={{ background: theme.cardAlt, border: `1px solid ${theme.border}` }}
                    className={inputShell}
                  >
                    <Lock size={14} color={theme.muted} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      minLength={6}
                      required
                      style={{ color: theme.text }}
                      className="flex-1 text-sm bg-transparent border-none outline-none"
                      placeholder="Repeat your password"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword((s) => !s)}
                      title={showPassword ? 'Hide passwords' : 'Show passwords'}
                      style={{ color: theme.muted }}
                      className="hover:opacity-70 transition-opacity"
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </label>

                {resetError && (
                  <div
                    style={{ background: theme.redBg, color: theme.red }}
                    className="text-xs font-medium rounded-lg px-3 py-2 flex items-center gap-2"
                  >
                    <span style={{ background: theme.red }} className="w-1.5 h-1.5 rounded-full shrink-0" />
                    {resetError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={resetBusy || !resetToken || !newPassword || !confirmPassword}
                  style={{
                    background: 'linear-gradient(135deg, #22B57F 0%, #0E8A64 100%)',
                    opacity: resetBusy || !resetToken || !newPassword || !confirmPassword ? 0.55 : 1
                  }}
                  className="w-full rounded-lg py-2.5 text-white text-sm font-semibold flex items-center justify-center gap-2 mt-1"
                >
                  {resetBusy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
                  Reset password
                </button>
                <button
                  type="button"
                  onClick={() => setView('login')}
                  style={{ color: theme.muted }}
                  className="text-xs hover:underline text-center flex items-center justify-center gap-1"
                >
                  <ArrowLeft size={11} /> Back to login
                </button>
              </>
            )}
          </>
        )}
      </form>
    </div>
  )
}

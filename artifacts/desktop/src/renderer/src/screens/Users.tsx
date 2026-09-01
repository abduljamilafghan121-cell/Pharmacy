import type { ReactElement } from 'react'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useCreateUser, useListUsers, getListUsersQueryKey } from '@workspace/api-client-react'
import { ShieldCheck, UserPlus, Users as UsersIcon, Loader2, Pencil, KeyRound, Power, RefreshCw } from 'lucide-react'
import { useUiStore } from '../store/uiStore'
import { getTheme, serif } from '../theme'
import { useAuth } from '../hooks/useAuth'
import { apiUrl, authHeaders, jsonOrThrow } from '../lib/apiClient'
import Modal from '../components/Modal'
import Loading from '../components/Loading'

const ALL_ROLES = ['admin', 'pharmacist', 'cashier', 'viewer'] as const
type Role = (typeof ALL_ROLES)[number]

function roleLabel(role: string): string {
  return (
    ({ admin: 'Administrator', pharmacist: 'Pharmacist', cashier: 'Cashier', viewer: 'Viewer (read-only)' })[role] ??
    role
  )
}

type UserRow = {
  id: number
  name: string
  email: string
  phone?: string | null
  role: string
  isActive?: boolean
  createdAt: string
}

export default function UsersScreen(): ReactElement {
  const { dark, showToast } = useUiStore()
  const theme = getTheme(dark)
  const { user: me } = useAuth()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const { data: users = [], isLoading, isError, refetch } = useListUsers()
  const rows = (users ?? []) as unknown as UserRow[]

  const createUser = useCreateUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() })
        setCreateOpen(false)
        showToast('Staff account created')
      },
      onError: (error: Error) => showToast(error.message || 'Could not create account')
    }
  })

  const patchUser = async (id: number, payload: Record<string, unknown>): Promise<void> => {
    const res = await fetch(apiUrl(`users/${id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload)
    })
    await jsonOrThrow(res, 'Update failed')
    queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() })
  }

  const resetPassword = async (id: number, newPassword: string): Promise<void> => {
    const res = await fetch(apiUrl(`users/${id}/reset-password`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ newPassword })
    })
    await jsonOrThrow(res, 'Reset failed')
  }

  const inputStyle = {
    background: theme.cardAlt,
    border: `1px solid ${theme.border}`,
    color: theme.text
  }
  const inputCls =
    'w-full text-sm rounded-lg px-3 py-2 outline-none placeholder:opacity-50 transition-all duration-150 focus:border-transparent focus:ring-2 focus:ring-emerald-500/40'
  const labelCls = 'text-xs font-medium mb-1.5 block'

  return (
    <div className="p-7 max-w-4xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 style={{ ...serif, color: theme.text }} className="text-xl font-semibold">
            User Management
          </h1>
          <p style={{ color: theme.muted }} className="text-xs mt-0.5">
            Create staff accounts and assign the right access level.
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          style={{ background: 'linear-gradient(135deg, #22B57F 0%, #0E8A64 100%)' }}
          className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-white text-sm font-semibold transition-transform active:scale-[0.98]"
        >
          <UserPlus size={14} /> Add staff member
        </button>
      </div>

      <div style={{ background: theme.card, border: `1px solid ${theme.border}`, boxShadow: theme.shadow }} className="rounded-xl overflow-hidden">
        <div style={{ borderBottom: `1px solid ${theme.border}` }} className="flex items-center gap-2 px-5 py-4">
          <UsersIcon size={15} color={theme.primaryText} />
          <h2 style={{ color: theme.text }} className="text-sm font-semibold">
            Staff accounts
          </h2>
          <span style={{ color: theme.muted }} className="ml-auto text-xs">
            Only administrators can create, edit, or deactivate staff accounts.
          </span>
        </div>

        <div className="p-5">
          {isLoading ? (
            <Loading label="Loading accounts…" />
          ) : isError ? (
            <div className="py-8 text-center">
              <p style={{ color: theme.red }} className="text-sm mb-2">Couldn&apos;t load staff accounts.</p>
              <button
                onClick={() => refetch()}
                style={{ border: `1px solid ${theme.border}`, color: theme.text }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
              >
                <RefreshCw size={12} /> Try again
              </button>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div style={{ background: theme.primarySoft, color: theme.primaryText }} className="w-12 h-12 rounded-xl flex items-center justify-center mb-3">
                <UserPlus size={22} />
              </div>
              <p style={{ color: theme.text }} className="text-base font-medium">
                No staff accounts yet
              </p>
              <p style={{ color: theme.muted }} className="text-sm mt-1 mb-4 max-w-sm">
                Create accounts for pharmacists, cashiers and other staff so they can sign in to their own profile.
              </p>
              <button
                onClick={() => setCreateOpen(true)}
                style={{ background: theme.primary, color: '#fff' }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
              >
                <UserPlus size={14} /> Add staff member
              </button>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: theme.border }}>
              {rows.map((staff) => (
                <StaffRow
                  key={staff.id}
                  staff={staff}
                  isSelf={staff.id === me?.id}
                  theme={theme}
                  showToast={showToast}
                  onPatch={patchUser}
                  onResetPassword={resetPassword}
                  inputStyle={inputStyle}
                  inputCls={inputCls}
                  labelCls={labelCls}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {createOpen && (
        <Modal title="Create staff account" onClose={() => setCreateOpen(false)} width={480}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              const password = String(fd.get('password') ?? '')
              const confirmation = String(fd.get('confirmation') ?? '')
              if (password !== confirmation) {
                showToast('Passwords do not match')
                return
              }
              createUser.mutate({
                data: {
                  name: String(fd.get('name') ?? '').trim(),
                  email: String(fd.get('email') ?? '').trim(),
                  password,
                  phone: String(fd.get('phone') ?? '').trim() || undefined,
                  role: String(fd.get('role') ?? 'pharmacist') as any
                }
              })
            }}
            className="space-y-4"
          >
            <label className="block">
              <span style={{ color: theme.muted }} className={labelCls}>
                Full name
              </span>
              <input name="name" required style={inputStyle} className={inputCls} />
            </label>
            <label className="block">
              <span style={{ color: theme.muted }} className={labelCls}>
                Email
              </span>
              <input name="email" type="email" required style={inputStyle} className={inputCls} />
            </label>
            <label className="block">
              <span style={{ color: theme.muted }} className={labelCls}>
                Phone <span className="opacity-60 font-normal">(optional)</span>
              </span>
              <input name="phone" type="tel" style={inputStyle} className={inputCls} />
            </label>
            <label className="block">
              <span style={{ color: theme.muted }} className={labelCls}>
                Access level
              </span>
              <select name="role" defaultValue="pharmacist" style={inputStyle} className={inputCls}>
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span style={{ color: theme.muted }} className={labelCls}>
                  Password
                </span>
                <input name="password" type="password" minLength={6} required style={inputStyle} className={inputCls} />
              </label>
              <label className="block">
                <span style={{ color: theme.muted }} className={labelCls}>
                  Confirm password
                </span>
                <input name="confirmation" type="password" minLength={6} required style={inputStyle} className={inputCls} />
              </label>
            </div>
            <button
              type="submit"
              disabled={createUser.isPending}
              style={{ background: 'linear-gradient(135deg, #22B57F 0%, #0E8A64 100%)' }}
              className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-white text-sm font-semibold transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              {createUser.isPending && <Loader2 size={14} className="animate-spin" />}
              Create account
            </button>
          </form>
        </Modal>
      )}
    </div>
  )
}

// ── Staff row with edit + reset-password dialogs ────────────────────────────

function StaffRow({
  staff,
  isSelf,
  theme,
  showToast,
  onPatch,
  onResetPassword,
  inputStyle,
  inputCls,
  labelCls
}: {
  staff: UserRow
  isSelf: boolean
  theme: ReturnType<typeof getTheme>
  showToast: (msg: string) => void
  onPatch: (id: number, payload: Record<string, unknown>) => Promise<void>
  onResetPassword: (id: number, newPassword: string) => Promise<void>
  inputStyle: React.CSSProperties
  inputCls: string
  labelCls: string
}): ReactElement {
  const [editOpen, setEditOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)

  const isActive = staff.isActive !== false

  const handleEdit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setSaving(true)
    try {
      await onPatch(staff.id, {
        name: String(form.get('name') ?? '').trim(),
        phone: String(form.get('phone') ?? '').trim() || null,
        role: String(form.get('role') ?? ''),
        isActive: form.get('isActive') === 'true'
      })
      setEditOpen(false)
      showToast('Account updated')
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't update account")
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const pw = String(form.get('newPassword') ?? '')
    const conf = String(form.get('confirm') ?? '')
    if (pw !== conf) {
      showToast('Passwords do not match')
      return
    }
    setResetting(true)
    try {
      await onResetPassword(staff.id, pw)
      setResetOpen(false)
      showToast(`Password reset for ${staff.name}`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't reset password")
    } finally {
      setResetting(false)
    }
  }

  return (
    <div
      className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
      style={{ opacity: isActive ? 1 : 0.5, borderColor: theme.border }}
    >
      <div className="min-w-0">
        <p style={{ color: theme.text }} className="font-semibold text-sm">
          {staff.name} {isSelf && <span style={{ color: theme.muted }} className="text-xs font-normal">(you)</span>}
        </p>
        <p style={{ color: theme.muted }} className="text-xs truncate">
          {staff.email}
          {staff.phone ? ` · ${staff.phone}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <span
          style={{
            background: staff.role === 'admin' ? theme.amberBg : theme.primarySoft,
            color: staff.role === 'admin' ? theme.amber : theme.primaryText
          }}
          className="text-xs font-medium px-2 py-0.5 rounded-full capitalize flex items-center gap-1"
        >
          {staff.role === 'admin' && <ShieldCheck size={11} />}
          {staff.role}
        </span>
        {!isActive && (
          <span style={{ border: `1px solid ${theme.borderStrong}`, color: theme.muted }} className="text-xs px-2 py-0.5 rounded-full">
            Inactive
          </span>
        )}

        <button
          onClick={() => setEditOpen(true)}
          style={{ color: theme.muted }}
          className="flex items-center gap-1 h-8 px-2 rounded-lg text-xs font-medium transition-colors hover:bg-[color:var(--row-hover)]"
        >
          <Pencil size={12} /> Edit
        </button>
        <button
          onClick={() => setResetOpen(true)}
          style={{ color: theme.muted }}
          className="flex items-center gap-1 h-8 px-2 rounded-lg text-xs font-medium transition-colors hover:bg-[color:var(--row-hover)]"
        >
          <KeyRound size={12} /> Reset PW
        </button>
      </div>

      {/* Edit dialog */}
      {editOpen && (
        <Modal title={`Edit ${staff.name}`} onClose={() => setEditOpen(false)} width={440}>
          <form onSubmit={handleEdit} className="space-y-4">
            <label className="block">
              <span style={{ color: theme.muted }} className={labelCls}>
                Full name
              </span>
              <input name="name" defaultValue={staff.name} required style={inputStyle} className={inputCls} />
            </label>
            <label className="block">
              <span style={{ color: theme.muted }} className={labelCls}>
                Phone
              </span>
              <input name="phone" type="tel" defaultValue={staff.phone ?? ''} style={inputStyle} className={inputCls} />
            </label>
            <label className="block">
              <span style={{ color: theme.muted }} className={labelCls}>
                Access level
              </span>
              <select name="role" defaultValue={staff.role} disabled={isSelf} style={inputStyle} className={`${inputCls} disabled:opacity-50`}>
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </select>
              {isSelf && (
                <span style={{ color: theme.muted }} className="text-[11px] mt-1 block">
                  You cannot change your own role.
                </span>
              )}
            </label>
            <label className="block">
              <span style={{ color: theme.muted }} className={labelCls}>
                Account status
              </span>
              <select
                name="isActive"
                defaultValue={isActive ? 'true' : 'false'}
                disabled={isSelf}
                style={inputStyle}
                className={`${inputCls} disabled:opacity-50`}
              >
                <option value="true">Active</option>
                <option value="false">Deactivated</option>
              </select>
              {isSelf && (
                <span style={{ color: theme.muted }} className="text-[11px] mt-1 block">
                  You cannot deactivate your own account.
                </span>
              )}
            </label>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setEditOpen(false)} style={{ border: `1px solid ${theme.borderStrong}`, color: theme.text }} className="flex-1 rounded-lg py-2 text-sm font-medium">
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                style={{ background: 'linear-gradient(135deg, #22B57F 0%, #0E8A64 100%)' }}
                className="flex-1 rounded-lg py-2 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {saving && <Loader2 size={13} className="animate-spin" />} Save changes
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Reset password dialog */}
      {resetOpen && (
        <Modal title={`Reset password for ${staff.name}`} onClose={() => setResetOpen(false)} width={400}>
          <form onSubmit={handleReset} className="space-y-4">
            <label className="block">
              <span style={{ color: theme.muted }} className={labelCls}>
                New password
              </span>
              <input name="newPassword" type="password" minLength={6} required style={inputStyle} className={inputCls} />
            </label>
            <label className="block">
              <span style={{ color: theme.muted }} className={labelCls}>
                Confirm new password
              </span>
              <input name="confirm" type="password" minLength={6} required style={inputStyle} className={inputCls} />
            </label>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setResetOpen(false)} style={{ border: `1px solid ${theme.borderStrong}`, color: theme.text }} className="flex-1 rounded-lg py-2 text-sm font-medium">
                Cancel
              </button>
              <button
                type="submit"
                disabled={resetting}
                style={{ background: 'linear-gradient(135deg, #22B57F 0%, #0E8A64 100%)' }}
                className="flex-1 rounded-lg py-2 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {resetting && <Loader2 size={13} className="animate-spin" />}
                <Power size={13} /> Set password
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

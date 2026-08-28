import type { ReactElement } from 'react'
import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Building2, UserCircle, Lock, Tag, Save, ImagePlus, X, Loader2,
  Pencil, Check, Plus, Trash2, Coins
} from 'lucide-react'
import {
  useListCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
  useUpdateProfile,
  useChangePassword,
  getListCategoriesQueryKey,
  getGetMeQueryKey
} from '@workspace/api-client-react'
import type { Category } from '@workspace/api-client-react'
import { useUiStore } from '../store/uiStore'
import { getTheme, serif } from '../theme'
import { useAuth } from '../hooks/useAuth'
import { usePharmacySettings, useUpdatePharmacySettings } from '../hooks/usePharmacySettings'

// Display-only presets — NOT live exchange rates. Picking one just changes
// the label formatCurrency() uses everywhere; the underlying numbers never
// change. "Custom" lets a pharmacy type any symbol/code (e.g. "afg").
const CURRENCY_PRESETS: { label: string; symbol: string; position: 'prefix' | 'suffix' }[] = [
  { label: 'US Dollar ($)', symbol: '$', position: 'prefix' },
  { label: 'Euro (EUR)', symbol: '\u20AC', position: 'prefix' },
  { label: 'British Pound (GBP)', symbol: '\u00A3', position: 'prefix' },
  { label: 'Afghani (AFN)', symbol: 'AFN', position: 'suffix' },
  { label: 'Pakistani Rupee (PKR)', symbol: '\u20A8', position: 'prefix' },
  { label: 'Indian Rupee (INR)', symbol: '\u20B9', position: 'prefix' },
  { label: 'UAE Dirham (AED)', symbol: 'AED', position: 'prefix' },
  { label: 'Saudi Riyal (SAR)', symbol: 'SAR', position: 'suffix' }
]

export default function SettingsScreen(): ReactElement {
  const { dark } = useUiStore()
  const theme = getTheme(dark)
  const { user } = useAuth()

  const cardStyle = {
    background: theme.card,
    border: `1px solid ${theme.border}`,
    boxShadow: theme.shadow
  }
  const inputStyle = {
    background: theme.cardAlt,
    border: `1px solid ${theme.border}`,
    color: theme.text,
    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04)'
  }
  const labelCls = 'text-xs font-medium mb-1.5 block'
  const inputCls =
    'w-full text-sm rounded-lg px-3 py-2 outline-none placeholder:opacity-50 transition-all duration-150 focus:border-transparent focus:ring-2 focus:ring-emerald-500/40'

  return (
    <div className="p-7 max-w-3xl space-y-5">
      <div className="animate-fade-up">
        <h1 style={{ ...serif, color: theme.text }} className="text-xl font-semibold">
          Settings
        </h1>
        <p style={{ color: theme.muted }} className="text-xs mt-0.5">
          Manage your account and system configuration.
        </p>
      </div>

      {user?.role === 'admin' && (
        <PharmacySection cardStyle={cardStyle} inputStyle={inputStyle} labelCls={labelCls} inputCls={inputCls} />
      )}

      <ProfileSection cardStyle={cardStyle} inputStyle={inputStyle} labelCls={labelCls} inputCls={inputCls} />

      <PasswordSection cardStyle={cardStyle} inputStyle={inputStyle} labelCls={labelCls} inputCls={inputCls} />

      <CategoriesSection cardStyle={cardStyle} inputStyle={inputStyle} inputCls={inputCls} />
    </div>
  )
}

// Shared section header
function SectionHeader({
  icon: Icon,
  title,
  description,
  theme
}: {
  icon: typeof Building2
  title: string
  description: string
  theme: ReturnType<typeof getTheme>
}): ReactElement {
  return (
    <div className="flex items-center gap-3">
      <span style={{ background: theme.primarySoft, color: theme.primaryText }} className="p-2 rounded-lg shrink-0">
        <Icon size={16} />
      </span>
      <div>
        <h2 style={{ color: theme.text }} className="text-sm font-semibold tracking-tight">
          {title}
        </h2>
        <p style={{ color: theme.muted }} className="text-xs">
          {description}
        </p>
      </div>
    </div>
  )
}

// ── Pharmacy Settings (admin only) ──────────────────────────────────────────

function PharmacySection({
  cardStyle,
  inputStyle,
  labelCls,
  inputCls
}: {
  cardStyle: React.CSSProperties
  inputStyle: React.CSSProperties
  labelCls: string
  inputCls: string
}): ReactElement {
  const { dark, showToast } = useUiStore()
  const theme = getTheme(dark)
  const { data: pharmacySettings, isLoading } = usePharmacySettings()
  const updateSettings = useUpdatePharmacySettings()
  const logoInputRef = useRef<HTMLInputElement>(null)

  const [pharmName, setPharmName] = useState('')
  const [pharmAddress, setPharmAddress] = useState('')
  const [pharmPhone, setPharmPhone] = useState('')
  const [pharmEmail, setPharmEmail] = useState('')
  const [pharmLicense, setPharmLicense] = useState('')
  const [pharmTax, setPharmTax] = useState('')
  const [pharmLogo, setPharmLogo] = useState<string | null>(null)
  const [currencySymbol, setCurrencySymbol] = useState('$')
  const [currencyPosition, setCurrencyPosition] = useState<'prefix' | 'suffix'>('prefix')
  const [initialised, setInitialised] = useState(false)

  // Populate form once data arrives (web does the same render-phase init)
  if (pharmacySettings && !initialised) {
    setPharmName(pharmacySettings.name ?? '')
    setPharmAddress(pharmacySettings.address ?? '')
    setPharmPhone(pharmacySettings.phone ?? '')
    setPharmEmail(pharmacySettings.email ?? '')
    setPharmLicense(pharmacySettings.licenseNumber ?? '')
    setPharmTax(pharmacySettings.taxRatePercent ?? '0')
    setPharmLogo(pharmacySettings.logoUrl ?? null)
    setCurrencySymbol(pharmacySettings.currencySymbol ?? '$')
    setCurrencyPosition(pharmacySettings.currencyPosition ?? 'prefix')
    setInitialised(true)
  }

  const handleLogoFile = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      showToast('Logo must be under 2 MB')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setPharmLogo(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleSave = (e: React.FormEvent): void => {
    e.preventDefault()
    const taxVal = parseFloat(pharmTax)
    if (isNaN(taxVal) || taxVal < 0 || taxVal > 100) {
      showToast('Tax rate must be between 0 and 100')
      return
    }
    updateSettings.mutate(
      {
        name: pharmName.trim() || 'My Pharmacy',
        address: pharmAddress.trim() || null,
        phone: pharmPhone.trim() || null,
        email: pharmEmail.trim() || null,
        licenseNumber: pharmLicense.trim() || null,
        taxRatePercent: taxVal.toFixed(2),
        logoUrl: pharmLogo || null,
        currencySymbol: currencySymbol.trim() || '$',
        currencyPosition
      },
      {
        onSuccess: () => showToast('Pharmacy settings saved'),
        onError: (err) => showToast(err instanceof Error ? err.message : "Couldn't save settings")
      }
    )
  }

  const selectedPreset =
    CURRENCY_PRESETS.find((p) => p.symbol === currencySymbol && p.position === currencyPosition)?.symbol ?? 'custom'

  return (
    <div style={cardStyle} className="rounded-xl p-5">
      <div className="mb-5">
        <SectionHeader
          icon={Building2}
          title="Pharmacy Settings"
          description="Name, contact info, logo, and tax rate printed on every receipt."
          theme={theme}
        />
      </div>

      {isLoading ? (
        <div style={{ color: theme.muted }} className="flex items-center gap-2 py-6 text-sm">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          {/* Logo upload */}
          <div>
            <span style={{ color: theme.muted }} className={labelCls}>
              Logo
            </span>
            <div className="flex items-center gap-4">
              {pharmLogo ? (
                <div
                  style={{ border: `1px solid ${theme.border}`, background: theme.cardAlt }}
                  className="relative h-16 w-16 rounded-lg overflow-hidden flex items-center justify-center"
                >
                  {/* eslint-disable-next-line jsx-a11y/alt-text */}
                  <img src={pharmLogo} alt="Logo preview" className="h-full w-full object-contain p-1" />
                  <button
                    type="button"
                    onClick={() => {
                      setPharmLogo(null)
                      if (logoInputRef.current) logoInputRef.current.value = ''
                    }}
                    style={{ background: theme.card, color: theme.red }}
                    className="absolute top-0.5 right-0.5 rounded-full p-0.5 shadow"
                  >
                    <X size={11} />
                  </button>
                </div>
              ) : (
                <div
                  style={{ border: `1px dashed ${theme.borderStrong}`, background: theme.cardAlt, color: theme.muted }}
                  className="h-16 w-16 rounded-lg flex items-center justify-center"
                >
                  <ImagePlus size={18} />
                </div>
              )}
              <div>
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  style={{ border: `1px solid ${theme.borderStrong}`, color: theme.text }}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors hover:bg-[color:var(--row-hover)]"
                >
                  <ImagePlus size={12} /> {pharmLogo ? 'Change logo' : 'Upload logo'}
                </button>
                <p style={{ color: theme.muted }} className="text-xs mt-1">
                  PNG or SVG, max 2 MB
                </p>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/svg+xml,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleLogoFile}
                />
              </div>
            </div>
          </div>

          {/* Name + License */}
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span style={{ color: theme.muted }} className={labelCls}>
                Pharmacy name <span style={{ color: theme.red }}>*</span>
              </span>
              <input
                value={pharmName}
                onChange={(e) => setPharmName(e.target.value)}
                placeholder="My Pharmacy"
                required
                style={inputStyle}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span style={{ color: theme.muted }} className={labelCls}>
                Licence / registration number
              </span>
              <input
                value={pharmLicense}
                onChange={(e) => setPharmLicense(e.target.value)}
                placeholder="e.g. PHA-00123"
                style={inputStyle}
                className={inputCls}
              />
            </label>
          </div>

          {/* Address */}
          <label className="block">
            <span style={{ color: theme.muted }} className={labelCls}>
              Address
            </span>
            <input
              value={pharmAddress}
              onChange={(e) => setPharmAddress(e.target.value)}
              placeholder="123 Main St, City, Country"
              style={inputStyle}
              className={inputCls}
            />
          </label>

          {/* Phone + Email */}
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span style={{ color: theme.muted }} className={labelCls}>
                Phone
              </span>
              <input
                type="tel"
                value={pharmPhone}
                onChange={(e) => setPharmPhone(e.target.value)}
                placeholder="+1 555 000 0000"
                style={inputStyle}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span style={{ color: theme.muted }} className={labelCls}>
                Email
              </span>
              <input
                type="email"
                value={pharmEmail}
                onChange={(e) => setPharmEmail(e.target.value)}
                placeholder="info@mypharmacy.com"
                style={inputStyle}
                className={inputCls}
              />
            </label>
          </div>

          {/* Tax rate */}
          <label className="block max-w-[200px]">
            <span style={{ color: theme.muted }} className={labelCls}>
              Tax rate (%)
            </span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={pharmTax}
              onChange={(e) => setPharmTax(e.target.value)}
              placeholder="0.00"
              style={inputStyle}
              className={inputCls}
            />
            <span style={{ color: theme.muted }} className="text-xs mt-1 block">
              Applied automatically to every sale. Set to 0 to disable.
            </span>
          </label>

          {/* Currency */}
          <div style={{ borderTop: `1px solid ${theme.border}` }} className="pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <Coins size={14} color={theme.muted} />
              <span style={{ color: theme.text }} className="text-sm font-medium">
                Currency
              </span>
            </div>
            <p style={{ color: theme.muted }} className="text-xs -mt-1.5">
              Display only — no exchange rate is applied. This changes how amounts are labeled everywhere (e.g. "200
              AFN" or "$200.00"); the numbers themselves never change.
            </p>
            <div className="grid grid-cols-3 gap-4">
              <label className="block">
                <span style={{ color: theme.muted }} className={labelCls}>
                  Preset
                </span>
                <select
                  value={selectedPreset}
                  onChange={(e) => {
                    const val = e.target.value
                    if (val === 'custom') return
                    const preset = CURRENCY_PRESETS.find((p) => p.symbol === val)
                    if (preset) {
                      setCurrencySymbol(preset.symbol)
                      setCurrencyPosition(preset.position)
                    }
                  }}
                  style={inputStyle}
                  className={inputCls}
                >
                  {CURRENCY_PRESETS.map((p) => (
                    <option key={p.symbol} value={p.symbol}>
                      {p.label}
                    </option>
                  ))}
                  <option value="custom">Custom…</option>
                </select>
              </label>
              <label className="block">
                <span style={{ color: theme.muted }} className={labelCls}>
                  Symbol / code
                </span>
                <input
                  value={currencySymbol}
                  onChange={(e) => setCurrencySymbol(e.target.value)}
                  placeholder="e.g. $ or afg"
                  maxLength={10}
                  style={inputStyle}
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span style={{ color: theme.muted }} className={labelCls}>
                  Position
                </span>
                <select
                  value={currencyPosition}
                  onChange={(e) => setCurrencyPosition(e.target.value as 'prefix' | 'suffix')}
                  style={inputStyle}
                  className={inputCls}
                >
                  <option value="prefix">Before amount ($200.00)</option>
                  <option value="suffix">After amount (200.00 afg)</option>
                </select>
              </label>
            </div>
            <p className="text-sm font-medium" style={{ color: theme.muted }}>
              Preview:{' '}
              <span style={{ color: theme.primaryText }}>
                {currencyPosition === 'prefix' ? `${currencySymbol}1,234.56` : `1,234.56 ${currencySymbol}`}
              </span>
            </p>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={updateSettings.isPending}
              style={{ background: 'linear-gradient(135deg, #22B57F 0%, #0E8A64 100%)' }}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-white text-sm font-semibold transition-transform active:scale-[0.98]"
            >
              {updateSettings.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {updateSettings.isPending ? 'Saving…' : 'Save pharmacy settings'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

// ── Profile ─────────────────────────────────────────────────────────────────

function ProfileSection({
  cardStyle,
  inputStyle,
  labelCls,
  inputCls
}: {
  cardStyle: React.CSSProperties
  inputStyle: React.CSSProperties
  labelCls: string
  inputCls: string
}): ReactElement {
  const { dark, showToast } = useUiStore()
  const theme = getTheme(dark)
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [name, setName] = useState(user?.name ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')

  const updateProfile = useUpdateProfile({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() })
        showToast('Profile updated')
      },
      onError: (err: Error) => showToast(err.message || "Couldn't update profile")
    }
  })

  const handleSave = (e: React.FormEvent): void => {
    e.preventDefault()
    updateProfile.mutate({ data: { name: name.trim(), phone: phone.trim() || null } })
  }

  const initial = user?.name?.trim()?.[0]?.toUpperCase() ?? '?'

  return (
    <div style={cardStyle} className="rounded-xl p-5">
      <div className="mb-5">
        <SectionHeader
          icon={UserCircle}
          title="Profile Details"
          description="Update your name and phone number."
          theme={theme}
        />
      </div>

      <div
        style={{ borderBottom: `1px solid ${theme.border}` }}
        className="flex items-center gap-4 pb-4 mb-4"
      >
        <div
          style={{ background: 'linear-gradient(135deg, #34D399, #0B6B4F)' }}
          className="w-14 h-14 rounded-full flex items-center justify-center text-white text-lg font-semibold shrink-0"
        >
          {initial}
        </div>
        <div>
          <p style={{ color: theme.text }} className="font-semibold">
            {user?.name}
          </p>
          <p style={{ color: theme.muted }} className="text-xs capitalize">
            {user?.role} Account
          </p>
          <p style={{ color: theme.muted }} className="text-xs">
            {user?.email}
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span style={{ color: theme.muted }} className={labelCls}>
              Full Name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              required
              style={inputStyle}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span style={{ color: theme.muted }} className={labelCls}>
              Phone Number
            </span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +1 555 000 0000"
              style={inputStyle}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span style={{ color: theme.muted }} className={labelCls}>
              Email Address
            </span>
            <input value={user?.email ?? ''} readOnly disabled style={inputStyle} className={`${inputCls} opacity-60`} />
            <span style={{ color: theme.muted }} className="text-xs mt-1 block">
              Email cannot be changed here.
            </span>
          </label>
          <label className="block">
            <span style={{ color: theme.muted }} className={labelCls}>
              Member Since
            </span>
            <input
              value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : ''}
              readOnly
              disabled
              style={inputStyle}
              className={`${inputCls} opacity-60`}
            />
          </label>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={updateProfile.isPending}
            style={{ background: 'linear-gradient(135deg, #22B57F 0%, #0E8A64 100%)' }}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-white text-sm font-semibold transition-transform active:scale-[0.98]"
          >
            <Save size={14} />
            {updateProfile.isPending ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ── Password ────────────────────────────────────────────────────────────────

function PasswordSection({
  cardStyle,
  inputStyle,
  labelCls,
  inputCls
}: {
  cardStyle: React.CSSProperties
  inputStyle: React.CSSProperties
  labelCls: string
  inputCls: string
}): ReactElement {
  const { dark, showToast } = useUiStore()
  const theme = getTheme(dark)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const changePassword = useChangePassword({
    mutation: {
      onSuccess: () => {
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        showToast('Password changed successfully')
      },
      onError: (err: Error) => showToast(err.message || "Couldn't change password")
    }
  })

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match')
      return
    }
    if (newPassword.length < 6) {
      showToast('New password must be at least 6 characters')
      return
    }
    changePassword.mutate({ data: { currentPassword, newPassword } })
  }

  return (
    <div style={cardStyle} className="rounded-xl p-5">
      <div className="mb-5">
        <SectionHeader
          icon={Lock}
          title="Change Password"
          description="Enter your current password then choose a new one."
          theme={theme}
        />
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span style={{ color: theme.muted }} className={labelCls}>
            Current Password
          </span>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Your current password"
            required
            autoComplete="current-password"
            style={inputStyle}
            className={inputCls}
          />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span style={{ color: theme.muted }} className={labelCls}>
              New Password
            </span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 6 characters"
              required
              autoComplete="new-password"
              style={inputStyle}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span style={{ color: theme.muted }} className={labelCls}>
              Confirm New Password
            </span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat new password"
              required
              autoComplete="new-password"
              style={inputStyle}
              className={inputCls}
            />
          </label>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={changePassword.isPending}
            style={{ background: 'linear-gradient(135deg, #22B57F 0%, #0E8A64 100%)' }}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-white text-sm font-semibold transition-transform active:scale-[0.98]"
          >
            <Lock size={13} />
            {changePassword.isPending ? 'Changing…' : 'Change Password'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ── Medicine Categories ─────────────────────────────────────────────────────

function CategoriesSection({
  cardStyle,
  inputStyle,
  inputCls
}: {
  cardStyle: React.CSSProperties
  inputStyle: React.CSSProperties
  inputCls: string
}): ReactElement {
  const { dark, showToast } = useUiStore()
  const theme = getTheme(dark)
  const queryClient = useQueryClient()

  const { data: categories = [], isLoading } = useListCategories()
  const createCategory = useCreateCategory({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() })
        setNewCategoryName('')
        setNewCategoryDescription('')
        showToast('Category created')
      },
      onError: () => showToast("Couldn't create category")
    }
  })
  const deleteCategory = useDeleteCategory({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() })
        showToast('Category deleted')
      },
      onError: () => showToast("Couldn't delete category")
    }
  })
  const updateCategory = useUpdateCategory({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() })
        setEditingCategoryId(null)
        showToast('Category updated')
      },
      onError: () => showToast("Couldn't update category")
    }
  })

  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryDescription, setNewCategoryDescription] = useState('')
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null)
  const [editCategoryName, setEditCategoryName] = useState('')
  const [editCategoryDescription, setEditCategoryDescription] = useState('')

  const startEdit = (cat: Category): void => {
    setEditingCategoryId(cat.id)
    setEditCategoryName(cat.name)
    setEditCategoryDescription(cat.description ?? '')
  }

  const handleSaveCategory = (id: number): void => {
    if (!editCategoryName.trim()) return
    updateCategory.mutate({
      id,
      data: { name: editCategoryName.trim(), description: editCategoryDescription.trim() || undefined }
    })
  }

  const handleAddCategory = (e: React.FormEvent): void => {
    e.preventDefault()
    if (!newCategoryName.trim()) return
    createCategory.mutate({
      data: { name: newCategoryName.trim(), description: newCategoryDescription.trim() || undefined }
    })
  }

  return (
    <div style={cardStyle} className="rounded-xl p-5">
      <div className="mb-5">
        <SectionHeader
          icon={Tag}
          title="Medicine Categories"
          description="Categories available when adding medicines."
          theme={theme}
        />
      </div>

      <form onSubmit={handleAddCategory} className="flex gap-2 mb-4">
        <input
          placeholder="Category name (e.g. Antibiotics)"
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          required
          style={inputStyle}
          className={`${inputCls} flex-1`}
        />
        <input
          placeholder="Description (optional)"
          value={newCategoryDescription}
          onChange={(e) => setNewCategoryDescription(e.target.value)}
          style={inputStyle}
          className={`${inputCls} flex-1`}
        />
        <button
          type="submit"
          disabled={createCategory.isPending || !newCategoryName.trim()}
          style={{ background: 'linear-gradient(135deg, #22B57F 0%, #0E8A64 100%)' }}
          className="shrink-0 flex items-center gap-1 rounded-lg px-3.5 text-white text-sm font-semibold transition-transform active:scale-[0.98] disabled:opacity-50"
        >
          <Plus size={14} /> Add
        </button>
      </form>

      {isLoading ? (
        <p style={{ color: theme.muted }} className="text-sm">
          Loading…
        </p>
      ) : categories.length === 0 ? (
        <p style={{ color: theme.muted }} className="text-sm py-4 text-center">
          No categories yet. Add one above to get started.
        </p>
      ) : (
        <div style={{ border: `1px solid ${theme.border}` }} className="rounded-lg overflow-hidden divide-y" >
          {categories.map((cat) => (
            <div key={cat.id} className="px-4 py-3" style={{ borderColor: theme.border }}>
              {editingCategoryId === cat.id ? (
                <div className="flex items-center gap-2">
                  <input
                    value={editCategoryName}
                    onChange={(e) => setEditCategoryName(e.target.value)}
                    placeholder="Category name"
                    autoFocus
                    style={inputStyle}
                    className="h-8 text-sm flex-1 rounded-md px-2 outline-none"
                  />
                  <input
                    value={editCategoryDescription}
                    onChange={(e) => setEditCategoryDescription(e.target.value)}
                    placeholder="Description (optional)"
                    style={inputStyle}
                    className="h-8 text-sm flex-1 rounded-md px-2 outline-none"
                  />
                  <button
                    onClick={() => handleSaveCategory(cat.id)}
                    disabled={updateCategory.isPending || !editCategoryName.trim()}
                    title="Save"
                    style={{ color: theme.primaryText }}
                    className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-[color:var(--row-hover)] disabled:opacity-40"
                  >
                    <Check size={15} />
                  </button>
                  <button
                    onClick={() => setEditingCategoryId(null)}
                    title="Cancel"
                    style={{ color: theme.muted }}
                    className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-[color:var(--row-hover)]"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p style={{ color: theme.text }} className="font-medium text-sm">
                      {cat.name}
                    </p>
                    {cat.description && (
                      <p style={{ color: theme.muted }} className="text-xs truncate">
                        {cat.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => startEdit(cat)}
                      title="Edit"
                      style={{ color: theme.muted }}
                      className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-[color:var(--row-hover)]"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => deleteCategory.mutate({ id: cat.id })}
                      disabled={deleteCategory.isPending}
                      title="Delete"
                      style={{ color: theme.red }}
                      className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-[color:var(--row-hover)] disabled:opacity-40"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

import type { ReactElement } from 'react'
import { useUiStore } from '../store/uiStore'
import { getTheme } from '../theme'

interface Props {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
  type?: string
  textarea?: boolean
}

export default function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  type = 'text',
  textarea
}: Props): ReactElement {
  const { dark } = useUiStore()
  const theme = getTheme(dark)
  const shared = {
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    placeholder,
    style: {
      background: theme.cardAlt,
      border: `1px solid ${theme.border}`,
      color: theme.text,
      boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04)'
    },
    className:
      'w-full text-sm rounded-lg px-3 py-2 outline-none placeholder:opacity-50 transition-all duration-150 focus:border-transparent focus:ring-2 focus:ring-emerald-500/40'
  }
  return (
    <label className="block mb-3 group">
      <span style={{ color: theme.muted }} className="text-xs mb-1.5 block font-medium">
        {label}
        {required && <span style={{ color: theme.red }}> *</span>}
      </span>
      {textarea ? <textarea rows={2} {...shared} /> : <input type={type} {...shared} />}
    </label>
  )
}

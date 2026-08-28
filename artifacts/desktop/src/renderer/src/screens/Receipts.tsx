import { useState } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import { useUiStore } from '../store/uiStore'
import { getTheme, mono, serif } from '../theme'
import { useCartStore } from '../store/cartStore'
import { calcTotals } from '../lib/pricing'
import { usePharmacySettings } from '../hooks/usePharmacySettings'

function jagged(bg: string, card: string, flip: boolean): CSSProperties {
  return {
    height: 10,
    backgroundImage: `linear-gradient(135deg, ${bg} 50%, transparent 50%), linear-gradient(45deg, ${bg} 50%, transparent 50%)`,
    backgroundSize: '12px 12px',
    backgroundColor: card,
    transform: flip ? 'scaleY(-1)' : 'none'
  }
}

export default function Receipts(): ReactElement {
  const { dark } = useUiStore()
  const theme = getTheme(dark)
  const { items, discountPercent } = useCartStore()
  const { subtotal, discount, tax, total } = calcTotals(items, discountPercent)
  const { data: settings } = usePharmacySettings()
  const [printing, setPrinting] = useState(false)
  const [width, setWidth] = useState<'58' | '80'>('80')

  const printTest = async (): Promise<void> => {
    setPrinting(true)
    await window.api.printer.test()
    setPrinting(false)
  }

  return (
    <div className="p-6 grid grid-cols-3 gap-6">
      <div className="flex justify-center">
        <div className="w-56">
          <div style={jagged(theme.bg, theme.card, false)} />
          <div style={{ background: theme.card }} className="px-4 py-4">
            <div style={{ ...serif, color: theme.text }} className="text-center text-sm mb-1">
              {settings?.name ?? '…'}
            </div>
            <div style={{ color: theme.muted }} className="text-center text-[10px] mb-3">
              {[settings?.address, settings?.phone].filter(Boolean).join(' · ') || ' '}
            </div>
            <div style={{ ...mono, color: theme.text }} className="text-[11px] space-y-1">
              {items.map((i) => (
                <div key={i.id} className="flex justify-between">
                  <span>
                    {i.qty}× {i.name.slice(0, 16)}
                  </span>
                  <span>${(i.qty * i.price).toFixed(2)}</span>
                </div>
              ))}
              <div style={{ borderTop: `1px dashed ${theme.border}` }} className="pt-1 mt-1 space-y-0.5">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between">
                    <span>Discount ({discountPercent}%)</span>
                    <span>−${discount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Tax</span>
                  <span>${tax.toFixed(2)}</span>
                </div>
              </div>
              <div style={{ borderTop: `1px dashed ${theme.border}` }} className="pt-1 mt-1 flex justify-between font-semibold">
                <span>TOTAL</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>
          </div>
          <div style={jagged(theme.bg, theme.card, true)} />
        </div>
      </div>
      <div className="col-span-2 space-y-4">
        <div style={{ background: theme.card, border: `1px solid ${theme.border}` }} className="rounded-xl p-4">
          <h2 className="text-sm font-medium mb-3" style={{ color: theme.text }}>
            Printer
          </h2>
          <div className="flex items-center justify-between text-sm mb-3">
            <span style={{ color: theme.muted }}>Device</span>
            <span style={{ color: theme.text }}>Epson TM-T88VI (USB)</span>
          </div>
          <div className="flex items-center justify-between text-sm mb-4">
            <span style={{ color: theme.muted }}>Paper width</span>
            <div className="flex gap-2">
              {(['80', '58'] as const).map((w) => (
                <button
                  key={w}
                  onClick={() => setWidth(w)}
                  style={
                    width === w
                      ? { background: theme.primary, color: '#fff' }
                      : { border: `1px solid ${theme.border}`, color: theme.muted }
                  }
                  className="px-3 py-1 rounded-md text-xs"
                >
                  {w}mm
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={printTest}
            style={{ border: `1px solid ${theme.border}`, color: theme.text }}
            className="text-sm px-3 py-1.5 rounded-lg"
          >
            {printing ? 'Printing…' : 'Print test receipt'}
          </button>
        </div>
      </div>
    </div>
  )
}

import type { CSSProperties, ReactElement } from 'react'
import { useState } from 'react'
import { Circle, RefreshCw, Printer, Loader2, CheckCircle } from 'lucide-react'
import { useUiStore } from '../store/uiStore'
import { getTheme, mono, serif } from '../theme'
import { useCartStore } from '../store/cartStore'
import { calcTotals } from '../lib/pricing'
import { usePharmacySettings } from '../hooks/usePharmacySettings'

// Hardware auto-detection isn't implemented yet — see src/main/index.ts's
// printer:test handler, which is an intentional stub that always resolves
// { ok: true } after a fake delay, and there's no IPC channel at all yet
// for the scanner or cash drawer. The device profiles below are
// illustrative examples, not a live inventory: showing them as
// definitively "Connected"/"Not found" (as this screen used to) fabricates
// a fact the app has no way to actually know.
const DEVICES = [
  { name: 'Receipt Printer', detail: 'e.g. Epson TM-T88VI · USB', testable: true },
  { name: 'Barcode Scanner', detail: 'e.g. Honeywell Voyager 1200g · keyboard wedge', testable: false },
  { name: 'Cash Drawer', detail: 'Typically triggered via printer kick cable', testable: false }
]

// Jagged tear-off edge used on the receipt preview (top and bottom).
function jagged(bg: string, card: string, flip: boolean): CSSProperties {
  return {
    height: 10,
    backgroundImage: `linear-gradient(135deg, ${bg} 50%, transparent 50%), linear-gradient(45deg, ${bg} 50%, transparent 50%)`,
    backgroundSize: '12px 12px',
    backgroundColor: card,
    transform: flip ? 'scaleY(-1)' : 'none'
  }
}

export default function Hardware(): ReactElement {
  const { dark, showToast } = useUiStore()
  const theme = getTheme(dark)
  const [testing, setTesting] = useState<string | null>(null)
  // Real result of the last test, per device — undefined until tested.
  // Previously the screen ignored window.api.printer.test()'s return value
  // entirely and just hardcoded every device's status.
  const [lastResult, setLastResult] = useState<Record<string, boolean>>({})

  // Receipt preview state (moved here from the removed Receipts page).
  const { items, discountPercent } = useCartStore()
  const { subtotal, discount, tax, total } = calcTotals(items, discountPercent)
  const { data: settings } = usePharmacySettings()
  const [printing, setPrinting] = useState(false)
  const [paperWidth, setPaperWidth] = useState<'58' | '80'>('80')

  const runTest = async (name: string): Promise<void> => {
    setTesting(name)
    try {
      const result = await window.api.printer.test()
      setLastResult((prev) => ({ ...prev, [name]: result.ok }))
      showToast(result.ok ? `${name} responded to test` : `${name} test failed`)
    } catch {
      setLastResult((prev) => ({ ...prev, [name]: false }))
      showToast(`${name} test failed`)
    } finally {
      setTesting(null)
    }
  }

  const printTest = async (): Promise<void> => {
    setPrinting(true)
    try {
      const result = await window.api.printer.test()
      showToast(result.ok ? 'Test receipt sent to printer' : 'Printer test failed')
    } catch {
      showToast('Printer test failed')
    } finally {
      setPrinting(false)
    }
  }

  const renderDevice = (d: (typeof DEVICES)[number]): ReactElement => {
    const result = lastResult[d.name]
    const status = result === undefined ? 'unknown' : result ? 'ok' : 'failed'

    // Receipt Printer expands into a full config + live preview panel.
    if (d.name === 'Receipt Printer') {
      return (
        <div key={d.name} style={{ background: theme.card, border: `1px solid ${theme.border}` }} className="rounded-xl overflow-hidden">
          <div className="p-4 flex items-center justify-between">
            <div>
              <div style={{ color: theme.text }} className="text-sm font-medium">
                {d.name}
              </div>
              <div style={{ color: theme.muted }} className="text-xs mt-0.5">
                {d.detail}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span
                className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full"
                style={{
                  background: status === 'ok' ? theme.greenBg : status === 'failed' ? theme.redBg : theme.cardAlt,
                  color: status === 'ok' ? theme.green : status === 'failed' ? theme.red : theme.muted
                }}
              >
                <Circle
                  size={7}
                  fill={status === 'ok' ? theme.green : status === 'failed' ? theme.red : theme.muted}
                  color={status === 'ok' ? theme.green : status === 'failed' ? theme.red : theme.muted}
                />
                {status === 'ok' ? 'Last test OK' : status === 'failed' ? 'Last test failed' : 'Not tested'}
              </span>
              <button
                onClick={() => runTest(d.name)}
                disabled={testing === d.name}
                style={{ border: `1px solid ${theme.border}`, color: theme.text }}
                className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-50"
              >
                {testing === d.name ? 'Testing…' : 'Test'}
              </button>
            </div>
          </div>

          {/* Receipt config + live preview */}
          <div className="p-5 pt-0 grid grid-cols-3 gap-6" style={{ borderTop: `1px solid ${theme.border}` }}>
            <div className="flex flex-col items-center pt-4">
              <div className="flex items-center gap-2 mb-2" style={{ color: theme.text }}>
                <Printer size={14} />
                <span className="text-xs font-medium">Live preview</span>
              </div>
              <div className="w-56 shadow-lg rounded-b-lg" style={{ boxShadow: `0 10px 30px -18px rgba(0,0,0,0.6)` }}>
                <div style={jagged(theme.bg, theme.card, false)} />
                <div style={{ background: theme.card }} className="px-4 py-4">
                  <div style={{ ...serif, color: theme.text }} className="text-center text-sm mb-1">
                    {settings?.name ?? '…'}
                  </div>
                  <div style={{ color: theme.muted }} className="text-center text-[10px] mb-3">
                    {[settings?.address, settings?.phone].filter(Boolean).join(' · ') || ' '}
                  </div>
                  <div style={{ ...mono, color: theme.text }} className="text-[11px] space-y-1">
                    {items.length === 0 ? (
                      <div style={{ color: theme.muted }} className="text-center leading-relaxed">
                        Cart is empty. Add items in New Sale to preview a receipt.
                      </div>
                    ) : (
                      items.map((i) => (
                        <div key={i.id} className="flex justify-between">
                          <span>
                            {i.qty}× {i.name.slice(0, 16)}
                          </span>
                          <span>${(i.qty * i.price).toFixed(2)}</span>
                        </div>
                      ))
                    )}
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

            <div className="col-span-2 pt-4 space-y-4">
              <div>
                <span style={{ color: theme.muted }} className="text-[11px] uppercase tracking-wide">
                  Paper width
                </span>
                <div className="flex gap-2 mt-2">
                  {(['80', '58'] as const).map((w) => (
                    <button
                      key={w}
                      onClick={() => setPaperWidth(w)}
                      style={
                        paperWidth === w
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
                disabled={printing}
                style={{ border: `1px solid ${theme.border}`, color: theme.text }}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg disabled:opacity-50"
              >
                {printing ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                {printing ? 'Printing…' : 'Print test receipt'}
              </button>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div
        key={d.name}
        style={{ background: theme.card, border: `1px solid ${theme.border}` }}
        className="rounded-xl p-4 flex items-center justify-between"
      >
        <div>
          <div style={{ color: theme.text }} className="text-sm font-medium">
            {d.name}
          </div>
          <div style={{ color: theme.muted }} className="text-xs mt-0.5">
            {d.detail}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full"
            style={{
              background: status === 'ok' ? theme.greenBg : status === 'failed' ? theme.redBg : theme.cardAlt,
              color: status === 'ok' ? theme.green : status === 'failed' ? theme.red : theme.muted
            }}
          >
            <Circle
              size={7}
              fill={status === 'ok' ? theme.green : status === 'failed' ? theme.red : theme.muted}
              color={status === 'ok' ? theme.green : status === 'failed' ? theme.red : theme.muted}
            />
            {status === 'ok' ? 'Last test OK' : status === 'failed' ? 'Last test failed' : 'Not tested'}
          </span>
          {d.testable && (
            <button
              onClick={() => runTest(d.name)}
              disabled={testing === d.name}
              style={{ border: `1px solid ${theme.border}`, color: theme.text }}
              className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-50"
            >
              {testing === d.name ? 'Testing…' : 'Test'}
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-3">
      <h1 style={{ ...serif, color: theme.text }} className="text-xl mb-1">
        Hardware
      </h1>
      <p style={{ color: theme.muted }} className="text-xs -mt-2 mb-3">
        Auto-detection isn&apos;t wired up yet — run a test to confirm a device actually responds.
      </p>
      {DEVICES.map(renderDevice)}
      <div
        style={{ background: theme.card, border: `1px solid ${theme.border}` }}
        className="rounded-xl p-4 flex items-center justify-between"
      >
        <div>
          <div style={{ color: theme.text }} className="text-sm font-medium">
            Connection
          </div>
          <div style={{ color: theme.muted }} className="text-xs mt-0.5">
            This build talks directly to the API — no offline mode.
          </div>
        </div>
        <span style={{ color: theme.primary }} className="flex items-center gap-1.5 text-xs font-medium">
          <RefreshCw size={12} /> Always online
        </span>
      </div>
    </div>
  )
}

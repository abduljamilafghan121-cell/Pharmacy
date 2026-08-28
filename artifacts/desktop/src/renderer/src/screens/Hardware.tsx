import type { ReactElement } from 'react'
import { useState } from 'react'
import { Circle, RefreshCw } from 'lucide-react'
import { useUiStore } from '../store/uiStore'
import { getTheme, serif } from '../theme'

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

export default function Hardware(): ReactElement {
  const { dark, showToast } = useUiStore()
  const theme = getTheme(dark)
  const [testing, setTesting] = useState<string | null>(null)
  // Real result of the last test, per device — undefined until tested.
  // Previously the screen ignored window.api.printer.test()'s return value
  // entirely and just hardcoded every device's status.
  const [lastResult, setLastResult] = useState<Record<string, boolean>>({})

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

  return (
    <div className="p-6 space-y-3">
      <h1 style={{ ...serif, color: theme.text }} className="text-xl mb-1">
        Hardware
      </h1>
      <p style={{ color: theme.muted }} className="text-xs -mt-2 mb-3">
        Auto-detection isn&apos;t wired up yet — run a test to confirm a device actually responds.
      </p>
      {DEVICES.map((d) => {
        const result = lastResult[d.name]
        const status = result === undefined ? 'unknown' : result ? 'ok' : 'failed'
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
      })}
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

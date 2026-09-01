import type { ReactElement } from 'react'
import { useState } from 'react'

import { useQueryClient } from '@tanstack/react-query'
import { useGetOrder, useUpdateOrderStatus, useCreatePayment, getGetOrderQueryKey, getListOrdersQueryKey } from '@workspace/api-client-react'
import type { PaymentInputMethod } from '@workspace/api-client-react'
import { useUiStore } from '../store/uiStore'
import { getTheme, mono, serif } from '../theme'
import { usePharmacySettings } from '../hooks/usePharmacySettings'
import { printReceipt, printDispensingLabel } from '../lib/printing'
import Modal from './Modal'
import Loading from './Loading'
import { Banknote, CreditCard, ShieldCheck, CheckCircle2, RotateCcw, User, Stethoscope, Printer, Package, Loader2, Tag, AlertTriangle } from 'lucide-react'

const PAYMENT_METHODS: [PaymentInputMethod, string, typeof Banknote][] = [
  ['cash', 'Cash', Banknote],
  ['card', 'Card / PoS', CreditCard],
  ['insurance', 'Insurance', ShieldCheck]
]

// Only pending/dispensed/cancelled are real order statuses (see
// orderStatusEnum in lib/db/src/schema/orders.ts) — 'delivered' and
// 'processing' don't exist in this schema and never match a real order.
const STATUS_COLOR: Record<string, 'ok' | 'low' | 'expiring'> = {
  dispensed: 'ok',
  pending: 'low',
  cancelled: 'expiring'
}

const PAYMENT_COLOR: Record<string, 'ok' | 'low' | 'expiring'> = {
  paid: 'ok',
  unpaid: 'low',
  refunded: 'expiring'
}

function Pill({ label, kind, theme }: { label: string; kind: 'ok' | 'low' | 'expiring'; theme: ReturnType<typeof getTheme> }): ReactElement {
  const bg = kind === 'ok' ? theme.greenBg : kind === 'low' ? theme.amberBg : theme.redBg
  const fg = kind === 'ok' ? theme.green : kind === 'low' ? theme.amber : theme.red
  return (
    <span style={{ background: bg, color: fg }} className="inline-block px-2 py-0.5 rounded-full text-xs capitalize">
      {label}
    </span>
  )
}

// The API returns a couple of fields (servedByName, sig, discountAmount,
// taxAmount) that aren't in the generated OpenAPI schema yet — web reads
// them via `as any` too. Read them the same defensive way here.
interface ExtraOrderFields {
  servedByName?: string | null
  discountAmount?: string | null
  taxAmount?: string | null
  patientName?: string | null
}
interface ExtraItemFields {
  sig?: string | null
}

export default function SaleDetail({ orderId, onClose }: { orderId: number; onClose: () => void }): ReactElement {
  const { dark, showToast } = useUiStore()
  const theme = getTheme(dark)
  const { data: settings } = usePharmacySettings()
  const queryClient = useQueryClient()
  const { data: order, isLoading } = useGetOrder(orderId, { query: { queryKey: getGetOrderQueryKey(orderId) } })
  const updateStatus = useUpdateOrderStatus()
  const createPayment = useCreatePayment()
  const [refundOpen, setRefundOpen] = useState(false)
  const [refundNote, setRefundNote] = useState('')
  const [collectOpen, setCollectOpen] = useState(false)
  const [collectMethod, setCollectMethod] = useState<PaymentInputMethod>('cash')
  const [collecting, setCollecting] = useState(false)

  const invalidate = (): void => {
    queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() })
    queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(orderId) })
  }

  const markDispensed = async (): Promise<void> => {
    try {
      await updateStatus.mutateAsync({ id: orderId, data: { status: 'dispensed' } })
      showToast('Sale marked as dispensed')
      invalidate()
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't update sale status")
    }
  }

  const confirmCollect = async (): Promise<void> => {
    setCollecting(true)
    try {
      await createPayment.mutateAsync({
        data: { orderId, amount: order!.total, method: collectMethod }
      })
      showToast('Payment collected — sale marked as paid')
      setCollectOpen(false)
      invalidate()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to collect payment')
    } finally {
      setCollecting(false)
    }
  }

  const isPaid = order?.paymentStatus === 'paid'
  const isUnpaid = order?.paymentStatus === 'unpaid'

  const confirmReturn = async (): Promise<void> => {
    try {
      await updateStatus.mutateAsync({
        id: orderId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { status: 'cancelled', ...(refundNote.trim() ? { refundNote: refundNote.trim() } : {}) } as any
      })
      showToast(isPaid ? 'Sale cancelled & payment refunded' : 'Sale cancelled & stock restored')
      setRefundOpen(false)
      setRefundNote('')
      invalidate()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to process return')
    }
  }

  if (isLoading || !order) {
    return (
      <Modal title="Sale" onClose={onClose}>
        <Loading label="Loading sale…" />
      </Modal>
    )
  }

  const isCancelled = order.status === 'cancelled'
  const isDispensed = order.status === 'dispensed'
  const extra = order as typeof order & ExtraOrderFields
  const subtotalNum = order.subtotal ? parseFloat(order.subtotal) : parseFloat(order.total)
  const discountNum = extra.discountAmount ? parseFloat(extra.discountAmount) : 0
  const taxNum = extra.taxAmount ? parseFloat(extra.taxAmount) : 0

  return (
    <Modal title={`Sale #${order.id.toString().padStart(4, '0')}`} onClose={onClose} width={640}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Pill label={order.status} kind={STATUS_COLOR[order.status] ?? 'ok'} theme={theme} />
          <span style={{ color: theme.muted }} className="text-xs">
            {new Date(order.createdAt).toLocaleString()}
          </span>
        </div>
        <button
          onClick={() =>
            printReceipt(
              {
                ...order,
                patientName: extra.patientName,
                servedByName: extra.servedByName,
                subtotal: extra.discountAmount || extra.taxAmount ? String(subtotalNum) : undefined,
                discountAmount: extra.discountAmount ?? undefined,
                taxAmount: extra.taxAmount ?? undefined,
                notes: extra.notes ?? order.notes ?? undefined
              } as any,
              settings
            )
          }
          style={{ background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors hover:bg-[color:var(--row-hover)]"
        >
          <Printer size={12} />
          Print Receipt
        </button>
      </div>

      <div style={{ border: `1px solid ${theme.border}` }} className="rounded-lg overflow-hidden mb-4">
        <div
          style={{ background: theme.cardAlt, borderBottom: `1px solid ${theme.border}`, color: theme.muted }}
          className="px-3 py-2 text-xs font-medium"
        >
          Items dispensed
        </div>
        {order.items.map((item, idx) => {
          const itemExtra = item as typeof item & ExtraItemFields
          return (
            <div
              key={item.id}
              style={{ borderTop: idx ? `1px solid ${theme.border}` : 'none' }}
              className="px-3 py-2.5 flex justify-between items-start gap-3"
            >
              <div className="min-w-0">
                <p style={{ color: theme.text }} className="text-sm font-medium">
                  {item.medicineName ?? `Medicine #${item.medicineId}`}
                </p>
                <p style={{ color: theme.muted }} className="text-xs">
                  Qty: {item.quantity}
                  {item.unitName ? ` ${item.unitName}` : ''} × {(parseFloat(item.price) / item.quantity).toFixed(2)}
                </p>
                {itemExtra.sig && (
                  <p style={{ color: theme.primary }} className="text-xs italic mt-0.5">
                    ↳ {itemExtra.sig}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  title="Print dispensing label"
                  onClick={() =>
                    printDispensingLabel(
                      {
                        patientName: extra.patientName,
                        medicineName: item.medicineName ?? `Medicine #${item.medicineId}`,
                        sig: itemExtra.sig,
                        qty: item.quantity,
                        unitName: item.unitName,
                        dispensedDate: order.createdAt
                      },
                      settings?.name ?? 'Pharmacy',
                      settings?.address
                    )
                  }
                  style={{ color: theme.muted }}
                  className="flex items-center gap-1 h-7 px-2 rounded-md text-xs transition-colors hover:bg-[color:var(--row-hover)]"
                >
                  <Tag size={12} /> Label
                </button>
                <p style={{ ...mono, color: theme.text }} className="text-sm font-semibold">
                  {item.price}
                </p>
              </div>
            </div>
          )
        })}
        <div style={{ borderTop: `1px solid ${theme.border}` }} className="px-3 py-2.5 space-y-1">
          <div className="flex justify-between text-xs" style={{ color: theme.muted }}>
            <span>Subtotal</span>
            <span style={mono}>{subtotalNum.toFixed(2)}</span>
          </div>
          {discountNum > 0 && (
            <div className="flex justify-between text-xs" style={{ color: theme.green }}>
              <span>Discount</span>
              <span style={mono}>−{discountNum.toFixed(2)}</span>
            </div>
          )}
          {taxNum > 0 && (
            <div className="flex justify-between text-xs" style={{ color: theme.muted }}>
              <span>Tax</span>
              <span style={mono}>{taxNum.toFixed(2)}</span>
            </div>
          )}
          <div
            style={{ borderTop: `1px solid ${theme.border}`, color: theme.text }}
            className="flex justify-between text-sm font-semibold pt-1"
          >
            <span>Total</span>
            <span style={mono}>{order.total}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div style={{ background: theme.cardAlt, border: `1px solid ${theme.border}` }} className="rounded-lg p-3 text-sm space-y-1.5">
          <p style={{ color: theme.muted }} className="text-xs font-medium mb-1">
            Details
          </p>
          <p className="flex items-center gap-1.5" style={{ color: theme.text }}>
            <User size={12} color={theme.muted} />
            {extra.patientName ?? 'Walk-in'}
          </p>
          <p className="flex items-center gap-1.5" style={{ color: theme.text }}>
            <Stethoscope size={12} color={theme.muted} />
            {extra.servedByName ?? '—'}
          </p>
        </div>
        <div style={{ background: theme.cardAlt, border: `1px solid ${theme.border}` }} className="rounded-lg p-3 text-sm">
          <p style={{ color: theme.muted }} className="text-xs font-medium mb-1.5">
            Payment
          </p>
          <Pill label={order.paymentStatus} kind={PAYMENT_COLOR[order.paymentStatus] ?? 'ok'} theme={theme} />
          {order.paymentStatus === 'refunded' && (
            <div style={{ background: theme.amberBg, color: theme.amber, border: `1px solid ${theme.amber}33` }} className="flex items-center gap-2 rounded-md p-2 mt-2 text-xs font-medium">
              <AlertTriangle size={12} />
              Payment has been refunded to the customer.
            </div>
          )}
          {isUnpaid && (
            <button
              onClick={() => setCollectOpen(true)}
              style={{
                background: 'linear-gradient(135deg, #34D399, #0B6B4F)',
                color: '#fff',
                boxShadow: '0 1px 4px rgba(11,107,79,0.35)'
              }}
              className="mt-2.5 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90"
            >
              <Banknote size={13} />
              Collect Payment · {order.total}
            </button>
          )}
        </div>
      </div>

      {order.notes && (
        <div style={{ background: theme.cardAlt, border: `1px solid ${theme.border}` }} className="rounded-lg p-3 mb-4">
          <p style={{ color: theme.muted }} className="text-xs mb-1">
            Notes
          </p>
          <p style={{ color: theme.text }} className="text-sm whitespace-pre-line">
            {order.notes}
          </p>
        </div>
      )}

      {!isCancelled ? (
        <div className="flex gap-2">
          <button
            onClick={markDispensed}
            disabled={isDispensed || updateStatus.isPending}
            style={{ border: `1px solid ${theme.border}`, color: theme.text }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm disabled:opacity-50"
          >
            <CheckCircle2 size={14} />
            Mark as Dispensed
          </button>
          <button
            onClick={() => setRefundOpen(true)}
            disabled={updateStatus.isPending}
            style={{ border: `1px solid ${theme.red}`, color: theme.red }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm disabled:opacity-50"
          >
            <RotateCcw size={14} />
            {isPaid ? 'Return & Refund' : 'Cancel Sale'}
          </button>
        </div>
      ) : (
        <div style={{ background: theme.cardAlt, color: theme.muted }} className="flex items-center gap-2 text-sm rounded-lg p-3">
          <Package size={14} />
          This sale has been cancelled. Stock has been restored.
        </div>
      )}

      {refundOpen && (
        <Modal title={isPaid ? 'Process return & refund' : 'Cancel sale'} onClose={() => setRefundOpen(false)}>
          <p style={{ color: theme.muted }} className="text-sm mb-3">
            This will return all items to inventory{isPaid ? ', mark the payment as refunded,' : ''} and set this sale
            to cancelled. This can&apos;t be undone.
          </p>
          <label className="block mb-3">
            <span style={{ color: theme.muted }} className="text-xs mb-1.5 block">
              Reason (optional)
            </span>
            <textarea
              rows={3}
              value={refundNote}
              onChange={(e) => setRefundNote(e.target.value)}
              placeholder="e.g. Wrong medicine dispensed, patient returned items…"
              style={{ background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }}
              className="w-full text-sm rounded-lg px-3 py-2 outline-none"
            />
          </label>
          <button
            onClick={confirmReturn}
            disabled={updateStatus.isPending}
            style={{ background: theme.red, color: '#fff' }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60"
          >
            {updateStatus.isPending && <Loader2 size={14} className="animate-spin" />}
            {updateStatus.isPending ? 'Processing…' : isPaid ? 'Confirm return & refund' : 'Confirm cancellation'}
          </button>
        </Modal>
      )}

      {collectOpen && isUnpaid && (
        <Modal title={`Collect payment — ${order.total}`} onClose={() => setCollectOpen(false)}>
          <p style={{ color: theme.muted }} className="text-sm mb-4">
            This sale was dispensed on credit and is marked unpaid. Record the payment to settle it:
          </p>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {PAYMENT_METHODS.map(([value, label, Icon]) => (
              <button
                key={value}
                onClick={() => setCollectMethod(value)}
                style={
                  collectMethod === value
                    ? {
                        background: theme.primarySoft,
                        border: `1px solid ${theme.primary}`,
                        color: theme.primaryText,
                        boxShadow: `0 0 0 3px ${theme.primary}14`
                      }
                    : { border: `1px solid ${theme.border}`, color: theme.muted, background: theme.cardAlt }
                }
                className="rounded-lg py-2.5 text-xs font-medium flex flex-col items-center gap-1 transition-all duration-150"
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
          <button
            onClick={confirmCollect}
            disabled={collecting}
            style={{ background: 'linear-gradient(135deg, #34D399, #0B6B4F)', color: '#fff' }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60"
          >
            {collecting && <Loader2 size={14} className="animate-spin" />}
            {collecting ? 'Recording…' : `Confirm payment of ${order.total}`}
          </button>
        </Modal>
      )}
    </Modal>
  )
}

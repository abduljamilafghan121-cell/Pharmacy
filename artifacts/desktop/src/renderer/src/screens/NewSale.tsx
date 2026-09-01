import type { ReactElement } from 'react'
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Search, Plus, Minus, Trash2, ShoppingBag, Pill, Scan,
  CheckCircle2, Loader2, Receipt, AlertTriangle, ShieldAlert, ShieldCheck, Lock,
  FileText, AlertCircle, X, ArrowRight, Banknote, CreditCard, CalendarClock
} from 'lucide-react'
import { useListMedicines, useCreateOrder, useGetMedicine, getListMedicinesQueryKey } from '@workspace/api-client-react'
import type { Medicine, MedicineUnit, OrderInputPaymentMethod } from '@workspace/api-client-react'
import { useUiStore } from '../store/uiStore'
import { getTheme, mono } from '../theme'
import { usePharmacySettings, formatCurrency } from '../hooks/usePharmacySettings'
import { formatStockDisplay, priceForUnit } from '../lib/stock-format'
import { useBarcodeScanner } from '../hooks/useBarcodeScanner'
import { apiUrl, authHeaders, jsonOrThrow } from '../lib/apiClient'
import Kbd from '../components/Kbd'

// The generated Medicine type hasn't caught up with the API yet — the server
// also returns barcode/controlledSchedule/drugClass (web reads them via `as
// any` too). Same defensive pattern as SaleDetail's ExtraOrderFields.
type MedicineRow = Medicine & {
  barcode?: string | null
  controlledSchedule?: string | null
  drugClass?: string | null
}

interface SaleItem {
  medicine: MedicineRow
  quantity: number
  unitId?: number
  unitName?: string
  conversionFactor: number
  sig?: string
}

interface DrugInteraction {
  id: number
  medicine1Id: number
  medicine1Name: string
  medicine2Id: number
  medicine2Name: string
  severity: 'minor' | 'moderate' | 'major' | 'contraindicated'
  description: string
}

interface PatientAllergy {
  id: number
  allergen: string
  severity: 'mild' | 'moderate' | 'severe'
  reaction?: string | null
}

interface ContraindicationWarning {
  id: number
  medicineId: number
  medicineName: string
  contraindicationType: string
  value: string
  severity: 'warn' | 'block'
  description: string
}

interface PrescriptionInfo {
  id: number
  patientName: string | null
  doctorName: string | null
  status: string
  maxRefills: number
  refillsUsed: number
}

interface GenericAlternative {
  id: number
  name: string
  genericName: string | null
  price: string
  quantity: number
  manufacturer: string | null
}

// 'credit' = "pay later" — goods are dispensed now, payment collected later
// (order is created with paymentStatus='unpaid'; settled via the Sales screen).
type PaymentChoice = OrderInputPaymentMethod | 'credit'

const PAYMENT_METHODS: [PaymentChoice, string, typeof Banknote][] = [
  ['cash', 'Cash', Banknote],
  ['card', 'Card / PoS', CreditCard],
  ['insurance', 'Insurance', ShieldCheck],
  ['credit', 'Pay Later', CalendarClock]
]

// Severity → theme tokens (mirrors web's SEVERITY_COLOR)
function severityStyle(
  theme: ReturnType<typeof getTheme>,
  severity: string
): { fg: string; bg: string; border: string } {
  switch (severity) {
    case 'contraindicated':
    case 'severe':
      return { fg: theme.red, bg: theme.redBg, border: theme.red }
    case 'major':
      return { fg: '#C2561F', bg: 'rgba(224,140,60,0.12)', border: '#C2561F' }
    case 'moderate':
      return { fg: theme.amber, bg: theme.amberBg, border: theme.amber }
    case 'minor':
    case 'mild':
    default:
      return { fg: theme.primary, bg: theme.primarySoft, border: theme.primary }
  }
}

function getUnits(medicine: MedicineRow): MedicineUnit[] {
  return medicine.units ?? []
}

function defaultUnit(medicine: MedicineRow): { unitId?: number; unitName?: string; conversionFactor: number } {
  const units = getUnits(medicine)
  if (units.length === 0) return { conversionFactor: 1 }
  const sorted = [...units].sort((a, b) => a.conversionFactorToBase - b.conversionFactorToBase)
  const base =
    sorted.find((u) => u.isBaseUnit && u.conversionFactorToBase === 1) ??
    sorted.find((u) => u.conversionFactorToBase === 1) ??
    sorted[0]
  return { unitId: base.id, unitName: base.unitName, conversionFactor: base.conversionFactorToBase }
}

export default function NewSale(): ReactElement {
  const {
    dark,
    offline,
    showToast,
    setScreen,
    setPendingSaleDetailId,
    pendingCheckoutMedicineId,
    setPendingCheckoutMedicineId
  } = useUiStore()
  const theme = getTheme(dark)
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [saleItems, setSaleItems] = useState<SaleItem[]>([])
  const [patientName, setPatientName] = useState('')
  const [patientId, setPatientId] = useState<number | null>(null)
  const [payment, setPayment] = useState<PaymentChoice>('cash')
  const [notes, setNotes] = useState('')
  const [discountAmount, setDiscountAmount] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [completedSale, setCompletedSale] = useState<any>(null)

  // Safety state
  const [interactions, setInteractions] = useState<DrugInteraction[]>([])
  const [allergies, setAllergies] = useState<PatientAllergy[]>([])
  const [allergyHits, setAllergyHits] = useState<string[]>([])
  const [overrideAllergy, setOverrideAllergy] = useState(false)
  const [contraindicationWarnings, setContraindicationWarnings] = useState<ContraindicationWarning[]>([])
  const [overrideContraindication, setOverrideContraindication] = useState(false)

  // Prescription state
  const [prescriptionId, setPrescriptionId] = useState<number | null>(null)
  const [prescriptionInput, setPrescriptionInput] = useState('')
  const [prescriptionInfo, setPrescriptionInfo] = useState<PrescriptionInfo | null>(null)
  const [prescriptionLoading, setPrescriptionLoading] = useState(false)

  // Generic substitution suggestions
  const [genericSuggestion, setGenericSuggestion] = useState<{
    brandId: number
    brandName: string
    alternatives: GenericAlternative[]
  } | null>(null)

  // Barcode scan mode
  const [scanMode, setScanMode] = useState(false)
  const [scanFlash, setScanFlash] = useState<string | null>(null)

  const searchRef = useRef<HTMLInputElement>(null)
  const discountRef = useRef<HTMLInputElement>(null)
  const qtyRefs = useRef<Record<number, HTMLInputElement | null>>({})
  const [focusedRowId, setFocusedRowId] = useState<number | null>(null)

  const { data: settings } = usePharmacySettings()
  const taxRatePct = parseFloat(settings?.taxRatePercent ?? '0')

  // Debounced search — avoids firing a request on every keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 150)
    return () => clearTimeout(t)
  }, [search])
  const medicineSearchParams = debouncedSearch.trim() ? { search: debouncedSearch.trim() } : undefined
  const { data: results } = useListMedicines(medicineSearchParams, {
    query: {
      queryKey: getListMedicinesQueryKey(medicineSearchParams),
      enabled: !!debouncedSearch.trim()
    }
  })
  const medicineRows = (results ?? []) as MedicineRow[]

  const createOrder = useCreateOrder()

  // ── API helper (same shape as web's apiFetch) ────────────────────────────
  const apiFetch = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const res = await fetch(apiUrl(path), {
      ...init,
      headers: { 'Content-Type': 'application/json', ...authHeaders(), ...init?.headers }
    })
    return jsonOrThrow(res, `Request failed (${res.status})`) as T
  }, [])

  // ── Drug interaction check ───────────────────────────────────────────────
  const checkInteractions = useCallback(
    async (items: SaleItem[]): Promise<void> => {
      const ids = items.map((i) => i.medicine.id)
      if (ids.length < 2) {
        setInteractions([])
        return
      }
      try {
        const result = await apiFetch<{ interactions: DrugInteraction[] }>('medicines/check-interactions', {
          method: 'POST',
          body: JSON.stringify({ medicineIds: ids })
        })
        setInteractions(result.interactions)
      } catch {
        setInteractions([])
      }
    },
    [apiFetch]
  )

  // ── Contraindication check ───────────────────────────────────────────────
  const checkContraindications = useCallback(
    async (pid: number | null, items: SaleItem[]): Promise<void> => {
      if (!pid || items.length === 0) {
        setContraindicationWarnings([])
        return
      }
      try {
        const result = await apiFetch<{ contraindications: ContraindicationWarning[] }>(
          'medicines/check-contraindications',
          {
            method: 'POST',
            body: JSON.stringify({ medicineIds: items.map((i) => i.medicine.id), patientId: pid })
          }
        )
        setContraindicationWarnings(result.contraindications)
      } catch {
        setContraindicationWarnings([])
      }
    },
    [apiFetch]
  )

  // ── Allergy check ────────────────────────────────────────────────────────
  const checkAllergies = useCallback(
    async (pid: number | null, items: SaleItem[]): Promise<void> => {
      if (!pid) {
        setAllergies([])
        setAllergyHits([])
        return
      }
      try {
        const rows = await apiFetch<PatientAllergy[]>(`patients/${pid}/allergies`)
        setAllergies(rows)
        if (rows.length > 0) {
          const allergenNames = rows.map((a) => a.allergen.toLowerCase())
          const hits = items
            .filter(
              (i) =>
                allergenNames.some(
                  (a) =>
                    i.medicine.name.toLowerCase().includes(a) ||
                    (i.medicine.genericName ?? '').toLowerCase().includes(a) ||
                    (i.medicine.drugClass ?? '').toLowerCase().includes(a)
                )
            )
            .map((i) => i.medicine.name)
          setAllergyHits(hits)
        } else {
          setAllergyHits([])
        }
      } catch {
        setAllergies([])
        setAllergyHits([])
      }
    },
    [apiFetch]
  )

  // ── Prescription lookup ──────────────────────────────────────────────────
  const lookupPrescription = useCallback(
    async (id: number): Promise<void> => {
      setPrescriptionLoading(true)
      setPrescriptionInfo(null)
      try {
        const row = await apiFetch<PrescriptionInfo>(`prescriptions/${id}`)
        setPrescriptionInfo(row)
        setPrescriptionId(id)
      } catch {
        setPrescriptionInfo(null)
        setPrescriptionId(null)
        showToast(`Prescription #${id} not found`)
      } finally {
        setPrescriptionLoading(false)
      }
    },
    [apiFetch, showToast]
  )

  // ── Generic substitution check ───────────────────────────────────────────
  const checkGenericAlternatives = useCallback(
    async (medicineId: number, medicineName: string): Promise<void> => {
      try {
        const alts = await apiFetch<GenericAlternative[]>(`medicines/${medicineId}/generics`)
        if (alts.length > 0) {
          setGenericSuggestion({ brandId: medicineId, brandName: medicineName, alternatives: alts })
        }
      } catch {
        /* silent — suggestion is best-effort */
      }
    },
    [apiFetch]
  )

  const addItem = useCallback(
    (medicine: MedicineRow): void => {
      const defUnit = defaultUnit(medicine)
      setSaleItems((prev) => {
        const existing = prev.find((i) => i.medicine.id === medicine.id)
        const baseUnitsNeeded = (existing ? existing.quantity + 1 : 1) * defUnit.conversionFactor
        if (existing) {
          if (existing.medicine.quantity < baseUnitsNeeded) {
            showToast(
              `Stock limit — only ${formatStockDisplay(medicine.quantity, getUnits(medicine))} of ${medicine.name}`
            )
            return prev
          }
          return prev.map((i) => (i.medicine.id === medicine.id ? { ...i, quantity: i.quantity + 1 } : i))
        }
        if (medicine.quantity === 0) {
          showToast(`Out of stock — ${medicine.name} is unavailable`)
          return prev
        }
        if (medicine.expiryDate && medicine.expiryDate < new Date().toISOString().slice(0, 10)) {
          showToast(`Expired — ${medicine.name} cannot be sold`)
          return prev
        }
        return [...prev, { medicine, quantity: 1, ...defUnit }]
      })
      setSearch('')
      searchRef.current?.focus()
      if (medicine.genericName) {
        checkGenericAlternatives(medicine.id, medicine.name)
      }
    },
    [checkGenericAlternatives, showToast]
  )

  // ── Barcode scan handler ─────────────────────────────────────────────────
  const handleBarcodeScan = useCallback(
    async (barcode: string): Promise<void> => {
      try {
        const list = await apiFetch<MedicineRow[] | { data: MedicineRow[] }>(
          `medicines?search=${encodeURIComponent(barcode)}`
        )
        const rows: MedicineRow[] = Array.isArray(list) ? list : (list as any).data ?? []
        const match = rows.find((m) => m.barcode === barcode)
        if (!match) {
          showToast(`Barcode not recognised: ${barcode}`)
          return
        }
        addItem(match)
        setScanFlash(match.name)
        setTimeout(() => setScanFlash(null), 2000)
      } catch {
        showToast('Scan lookup failed — could not reach the server')
      }
    },
    [addItem, apiFetch, showToast]
  )

  useBarcodeScanner({ onScan: handleBarcodeScan, enabled: scanMode })

  // Deep link from MedicineDetail's "Add to Checkout" — desktop's equivalent
  // of web's /new-sale?medicineId=X. Fetch the medicine, add it once, clear.
  const { data: deepLinkMedicine } = useGetMedicine(pendingCheckoutMedicineId ?? 0, {
    query: { enabled: !!pendingCheckoutMedicineId } as any
  })
  useEffect(() => {
    if (pendingCheckoutMedicineId && deepLinkMedicine) {
      addItem(deepLinkMedicine as MedicineRow)
      setPendingCheckoutMedicineId(null)
    }
  }, [pendingCheckoutMedicineId, deepLinkMedicine, addItem, setPendingCheckoutMedicineId])

  // Re-check all safety data whenever cart or patient changes
  useEffect(() => {
    checkInteractions(saleItems)
    checkAllergies(patientId, saleItems)
    checkContraindications(patientId, saleItems)
    setOverrideAllergy(false)
    setOverrideContraindication(false)
  }, [saleItems, patientId, checkInteractions, checkAllergies, checkContraindications])

  const updateQty = (id: number, qty: number): void => {
    setSaleItems((prev) =>
      qty <= 0
        ? prev.filter((i) => i.medicine.id !== id)
        : prev.map((i) => (i.medicine.id === id ? { ...i, quantity: qty } : i))
    )
  }

  const updateUnit = (medicineId: number, unitId: number | undefined, units: MedicineUnit[]): void => {
    setSaleItems((prev) =>
      prev.map((i) => {
        if (i.medicine.id !== medicineId) return i
        if (unitId == null) return { ...i, unitId: undefined, unitName: undefined, conversionFactor: 1 }
        const unit = units.find((u) => u.id === unitId)
        if (!unit) return i
        return { ...i, unitId: unit.id, unitName: unit.unitName, conversionFactor: unit.conversionFactorToBase }
      })
    )
  }

  const removeItem = (id: number): void => {
    setSaleItems((prev) => prev.filter((i) => i.medicine.id !== id))
    setGenericSuggestion((prev) => (prev?.brandId === id ? null : prev))
  }

  const updateSig = (id: number, sig: string): void => {
    setSaleItems((prev) => prev.map((i) => (i.medicine.id === id ? { ...i, sig: sig || undefined } : i)))
  }

  const subtotal = saleItems.reduce(
    (sum, i) => sum + priceForUnit(i.medicine.price, i.conversionFactor) * i.quantity,
    0
  )
  const discountClamped = Math.min(discountAmount, subtotal)
  const afterDiscount = subtotal - discountClamped
  const tax = (afterDiscount * taxRatePct) / 100
  const total = afterDiscount + tax

  // Controlled substances in cart
  const controlledItems = saleItems.filter((i) => i.medicine.controlledSchedule)

  // Hard block conditions
  const contraindicatedPairs = interactions.filter((i) => i.severity === 'contraindicated')
  const hasSevereAllergy =
    allergyHits.length > 0 &&
    allergies.some(
      (a) => a.severity === 'severe' && allergyHits.some((h) => h.toLowerCase().includes(a.allergen.toLowerCase()))
    )
  const hasBlockContraindication = contraindicationWarnings.some((c) => c.severity === 'block')
  const isSafetyBlocked =
    contraindicatedPairs.length > 0 ||
    (hasSevereAllergy && !overrideAllergy) ||
    (hasBlockContraindication && !overrideContraindication)

  // Prescription refill status
  const refillsRemaining = prescriptionInfo
    ? Math.max(0, prescriptionInfo.maxRefills - prescriptionInfo.refillsUsed)
    : null
  const refillsExhausted = prescriptionInfo ? prescriptionInfo.refillsUsed > prescriptionInfo.maxRefills : false

  const handleProcessSale = async (): Promise<void> => {
    if (saleItems.length === 0 || submitting) return
    for (const item of saleItems) {
      const baseUnitsNeeded = item.quantity * item.conversionFactor
      if (item.medicine.quantity < baseUnitsNeeded) {
        showToast(
          `Insufficient stock: ${item.medicine.name} — only ${formatStockDisplay(item.medicine.quantity, getUnits(item.medicine))}`
        )
        return
      }
    }
    if (isSafetyBlocked) {
      showToast('Safety check failed — resolve warnings before proceeding')
      return
    }
    if (offline) {
      showToast("You're offline — can't reach the server. Reconnect to continue.")
      return
    }

    setSubmitting(true)
    try {
      const result = await createOrder.mutateAsync({
        data: {
          patientName: patientName.trim() || undefined,
          ...(payment === 'credit' ? { paymentStatus: 'unpaid' } : { paymentMethod: payment }),
          notes: notes.trim() || undefined,
          items: saleItems.map((i) => ({
            medicineId: i.medicine.id,
            quantity: i.quantity,
            ...(i.unitId ? { unitId: i.unitId } : {}),
            ...(i.sig ? { sig: i.sig } : {})
          })) as any,
          ...(discountClamped > 0 ? ({ discountAmount: discountClamped } as any) : {}),
          ...(patientId ? ({ patientId } as any) : {}),
          ...(prescriptionId ? ({ prescriptionId } as any) : {})
        }
      })
      queryClient.invalidateQueries({ queryKey: getListMedicinesQueryKey(undefined) })
      setCompletedSale(result)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Sale failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleNewSale = (): void => {
    setSaleItems([])
    setPatientName('')
    setPatientId(null)
    setPayment('cash')
    setNotes('')
    setDiscountAmount(0)
    setCompletedSale(null)
    setInteractions([])
    setAllergies([])
    setAllergyHits([])
    setOverrideAllergy(false)
    setContraindicationWarnings([])
    setOverrideContraindication(false)
    setPrescriptionId(null)
    setPrescriptionInput('')
    setPrescriptionInfo(null)
    setScanMode(false)
    setScanFlash(null)
    searchRef.current?.focus()
  }

  const chargeRef = useRef(handleProcessSale)
  chargeRef.current = handleProcessSale

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (scanMode) return // scan mode swallows all keys via its capture listener
      if (e.key === 'F2') {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      } else if (e.key === 'F4') {
        e.preventDefault()
        discountRef.current?.focus()
        discountRef.current?.select()
      } else if (e.key === 'F9') {
        e.preventDefault()
        chargeRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [scanMode])

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key !== 'Enter') return
    const query = search.trim().toLowerCase()
    if (!query) return
    const match = medicineRows.find((m) => m.name.toLowerCase() === query) ?? medicineRows[0]
    if (match) {
      addItem(match)
    } else {
      showToast(`No medicine matches "${search}"`)
    }
  }

  const handleQtyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = saleItems[index + 1]
      if (next) qtyRefs.current[next.medicine.id]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = saleItems[index - 1]
      if (prev) qtyRefs.current[prev.medicine.id]?.focus()
      else searchRef.current?.focus()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      searchRef.current?.focus()
    } else if (e.key === 'Delete') {
      e.preventDefault()
      removeItem(saleItems[index].medicine.id)
      searchRef.current?.focus()
    }
  }

  const showDropdown = search.trim().length > 0 && medicineRows.length > 0
  const cardStyle = {
    background: theme.card,
    border: `1px solid ${theme.border}`,
    boxShadow: theme.shadow
  }
  const inputStyle = {
    background: theme.cardAlt,
    border: `1px solid ${theme.border}`,
    color: theme.text
  }

  // ── Completed sale screen (mirrors web) ───────────────────────────────────
  if (completedSale) {
    return (
      <div className="p-7 max-w-2xl mx-auto space-y-5 animate-fade-up">
        <div className="text-center py-6">
          <div
            style={{ background: theme.greenBg, color: theme.green }}
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"
          >
            <CheckCircle2 size={40} />
          </div>
          <h1 style={{ color: theme.text }} className="text-2xl font-bold tracking-tight">
            Sale Complete
          </h1>
          <p style={{ color: theme.muted }} className="mt-1 text-sm" >
            Receipt #{completedSale.id?.toString().padStart(4, '0')}
          </p>
        </div>
        <div style={cardStyle} className="rounded-xl overflow-hidden">
          <div
            style={{ borderBottom: `1px solid ${theme.border}`, color: theme.text }}
            className="flex items-center gap-2 px-5 py-4 text-sm font-semibold"
          >
            <Receipt size={16} /> Sale Summary
          </div>
          <div className="p-5 space-y-3">
            {completedSale.patientName && (
              <div className="flex justify-between text-sm">
                <span style={{ color: theme.muted }}>Patient</span>
                <span style={{ color: theme.text }} className="font-medium">
                  {completedSale.patientName}
                </span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span style={{ color: theme.muted }}>Payment</span>
              <span style={{ background: theme.primarySoft, color: theme.primaryText }} className="px-2 py-0.5 rounded-full text-xs font-medium capitalize">
                {completedSale.paymentStatus}
              </span>
            </div>
            <div style={{ borderTop: `1px solid ${theme.border}` }} className="pt-3 space-y-2">
              {completedSale.items?.map((item: any) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span style={{ color: theme.text }}>
                    {item.medicineName}
                    {item.unitName
                      ? ` × ${item.quantity} ${item.unitName}${item.quantity !== 1 ? 's' : ''}`
                      : ` × ${item.quantity}`}
                  </span>
                  <span style={{ ...mono, color: theme.text }} className="font-medium">
                    {formatCurrency(parseFloat(item.price), settings)}
                  </span>
                </div>
              ))}
            </div>
            <div
              style={{ borderTop: `1px solid ${theme.border}` }}
              className="pt-3 flex justify-between font-bold text-lg"
            >
              <span style={{ color: theme.text }}>Total</span>
              <span style={{ ...mono, color: theme.primaryText }}>
                {formatCurrency(parseFloat(completedSale.total), settings)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleNewSale}
            style={{ background: 'linear-gradient(135deg, #22B57F 0%, #0E8A64 100%)' }}
            className="flex-1 rounded-lg py-2.5 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
          >
            <Plus size={15} /> New Sale
          </button>
          <button
            onClick={() => {
              setPendingSaleDetailId(completedSale.id)
              setScreen('sales')
            }}
            style={{ border: `1px solid ${theme.borderStrong}`, color: theme.text }}
            className="flex-1 rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-2 transition-colors hover:bg-[color:var(--row-hover)]"
          >
            View Details <ArrowRight size={14} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 grid grid-cols-3 gap-5 h-full">
      <div className="col-span-2 flex flex-col min-h-0 overflow-y-auto pr-1 space-y-3">
        {/* Scan mode status bar */}
        {scanMode && (
          <div
            className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm animate-fade-in"
            style={{ background: theme.primarySoft, border: `1px solid ${theme.primary}55`, color: theme.primaryText }}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 pulse-dot shrink-0" />
            <span className="font-medium">Scan mode active — point scanner at medicine barcode</span>
            <div className="ml-auto flex items-center gap-3">
              {scanFlash && (
                <span className="font-semibold animate-fade-in">✓ {scanFlash}</span>
              )}
              <button
                onClick={() => setScanMode(false)}
                className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md transition-colors"
                style={{ background: theme.hover, color: theme.primaryText }}
              >
                <X size={12} /> Stop
              </button>
            </div>
          </div>
        )}

        {/* Medicine search */}
        <div className="relative">
          <div
            style={{
              background: `linear-gradient(180deg, ${theme.cardAlt} 0%, ${theme.cardAlt} 100%)`,
              border: `1px solid ${search ? theme.primary + '66' : theme.borderStrong}`,
              boxShadow: search ? `0 0 0 3px ${theme.primary}1f, ${theme.shadow}` : theme.shadow
            }}
            className="rounded-2xl p-3.5 transition-all duration-150 new-sale-search"
          >
            <label
              style={{ color: theme.muted }}
              className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider mb-2"
            >
              <Pill size={11} />
              Search medicine
              <span className="opacity-60 font-normal normal-case mx-1">·</span>
              <span style={{ color: theme.muted }} className="font-normal normal-case">
                name or generic name
              </span>
              <span className="ml-auto">
                <Kbd>F2</Kbd>
              </span>
            </label>
            <div className="flex items-center gap-3">
              <Search size={18} color={theme.primary} className="shrink-0" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                autoFocus
                placeholder="Type to search and press Enter to add…"
                style={{ color: theme.text }}
                className="flex-1 text-[15px] bg-transparent border-none outline-none placeholder:opacity-50"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  title="Clear search"
                  style={{ color: theme.muted }}
                  className="shrink-0 p-1 rounded-md transition-colors hover:bg-[color:var(--row-hover)]"
                >
                  <X size={15} />
                </button>
              )}
            </div>
          </div>

          {showDropdown && (
            <div
              style={{ background: theme.card, border: `1px solid ${theme.borderStrong}`, boxShadow: theme.shadowLg }}
              className="absolute z-20 top-full mt-1.5 left-0 right-0 rounded-2xl max-h-80 overflow-y-auto animate-scale-in"
            >
              {medicineRows.map((m, rIdx) => {
                const units = getUnits(m)
                const stockLabel =
                  m.quantity === 0
                    ? 'Out of stock'
                    : units.length > 0
                      ? formatStockDisplay(m.quantity, units)
                      : `${m.quantity} in stock`
                const cs = m.controlledSchedule
                return (
                  <button
                    key={m.id}
                    onClick={() => addItem(m)}
                    className="w-full flex items-center justify-between p-3.5 text-left text-sm transition-colors hover:bg-[color:var(--row-hover)]"
                    style={
                      {
                        '--row-hover': theme.hover,
                        color: theme.text,
                        borderTop: rIdx ? `1px solid ${theme.border}` : 'none'
                      } as React.CSSProperties
                    }
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        style={{ background: theme.primarySoft, color: theme.primaryText }}
                        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                      >
                        <Pill size={15} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium truncate">{m.name}</span>
                          {cs && (
                            <span
                              style={{ background: theme.redBg, color: theme.red }}
                              className="text-[9px] font-bold px-1 py-0 rounded"
                            >
                              Sch {cs}
                            </span>
                          )}
                          {m.prescriptionRequired && (
                            <span style={{ color: theme.amber }} className="text-[9px] font-bold uppercase">
                              Rx
                            </span>
                          )}
                        </div>
                        {m.genericName && (
                          <p style={{ color: theme.muted }} className="text-xs truncate">
                            {m.genericName}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <p style={{ ...mono, color: theme.text }} className="font-semibold text-sm">
                        {formatCurrency(parseFloat(m.price), settings)}
                        <span style={{ color: theme.muted }} className="text-xs font-normal">
                          /base
                        </span>
                      </p>
                      <p
                        className="text-xs"
                        style={{ color: m.quantity === 0 ? theme.red : theme.muted }}
                      >
                        {stockLabel}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Generic substitution suggestion */}
        {genericSuggestion && (
          <div
            className="rounded-xl p-3 text-sm flex items-start gap-3 animate-fade-up"
            style={{ border: `1px solid ${theme.primary}55`, background: theme.primarySoft }}
          >
            <span
              style={{ background: theme.primarySoft, color: theme.primaryText }}
              className="shrink-0 mt-0.5 w-7 h-7 rounded-full flex items-center justify-center"
            >
              <Pill size={13} />
            </span>
            <div className="flex-1 min-w-0">
              <p style={{ color: theme.primaryText }} className="font-semibold">
                Cheaper generic available for {genericSuggestion.brandName}
              </p>
              <div className="mt-1.5 space-y-1">
                {genericSuggestion.alternatives.slice(0, 2).map((alt) => {
                  const saving =
                    parseFloat(saleItems.find((i) => i.medicine.id === genericSuggestion.brandId)?.medicine.price ?? '0') -
                    parseFloat(alt.price)
                  return (
                    <div key={alt.id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span style={{ color: theme.text }} className="font-medium truncate">
                          {alt.name}
                        </span>
                        {alt.manufacturer && (
                          <span style={{ color: theme.muted }} className="text-xs ml-1">
                            · {alt.manufacturer}
                          </span>
                        )}
                        <span style={{ ...mono, color: theme.primaryText }} className="font-semibold ml-2">
                          {formatCurrency(parseFloat(alt.price), settings)}
                        </span>
                        {saving > 0 && (
                          <span style={{ color: theme.green }} className="text-xs ml-1">
                            (save {formatCurrency(saving, settings)}/unit)
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const found = medicineRows.find((m) => m.id === alt.id)
                          if (found) {
                            removeItem(genericSuggestion.brandId)
                            addItem(found)
                          }
                          setGenericSuggestion(null)
                        }}
                        style={{ border: `1px solid ${theme.primary}66`, color: theme.primaryText }}
                        className="shrink-0 text-xs font-semibold rounded px-2 py-0.5 transition-colors hover:bg-[color:var(--row-hover)]"
                      >
                        Switch
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setGenericSuggestion(null)}
              aria-label="Dismiss"
              style={{ color: theme.muted }}
              className="shrink-0 hover:opacity-70"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Safety warnings panel */}
        {saleItems.length > 0 && (interactions.length > 0 || allergyHits.length > 0 || controlledItems.length > 0) && (
          <div className="space-y-2">
            {interactions.map((ix, i) => {
              const sev = severityStyle(theme, ix.severity)
              return (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-xl p-3 text-sm"
                  style={{ border: `1px solid ${sev.border}44`, background: sev.bg, color: sev.fg }}
                >
                  {ix.severity === 'contraindicated' ? (
                    <Lock size={15} className="shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className="font-semibold capitalize">
                      {ix.severity} interaction — {ix.medicine1Name} + {ix.medicine2Name}
                    </p>
                    <p className="mt-0.5 opacity-90">{ix.description}</p>
                    {ix.severity === 'contraindicated' && (
                      <p className="mt-1 font-bold">Cannot dispense — remove one of these medicines.</p>
                    )}
                  </div>
                </div>
              )
            })}

            {allergyHits.length > 0 && (
              <div
                className="rounded-xl p-3 text-sm"
                style={{
                  border: `1px solid ${hasSevereAllergy ? theme.red : theme.amber}44`,
                  background: hasSevereAllergy ? theme.redBg : theme.amberBg,
                  color: hasSevereAllergy ? theme.red : theme.amber
                }}
              >
                <div className="flex items-start gap-3">
                  <ShieldAlert size={15} className="shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold">
                      {hasSevereAllergy ? 'Severe allergy alert' : 'Allergy warning'} — {allergyHits.join(', ')}
                    </p>
                    <p className="mt-0.5 opacity-90">
                      Patient has a recorded allergy that may affect{' '}
                      {allergyHits.length === 1 ? 'this medicine' : 'these medicines'}.
                    </p>
                    {hasSevereAllergy && !overrideAllergy && (
                      <button
                        onClick={() => setOverrideAllergy(true)}
                        style={{ border: `1px solid ${theme.red}66`, color: theme.red }}
                        className="mt-2 text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors hover:bg-[color:var(--row-hover)]"
                      >
                        Override — I confirm this is intentional
                      </button>
                    )}
                    {overrideAllergy && (
                      <p className="mt-1 text-xs font-semibold">⚠ Override active — proceeding at pharmacist discretion</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {controlledItems.length > 0 && (
              <div
                className="flex items-start gap-3 rounded-xl p-3 text-sm"
                style={{ border: `1px solid ${theme.amber}44`, background: theme.amberBg, color: theme.amber }}
              >
                <Lock size={15} className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">
                    Controlled substance{controlledItems.length > 1 ? 's' : ''} — prescription required
                  </p>
                  <p className="mt-0.5 opacity-90">
                    {controlledItems
                      .map((i) => `${i.medicine.name} (Schedule ${i.medicine.controlledSchedule})`)
                      .join(', ')}{' '}
                    — a verified prescription must be attached and will be auto-logged.
                  </p>
                </div>
              </div>
            )}

            {contraindicationWarnings.map((ci, i) => {
              const block = ci.severity === 'block'
              return (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-xl p-3 text-sm"
                  style={{
                    border: `1px solid ${block ? theme.red : theme.amber}44`,
                    background: block ? theme.redBg : theme.amberBg,
                    color: block ? theme.red : theme.amber
                  }}
                >
                  <AlertCircle size={15} className="shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold capitalize">
                      {block ? 'Contraindication — ' : 'Caution — '}
                      {ci.medicineName}
                    </p>
                    <p className="mt-0.5 opacity-90">{ci.description}</p>
                    {block && !overrideContraindication && (
                      <button
                        onClick={() => setOverrideContraindication(true)}
                        style={{ border: `1px solid ${theme.red}66`, color: theme.red }}
                        className="mt-2 text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors hover:bg-[color:var(--row-hover)]"
                      >
                        Override — I confirm this is intentional
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            {overrideContraindication && hasBlockContraindication && (
              <p style={{ color: theme.red }} className="text-xs font-semibold px-1">
                ⚠ Contraindication override active — proceeding at pharmacist discretion
              </p>
            )}
          </div>
        )}

        {/* Cart */}
        <div style={cardStyle} className="rounded-xl flex-1 flex flex-col min-h-0 overflow-hidden">
          <div
            style={{ borderBottom: `1px solid ${theme.border}`, color: theme.text }}
            className="flex items-center gap-2 px-4 py-3 text-sm font-semibold shrink-0"
          >
            <ShoppingBag size={15} /> Current Sale
            {saleItems.length > 0 && (
              <span
                style={{ background: theme.hover, color: theme.muted }}
                className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full"
              >
                {saleItems.length} item{saleItems.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {saleItems.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-10 text-center" style={{ color: theme.muted }}>
              <Scan size={24} strokeWidth={1.6} className="mb-2 opacity-60" />
              <p className="text-sm">Search for a medicine above to add it to the sale</p>
              <div className="flex items-center gap-2 mt-3 text-xs">
                <Kbd>F2</Kbd> search <Kbd>F4</Kbd> discount <Kbd>F9</Kbd> charge
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0" style={{ background: theme.cardAlt, borderBottom: `1px solid ${theme.borderStrong}` }}>
                  <tr>
                    <th style={{ color: theme.muted }} className="py-2 px-3 text-left text-[11px] font-semibold uppercase tracking-wider">Item</th>
                    <th style={{ color: theme.muted }} className="py-2 px-2 text-left text-[11px] font-semibold uppercase tracking-wider">Unit</th>
                    <th style={{ color: theme.muted }} className="py-2 px-2 text-center text-[11px] font-semibold uppercase tracking-wider">Qty</th>
                    <th style={{ color: theme.muted }} className="py-2 px-3 text-right text-[11px] font-semibold uppercase tracking-wider">Total</th>
                    <th className="py-2 px-2 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {saleItems.map((item, idx) => {
                    const units = getUnits(item.medicine)
                    const unitPrice = priceForUnit(item.medicine.price, item.conversionFactor)
                    const lineTotal = unitPrice * item.quantity
                    const baseUnitsUsed = item.quantity * item.conversionFactor
                    const maxQty = Math.floor(item.medicine.quantity / item.conversionFactor)
                    const cs = item.medicine.controlledSchedule
                    const isContraindicated = contraindicatedPairs.some(
                      (p) => p.medicine1Id === item.medicine.id || p.medicine2Id === item.medicine.id
                    )
                    const highlighted = focusedRowId === item.medicine.id
                    const isAtMax = item.quantity >= maxQty
                    const accent = isContraindicated ? theme.red : theme.primary
                    const accentSoft = isContraindicated ? theme.redBg : theme.primarySoft
                    return (
                      <Fragment key={item.medicine.id}>
                        <tr
                          onMouseEnter={() => setFocusedRowId(item.medicine.id)}
                          onMouseLeave={() => setFocusedRowId(null)}
                          style={{
                            background: highlighted ? accentSoft : 'transparent',
                            borderBottom: `1px solid ${theme.border}`
                          }}
                          className="transition-colors"
                        >
                          {/* Item */}
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                style={{ background: accentSoft, color: accent }}
                                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 font-semibold text-xs"
                              >
                                {item.medicine.name.charAt(0).toUpperCase()}
                              </span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p style={{ color: theme.text }} className="font-medium text-[13px] truncate">
                                    {item.medicine.name}
                                  </p>
                                  {cs && (
                                    <span style={{ background: theme.redBg, color: theme.red }} className="text-[9px] font-bold px-1 py-px rounded shrink-0">
                                      Sch {cs}
                                    </span>
                                  )}
                                  {item.medicine.prescriptionRequired && (
                                    <span style={{ background: theme.amberBg, color: theme.amber }} className="text-[9px] font-bold px-1 py-px rounded uppercase shrink-0">
                                      Rx
                                    </span>
                                  )}
                                </div>
                                <p style={{ color: theme.muted }} className="text-[11px] mt-0.5">
                                  <span style={{ ...mono }}>{formatCurrency(unitPrice, settings)}</span>
                                  <span> / {item.unitName ?? 'unit'}</span>
                                  {item.conversionFactor > 1 && (
                                    <span className="opacity-80"> · {item.conversionFactor} base units</span>
                                  )}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Unit */}
                          <td className="py-2.5 px-2">
                            {units.length > 0 ? (
                              <select
                                value={item.unitId ?? ''}
                                onChange={(e) =>
                                  updateUnit(item.medicine.id, e.target.value ? Number(e.target.value) : undefined, units)
                                }
                                style={inputStyle}
                                className="h-8 rounded-lg px-2 py-0 text-xs outline-none focus:ring-2 focus:ring-emerald-500/40 max-w-[7.5rem]"
                              >
                                {!units.some((u) => u.isBaseUnit || u.conversionFactorToBase === 1) && (
                                  <option value="">Individual (×1)</option>
                                )}
                                {[...units]
                                  .sort((a, b) => a.conversionFactorToBase - b.conversionFactorToBase)
                                  .map((u) => (
                                    <option key={u.id} value={u.id}>
                                      {u.unitName}
                                    </option>
                                  ))}
                              </select>
                            ) : (
                              <span style={{ color: theme.muted }} className="text-xs">—</span>
                            )}
                          </td>

                          {/* Qty stepper */}
                          <td className="py-2.5 px-2">
                            <div
                              className="flex items-center rounded-lg overflow-hidden mx-auto"
                              style={{ border: `1px solid ${theme.borderStrong}`, background: theme.card, width: 'fit-content' }}
                            >
                              <button
                                onClick={() => updateQty(item.medicine.id, item.quantity - 1)}
                                className="w-7 h-7 flex items-center justify-center transition-colors"
                                style={{ color: theme.text, background: 'transparent' }}
                              >
                                <Minus size={11} />
                              </button>
                              <input
                                ref={(el) => {
                                  qtyRefs.current[item.medicine.id] = el
                                }}
                                type="number"
                                min={1}
                                max={maxQty}
                                value={item.quantity}
                                onChange={(e) => updateQty(item.medicine.id, parseInt(e.target.value) || 0)}
                                onFocus={() => setFocusedRowId(item.medicine.id)}
                                onBlur={() => setFocusedRowId(null)}
                                onKeyDown={(e) => handleQtyKeyDown(e, idx)}
                                style={{ ...mono, background: 'transparent', color: theme.text, borderLeft: `1px solid ${theme.borderStrong}`, borderRight: `1px solid ${theme.borderStrong}` }}
                                className="w-10 h-7 text-center text-sm outline-none"
                              />
                              <button
                                onClick={() => updateQty(item.medicine.id, item.quantity + 1)}
                                disabled={isAtMax}
                                className="w-7 h-7 flex items-center justify-center transition-colors"
                                style={{ color: isAtMax ? theme.muted : theme.text, background: 'transparent', opacity: isAtMax ? 0.4 : 1 }}
                              >
                                <Plus size={11} />
                              </button>
                            </div>
                          </td>

                          {/* Total */}
                          <td className="py-2.5 px-3 text-right" style={{ ...mono, color: accent, fontWeight: 700 }}>
                            {formatCurrency(lineTotal, settings)}
                            {item.conversionFactor > 1 && (
                              <span style={{ color: theme.muted }} className="text-[10px] font-normal ml-1">
                                {baseUnitsUsed}bu
                              </span>
                            )}
                          </td>

                          {/* Remove */}
                          <td className="py-2.5 px-2 text-right">
                            <button
                              onClick={() => removeItem(item.medicine.id)}
                              title="Remove item"
                              className="p-1.5 rounded-md transition-colors"
                              style={{ color: theme.muted, '--row-hover': theme.redBg } as React.CSSProperties}
                              onMouseEnter={(e) => (e.currentTarget.style.color = theme.red)}
                              onMouseLeave={(e) => (e.currentTarget.style.color = theme.muted)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>

                        {/* SIG row */}
                        <tr
                          style={{ background: theme.card, borderBottom: `1px solid ${theme.borderStrong}` }}
                        >
                          <td colSpan={5} className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <FileText size={13} style={{ color: theme.muted }} className="shrink-0" />
                              <input
                                placeholder="Dosing instructions (e.g. Take 1 tablet twice daily after food)"
                                value={item.sig ?? ''}
                                onChange={(e) => updateSig(item.medicine.id, e.target.value)}
                                style={inputStyle}
                                className="flex-1 h-8 rounded-lg px-2.5 text-xs outline-none placeholder:opacity-50 focus:ring-2 focus:ring-emerald-500/40"
                              />
                            </div>
                          </td>
                        </tr>
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Keyboard shortcuts footer */}
        <div className="flex gap-3 items-center flex-wrap shrink-0">
          <Kbd>F2</Kbd>
          <span style={{ color: theme.muted }} className="text-xs">Search</span>
          <Kbd>F4</Kbd>
          <span style={{ color: theme.muted }} className="text-xs">Discount</span>
          <Kbd>F9</Kbd>
          <span style={{ color: theme.muted }} className="text-xs">Charge</span>
          <Kbd>↑ ↓</Kbd>
          <span style={{ color: theme.muted }} className="text-xs">Rows</span>
          <Kbd>Del</Kbd>
          <span style={{ color: theme.muted }} className="text-xs">Remove</span>
        </div>
      </div>

      {/* ── Right column ── */}
      <div className="flex flex-col gap-4 min-h-0 overflow-y-auto pl-1">
        {/* Patient */}
        <div style={cardStyle} className="rounded-xl p-4">
          <h2 style={{ color: theme.text }} className="text-sm font-semibold tracking-tight mb-3">
            Patient
          </h2>
          <label className="flex flex-col gap-1 mb-3">
            <span style={{ color: theme.muted }} className="text-xs font-medium">
              Patient Name <span className="opacity-60 font-normal">(optional)</span>
            </span>
            <input
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              placeholder="Walk-in patient or name"
              style={inputStyle}
              className="text-sm rounded-lg px-3 py-2 outline-none placeholder:opacity-50 focus:ring-2 focus:ring-emerald-500/40"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span style={{ color: theme.muted }} className="text-xs font-medium">
              Patient ID <span className="opacity-60 font-normal">(for safety checks)</span>
            </span>
            <input
              type="number"
              min={1}
              value={patientId ?? ''}
              onChange={(e) => setPatientId(e.target.value ? Number(e.target.value) : null)}
              placeholder="Enter patient ID"
              style={inputStyle}
              className="text-sm rounded-lg px-3 py-2 outline-none placeholder:opacity-50 focus:ring-2 focus:ring-emerald-500/40"
            />
          </label>
          {patientId && allergies.length > 0 && (
            <p style={{ color: theme.amber }} className="text-xs mt-2">
              ⚠ {allergies.length} allergy record{allergies.length !== 1 ? 's' : ''} —{' '}
              {allergies.map((a) => a.allergen).join(', ')}
            </p>
          )}
          {patientId && allergies.length === 0 && contraindicationWarnings.length === 0 && (
            <p style={{ color: theme.green }} className="text-xs mt-2">
              ✓ No recorded allergies or contraindications
            </p>
          )}
        </div>

        {/* Prescription */}
        <div style={cardStyle} className="rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileText size={14} color={theme.muted} />
            <h2 style={{ color: theme.text }} className="text-sm font-semibold tracking-tight">
              Prescription
            </h2>
            <span style={{ color: theme.muted }} className="text-[10px] ml-auto">
              Required for Rx & controlled drugs
            </span>
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              placeholder="Prescription ID"
              value={prescriptionInput}
              onChange={(e) => setPrescriptionInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && prescriptionInput) lookupPrescription(Number(prescriptionInput))
              }}
              style={inputStyle}
              className="flex-1 min-w-0 text-sm rounded-lg px-3 py-2 outline-none placeholder:opacity-50 focus:ring-2 focus:ring-emerald-500/40"
            />
            <button
              onClick={() => prescriptionInput && lookupPrescription(Number(prescriptionInput))}
              disabled={!prescriptionInput || prescriptionLoading}
              style={{ border: `1px solid ${theme.borderStrong}`, color: theme.text, opacity: !prescriptionInput || prescriptionLoading ? 0.5 : 1 }}
              className="shrink-0 px-3 rounded-lg text-xs font-semibold transition-colors hover:bg-[color:var(--row-hover)] flex items-center"
            >
              {prescriptionLoading ? <Loader2 size={13} className="animate-spin" /> : 'Link'}
            </button>
            {prescriptionId && (
              <button
                onClick={() => {
                  setPrescriptionId(null)
                  setPrescriptionInput('')
                  setPrescriptionInfo(null)
                }}
                title="Unlink prescription"
                style={{ color: theme.muted, border: `1px solid ${theme.border}` }}
                className="shrink-0 w-9 rounded-lg flex items-center justify-center transition-colors hover:bg-[color:var(--row-hover)]"
              >
                <X size={13} />
              </button>
            )}
          </div>
          {prescriptionInfo && (
            <div
              className="rounded-lg p-3 text-sm space-y-1 mt-3 animate-fade-in"
              style={{
                border: `1px solid ${prescriptionInfo.status !== 'verified' ? theme.amber : refillsExhausted ? theme.red : theme.green}44`,
                background: prescriptionInfo.status !== 'verified'
                  ? theme.amberBg
                  : refillsExhausted
                    ? theme.redBg
                    : theme.greenBg,
                color: prescriptionInfo.status !== 'verified'
                  ? theme.amber
                  : refillsExhausted
                    ? theme.red
                    : theme.green
              }}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">
                  {prescriptionInfo.status !== 'verified'
                    ? '⚠ Prescription not verified'
                    : refillsExhausted
                      ? '✗ No refills remaining'
                      : `✓ Rx #${prescriptionInfo.id} — verified`}
                </span>
              </div>
              {prescriptionInfo.doctorName && (
                <p className="text-xs opacity-80">Doctor: {prescriptionInfo.doctorName}</p>
              )}
              <p className="text-xs font-medium">
                Refills: {prescriptionInfo.refillsUsed} used / {prescriptionInfo.maxRefills} allowed
                {!refillsExhausted && refillsRemaining !== null && ` — ${refillsRemaining} remaining`}
              </p>
              {refillsExhausted && (
                <p className="text-xs font-semibold">This prescription has no remaining refills. The server will block this sale.</p>
              )}
            </div>
          )}
        </div>

        {/* Payment + totals */}
        <div style={cardStyle} className="rounded-xl p-4 flex flex-col">
          <h2 style={{ color: theme.text }} className="text-sm font-semibold tracking-tight mb-3">
            Payment
          </h2>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {PAYMENT_METHODS.map(([value, label, Icon]) => (
              <button
                key={value}
                onClick={() => setPayment(value)}
                style={
                  payment === value
                    ? {
                        background: theme.primarySoft,
                        border: `1px solid ${theme.primary}`,
                        color: theme.primaryText,
                        boxShadow: `0 0 0 3px ${theme.primary}14`
                      }
                    : { border: `1px solid ${theme.border}`, color: theme.muted, background: theme.cardAlt }
                }
                className="rounded-lg py-2.5 text-xs font-medium flex flex-col items-center gap-1 transition-all duration-150 active:scale-[0.97]"
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
          {payment === 'credit' && (
            <p style={{ background: theme.amberBg, color: theme.amber, border: `1px solid ${theme.amber}33` }} className="text-[11px] font-medium rounded-md px-2.5 py-1.5 mb-3">
              Pay later — items are dispensed now, collect payment on the Sales screen.
            </p>
          )}
          <input
            placeholder="Notes (optional) — e.g. prescription #…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={inputStyle}
            className="w-full text-sm rounded-lg px-3 py-2 outline-none placeholder:opacity-50 focus:ring-2 focus:ring-emerald-500/40 mb-3"
          />

          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span style={{ color: theme.muted }}>Subtotal</span>
              <span style={mono}>{formatCurrency(subtotal, settings)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span style={{ color: theme.muted }}>Discount</span>
              <input
                ref={discountRef}
                type="number"
                min={0}
                max={subtotal}
                step={0.01}
                value={discountAmount || ''}
                placeholder="0.00"
                onChange={(e) => setDiscountAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                style={{ ...mono, ...inputStyle }}
                className="w-24 text-right rounded-md py-1 px-2 text-sm outline-none"
              />
            </div>
            {taxRatePct > 0 && (
              <div className="flex justify-between">
                <span style={{ color: theme.muted }}>Tax ({taxRatePct}%)</span>
                <span style={mono}>{formatCurrency(tax, settings)}</span>
              </div>
            )}
            <div
              className="flex justify-between pt-2.5 mt-2.5 items-center"
              style={{ borderTop: `1px solid ${theme.border}` }}
            >
              <span style={{ color: theme.text }} className="font-semibold text-sm">
                Total
              </span>
              <span style={{ ...mono, color: theme.primaryText }} className="text-xl font-bold tracking-tight">
                {formatCurrency(total, settings)}
              </span>
            </div>
          </div>

          {isSafetyBlocked && (
            <div
              className="rounded-lg p-3 text-sm text-center font-medium mt-3 animate-fade-in"
              style={{ background: theme.redBg, color: theme.red, border: `1px solid ${theme.red}44` }}
            >
              {contraindicatedPairs.length > 0
                ? 'Remove the contraindicated medicine before proceeding'
                : 'Override the severe allergy alert to proceed'}
            </div>
          )}

          <button
            onClick={handleProcessSale}
            disabled={saleItems.length === 0 || submitting || isSafetyBlocked || offline}
            style={{
              background: 'linear-gradient(135deg, #22B57F 0%, #0E8A64 100%)',
              boxShadow: saleItems.length === 0 || submitting || isSafetyBlocked || offline ? 'none' : '0 4px 16px rgba(16,138,100,0.35)',
              opacity: saleItems.length === 0 || submitting || isSafetyBlocked || offline ? 0.5 : 1
            }}
            className="w-full rounded-lg py-3 text-white text-sm font-semibold tracking-tight flex items-center justify-center gap-2 transition-transform active:scale-[0.98] mt-4"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {offline ? 'Offline — cannot process sale' : `Process Sale · ${formatCurrency(total, settings)}`}
          </button>
        </div>
      </div>
    </div>
  )
}

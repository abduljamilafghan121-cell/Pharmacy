import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiUrl, authHeaders, jsonOrThrow } from '../lib/apiClient'

// These endpoints aren't in the generated @workspace/api-client-react
// client yet — mirrors artifacts/web's hooks/use-tier5.ts and
// hooks/use-audit-log.ts, against desktop's absolute-URL apiUrl() helper.

// ── Patients (extended — web bypasses the generated client to support
// dateOfBirth/gender/allergyCount, which aren't in the OpenAPI spec yet) ──

export interface PatientExtended {
  id: number
  name: string
  phone?: string | null
  dateOfBirth?: string | null
  gender?: string | null
  notes?: string | null
  createdAt: string
  allergyCount?: number
}

export function useListPatientsExtended(search?: string) {
  return useQuery<PatientExtended[]>({
    queryKey: ['patients-extended', search],
    queryFn: async () => {
      const url = search ? `${apiUrl('patients')}?search=${encodeURIComponent(search)}` : apiUrl('patients')
      const res = await fetch(url, { headers: authHeaders() })
      return jsonOrThrow(res, 'Failed to load patients')
    }
  })
}

export function useCreatePatientExtended() {
  const queryClient = useQueryClient()
  return useMutation<
    PatientExtended,
    Error,
    { name: string; phone?: string; dateOfBirth?: string; gender?: string; notes?: string }
  >({
    mutationFn: async (data) => {
      const res = await fetch(apiUrl('patients'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(data)
      })
      return jsonOrThrow(res, 'Failed to register patient')
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['patients-extended'] })
  })
}

export interface PatientAllergy {
  id: number
  allergen: string
  severity: 'mild' | 'moderate' | 'severe'
  reaction?: string | null
}

export function usePatientAllergies(patientId: number) {
  return useQuery<PatientAllergy[]>({
    queryKey: ['patient-allergies', patientId],
    queryFn: async () => {
      const res = await fetch(apiUrl(`patients/${patientId}/allergies`), { headers: authHeaders() })
      return jsonOrThrow(res, 'Failed to load allergies')
    }
  })
}

export function useAddPatientAllergy(patientId: number) {
  const queryClient = useQueryClient()
  return useMutation<PatientAllergy, Error, { allergen: string; severity: 'mild' | 'moderate' | 'severe'; reaction?: string }>({
    mutationFn: async (data) => {
      const res = await fetch(apiUrl(`patients/${patientId}/allergies`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(data)
      })
      return jsonOrThrow(res, 'Failed to save allergy')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-allergies', patientId] })
      queryClient.invalidateQueries({ queryKey: ['patients-extended'] })
    }
  })
}

export function useDeletePatientAllergy(patientId: number) {
  const queryClient = useQueryClient()
  return useMutation<void, Error, { id: number }>({
    mutationFn: async ({ id }) => {
      const res = await fetch(apiUrl(`patients/${patientId}/allergies/${id}`), {
        method: 'DELETE',
        headers: authHeaders()
      })
      await jsonOrThrow(res, 'Failed to remove allergy')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-allergies', patientId] })
      queryClient.invalidateQueries({ queryKey: ['patients-extended'] })
    }
  })
}

export interface PatientCondition {
  id: number
  condition: string
  notes?: string | null
}

export function usePatientConditions(patientId: number) {
  return useQuery<PatientCondition[]>({
    queryKey: ['patient-conditions', patientId],
    queryFn: async () => {
      const res = await fetch(apiUrl(`patients/${patientId}/conditions`), { headers: authHeaders() })
      return jsonOrThrow(res, 'Failed to load conditions')
    }
  })
}

export function useAddPatientCondition(patientId: number) {
  const queryClient = useQueryClient()
  return useMutation<PatientCondition, Error, { condition: string; notes?: string }>({
    mutationFn: async (data) => {
      const res = await fetch(apiUrl(`patients/${patientId}/conditions`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(data)
      })
      return jsonOrThrow(res, 'Failed to save condition')
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['patient-conditions', patientId] })
  })
}

export function useDeletePatientCondition(patientId: number) {
  const queryClient = useQueryClient()
  return useMutation<void, Error, { id: number }>({
    mutationFn: async ({ id }) => {
      const res = await fetch(apiUrl(`patients/${patientId}/conditions/${id}`), {
        method: 'DELETE',
        headers: authHeaders()
      })
      await jsonOrThrow(res, 'Failed to remove condition')
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['patient-conditions', patientId] })
  })
}

export interface DispensingHistoryItem {
  orderId: number
  orderDate: string
  orderStatus: string
  orderTotal: string
  servedByName?: string | null
  itemId: number
  medicineId: number
  medicineName?: string | null
  medicineStrength?: string | null
  quantity: number
  unitName?: string | null
  price: string
  returnedQuantity?: number | null
}

export function usePatientDispensingHistory(patientId: number, page: number, limit = 20) {
  return useQuery<{ data: DispensingHistoryItem[]; total: number; page: number }>({
    queryKey: ['patient-dispensing-history', patientId, page, limit],
    queryFn: async () => {
      const res = await fetch(apiUrl(`patients/${patientId}/dispensing-history?page=${page}&limit=${limit}`), {
        headers: authHeaders()
      })
      return jsonOrThrow(res, 'Failed to load dispensing history')
    }
  })
}

// ── Supplier Returns ─────────────────────────────────────────────────────

export interface SupplierReturn {
  id: number
  supplierId: number
  supplierName: string | null
  purchaseOrderId: number | null
  reason: string
  totalAmount: string
  createdAt: string
}

export function useListSupplierReturns() {
  return useQuery<SupplierReturn[]>({
    queryKey: ['supplier-returns'],
    queryFn: async () => {
      const res = await fetch(apiUrl('supplier-returns'), { headers: authHeaders() })
      return jsonOrThrow(res, 'Failed to load supplier returns')
    }
  })
}

export interface SupplierReturnDetailItem {
  id: number
  medicineId: number
  medicineName: string | null
  medicineBatchId: number
  quantity: number
  unitCost: string
  lineTotal: string
}

export type SupplierReturnDetail = SupplierReturn & { items: SupplierReturnDetailItem[] }

export function useSupplierReturnDetail(id: number | null) {
  return useQuery<SupplierReturnDetail>({
    queryKey: ['supplier-return', id],
    queryFn: async () => {
      const res = await fetch(apiUrl(`supplier-returns/${id}`), { headers: authHeaders() })
      return jsonOrThrow(res, 'Failed to load supplier return')
    },
    enabled: id != null
  })
}

// ── Insurance Claims ─────────────────────────────────────────────────────

export interface InsuranceClaim {
  id: number
  orderId: number
  providerName: string
  policyNumber: string | null
  claimAmount: string
  status: 'submitted' | 'approved' | 'rejected' | 'paid'
  submittedBy: number | null
  submittedByName: string | null
  submittedAt: string
  resolvedAt: string | null
  notes: string | null
}

export function useListInsuranceClaims(status?: string) {
  return useQuery<InsuranceClaim[]>({
    queryKey: ['insurance-claims', status],
    queryFn: async () => {
      const url = status ? `${apiUrl('insurance-claims')}?status=${status}` : apiUrl('insurance-claims')
      const res = await fetch(url, { headers: authHeaders() })
      return jsonOrThrow(res, 'Failed to load insurance claims')
    }
  })
}

export function useCreateInsuranceClaim() {
  const queryClient = useQueryClient()
  return useMutation<
    InsuranceClaim,
    Error,
    { orderId: number; providerName: string; policyNumber?: string; claimAmount: number; notes?: string }
  >({
    mutationFn: async (data) => {
      const res = await fetch(apiUrl('insurance-claims'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(data)
      })
      return jsonOrThrow(res, 'Failed to submit claim')
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['insurance-claims'] })
  })
}

export function useUpdateInsuranceClaim() {
  const queryClient = useQueryClient()
  return useMutation<InsuranceClaim, Error, { id: number; status: string; notes?: string }>({
    mutationFn: async ({ id, ...data }) => {
      const res = await fetch(apiUrl(`insurance-claims/${id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(data)
      })
      return jsonOrThrow(res, 'Failed to update claim')
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['insurance-claims'] })
  })
}

// ── Insurance Pre-Authorizations ─────────────────────────────────────────

export interface InsurancePreAuth {
  id: number
  patientId: number | null
  patientName: string | null
  medicineId: number
  medicineName: string | null
  prescriptionId: number | null
  insurerName: string
  policyNumber: string | null
  diagnosisCode: string | null
  requestedBy: number | null
  requestedByName: string | null
  status: 'pending' | 'approved' | 'denied' | 'expired'
  referenceNumber: string | null
  notes: string | null
  submittedAt: string
  resolvedAt: string | null
}

export function useListPreAuths(status?: string) {
  return useQuery<InsurancePreAuth[]>({
    queryKey: ['pre-authorizations', status],
    queryFn: async () => {
      const url = status ? `${apiUrl('pre-authorizations')}?status=${status}` : apiUrl('pre-authorizations')
      const res = await fetch(url, { headers: authHeaders() })
      return jsonOrThrow(res, 'Failed to load pre-authorizations')
    }
  })
}

export function useCreatePreAuth() {
  const queryClient = useQueryClient()
  return useMutation<
    InsurancePreAuth,
    Error,
    {
      medicineId: number
      patientId?: number
      prescriptionId?: number
      insurerName: string
      policyNumber?: string
      diagnosisCode?: string
      notes?: string
    }
  >({
    mutationFn: async (data) => {
      const res = await fetch(apiUrl('pre-authorizations'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(data)
      })
      return jsonOrThrow(res, 'Failed to submit pre-authorization')
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pre-authorizations'] })
  })
}

export function useUpdatePreAuth() {
  const queryClient = useQueryClient()
  return useMutation<
    InsurancePreAuth,
    Error,
    { id: number; status?: string; referenceNumber?: string | null; notes?: string | null }
  >({
    mutationFn: async ({ id, ...data }) => {
      const res = await fetch(apiUrl(`pre-authorizations/${id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(data)
      })
      return jsonOrThrow(res, 'Failed to update pre-authorization')
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pre-authorizations'] })
  })
}

// ── Audit Log ─────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: number
  userId: number | null
  userName: string | null
  action: string
  entityType: string
  entityId: number | null
  description: string
  createdAt: string
}

export function useAuditLog(entityType?: string) {
  const base = apiUrl('audit-logs')
  const url = entityType ? `${base}?entityType=${encodeURIComponent(entityType)}` : base
  return useQuery<{ entries: AuditLogEntry[]; total: number }>({
    queryKey: ['audit-logs', entityType],
    queryFn: async () => {
      const res = await fetch(url, { headers: authHeaders() })
      return jsonOrThrow(res, 'Failed to load audit log')
    }
  })
}

// ── Reports (extra) ───────────────────────────────────────────────────────

export interface ProfitReport {
  revenue: string
  cost: string
  profit: string
  marginPct: number
  note: string
}

function qs(params?: Record<string, string | undefined>): string {
  if (!params) return ''
  const sp = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') sp.append(k, v)
  })
  const s = sp.toString()
  return s ? `?${s}` : ''
}

export function useGetProfitReport(from?: string, to?: string) {
  return useQuery<ProfitReport>({
    queryKey: ['reports-profit', from, to],
    queryFn: async () => {
      const res = await fetch(apiUrl(`reports/profit${qs({ from, to })}`), { headers: authHeaders() })
      return jsonOrThrow(res, 'Failed to load profit report')
    }
  })
}

export interface TopMedicineRanged {
  medicineId: number
  medicineName: string | null
  totalSold: number
  revenue: string
}

export function useTopMedicinesRanged(from?: string, to?: string) {
  return useQuery<TopMedicineRanged[]>({
    queryKey: ['reports-top-medicines', from, to],
    queryFn: async () => {
      const res = await fetch(apiUrl(`reports/top-medicines${qs({ from, to })}`), { headers: authHeaders() })
      return jsonOrThrow(res, 'Failed to load top medicines')
    }
  })
}

export interface StaffProductivityRow {
  userId: number | null
  userName: string | null
  totalOrders: number
  totalRevenue: string
  totalItems: number
}

export function useStaffProductivity(from?: string, to?: string) {
  return useQuery<StaffProductivityRow[]>({
    queryKey: ['reports-staff-productivity', from, to],
    queryFn: async () => {
      const res = await fetch(apiUrl(`reports/staff-productivity${qs({ from, to })}`), { headers: authHeaders() })
      return jsonOrThrow(res, 'Failed to load staff productivity')
    }
  })
}

export interface ReorderSuggestion {
  medicineId: number
  medicineName: string
  genericName: string | null
  currentStock: number
  reorderLevel: number
  sold30Days: number
  dailyRate: number
  suggestedReorderQty: number
  urgency: 'critical' | 'high' | 'medium'
}

export function useReorderSuggestions() {
  return useQuery<ReorderSuggestion[]>({
    queryKey: ['medicines-reorder-suggestions'],
    queryFn: async () => {
      const res = await fetch(apiUrl('medicines/reorder-suggestions'), { headers: authHeaders() })
      return jsonOrThrow(res, 'Failed to load reorder suggestions')
    },
    staleTime: 5 * 60 * 1000
  })
}

// ── Reports (new modules) ──────────────────────────────────────────────────

export interface PaymentMethodRow {
  method: string
  count: number
  amount: string
}

export interface PaymentsReport {
  byMethod: PaymentMethodRow[]
  totalCollected: string
  byOrderStatus: { paymentStatus: string; count: number; amount: string }[]
  outstanding: { count: number; amount: string }
}

export function usePaymentsReport(from?: string, to?: string) {
  return useQuery<PaymentsReport>({
    queryKey: ['reports-payments', from, to],
    queryFn: async () => {
      const res = await fetch(apiUrl(`reports/payments${qs({ from, to })}`), { headers: authHeaders() })
      return jsonOrThrow(res, 'Failed to load payment report')
    }
  })
}

export interface PurchaseBySupplierRow {
  supplierId: number
  supplierName: string
  purchaseOrders: number
  totalPurchased: string
  totalPaid: string
  totalReturns: string
  balance: string
}

export function usePurchasesBySupplier(from?: string, to?: string) {
  return useQuery<PurchaseBySupplierRow[]>({
    queryKey: ['reports-purchases-by-supplier', from, to],
    queryFn: async () => {
      const res = await fetch(apiUrl(`reports/purchases-by-supplier${qs({ from, to })}`), { headers: authHeaders() })
      return jsonOrThrow(res, 'Failed to load purchases by supplier')
    }
  })
}

export interface ExpiringStockRow {
  medicineId: number
  medicineName: string | null
  batchId: number
  batchNumber: string | null
  expiryDate: string | null
  quantity: number
  supplierId: number | null
  supplierName: string | null
}

export function useExpiringStock(days = 90) {
  return useQuery<ExpiringStockRow[]>({
    queryKey: ['reports-expiring-stock', days],
    queryFn: async () => {
      const res = await fetch(apiUrl(`reports/expiring-stock?days=${days}`), { headers: authHeaders() })
      return jsonOrThrow(res, 'Failed to load expiring stock')
    }
  })
}

export interface ControlledScheduleRow {
  schedule: string
  count: number
  quantity: number
}

export interface ControlledByMedicineRow {
  medicineId: number
  medicineName: string | null
  count: number
  quantity: number
}

export interface ControlledSubstancesReport {
  totalEvents: number
  bySchedule: ControlledScheduleRow[]
  byMedicine: ControlledByMedicineRow[]
}

export function useControlledSubstancesReport(from?: string, to?: string) {
  return useQuery<ControlledSubstancesReport>({
    queryKey: ['reports-controlled-substances', from, to],
    queryFn: async () => {
      const res = await fetch(apiUrl(`reports/controlled-substances${qs({ from, to })}`), { headers: authHeaders() })
      return jsonOrThrow(res, 'Failed to load controlled substances report')
    }
  })
}

export interface ClaimStatusRow {
  status: string
  count: number
  amount: string
}

export interface InsuranceClaimsReport {
  totalClaims: number
  totalAmount: string
  pendingReceivable: string
  byStatus: ClaimStatusRow[]
}

export function useInsuranceClaimsReport(from?: string, to?: string) {
  return useQuery<InsuranceClaimsReport>({
    queryKey: ['reports-insurance-claims', from, to],
    queryFn: async () => {
      const res = await fetch(apiUrl(`reports/insurance-claims${qs({ from, to })}`), { headers: authHeaders() })
      return jsonOrThrow(res, 'Failed to load insurance claims report')
    }
  })
}

export interface SaleTransaction {
  id: number
  createdAt: string
  patientName: string | null
  servedByName: string | null
  status: string
  subtotal: string
  discountAmount: string
  taxAmount: string
  total: string
  paymentStatus: string
  paymentMethod: string | null
  itemCount: number
}

export interface SalesTransactionsReport {
  totalSales: number
  totalRevenue: string
  totalDiscount: string
  totalTax: string
  cancelledCount: number
  transactions: SaleTransaction[]
}

export function useSalesTransactionsReport(from?: string, to?: string) {
  return useQuery<SalesTransactionsReport>({
    queryKey: ['reports-sales-transactions', from, to],
    queryFn: async () => {
      const res = await fetch(apiUrl(`reports/sales-transactions${qs({ from, to })}`), { headers: authHeaders() })
      return jsonOrThrow(res, 'Failed to load sale report')
    }
  })
}

// ── Stocktake ────────────────────────────────────────────────────────────

export interface StocktakeSummary {
  id: number
  reference: string
  status: 'in_progress' | 'finalized'
  notes: string | null
  createdByName: string | null
  finalizedAt: string | null
  createdAt: string
}

export function useListStocktakes() {
  return useQuery<StocktakeSummary[]>({
    queryKey: ['stocktakes'],
    queryFn: async () => {
      const res = await fetch(apiUrl('stocktakes'), { headers: authHeaders() })
      return jsonOrThrow(res, 'Failed to load stocktakes')
    }
  })
}

export interface StocktakeItem {
  id: number
  stocktakeId: number
  medicineId: number
  medicineName: string
  systemQuantity: number
  countedQuantity: number | null
  notes: string | null
}

export interface StocktakeDetail extends StocktakeSummary {
  items: StocktakeItem[]
}

export function useStocktakeDetail(id: number | null) {
  return useQuery<StocktakeDetail>({
    queryKey: ['stocktake-detail', id],
    queryFn: async () => {
      const res = await fetch(apiUrl(`stocktakes/${id}`), { headers: authHeaders() })
      return jsonOrThrow(res, 'Failed to load stocktake')
    },
    enabled: id !== null
  })
}

export function useCreateStocktake() {
  const queryClient = useQueryClient()
  return useMutation<StocktakeSummary, Error, { reference?: string }>({
    mutationFn: async (data) => {
      const res = await fetch(apiUrl('stocktakes'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(data)
      })
      return jsonOrThrow(res, 'Failed to create stocktake')
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stocktakes'] })
  })
}

export function useUpdateStocktakeItem() {
  const queryClient = useQueryClient()
  return useMutation<StocktakeItem, Error, { stocktakeId: number; itemId: number; countedQuantity: number | null }>({
    mutationFn: async ({ stocktakeId, itemId, countedQuantity }) => {
      const res = await fetch(apiUrl(`stocktakes/${stocktakeId}/items/${itemId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ countedQuantity })
      })
      return jsonOrThrow(res, 'Failed to save count')
    },
    onSuccess: (_data, vars) =>
      queryClient.invalidateQueries({ queryKey: ['stocktake-detail', vars.stocktakeId] })
  })
}

export function useFinalizeStocktake() {
  const queryClient = useQueryClient()
  return useMutation<{ message: string; adjustments: number }, Error, { id: number }>({
    mutationFn: async ({ id }) => {
      const res = await fetch(apiUrl(`stocktakes/${id}/finalize`), {
        method: 'POST',
        headers: authHeaders()
      })
      return jsonOrThrow(res, 'Failed to finalize stocktake')
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['stocktake-detail', vars.id] })
      queryClient.invalidateQueries({ queryKey: ['stocktakes'] })
    }
  })
}

// ── Drug Interactions ───────────────────────────────────────────────────

export interface DrugInteraction {
  id: number
  medicine1Id: number
  medicine2Id: number
  severity: 'minor' | 'moderate' | 'major' | 'contraindicated'
  description?: string | null
  createdAt: string
}

export function useListDrugInteractions() {
  return useQuery<DrugInteraction[]>({
    queryKey: ['drug-interactions'],
    queryFn: async () => {
      const res = await fetch(apiUrl('drug-interactions'), { headers: authHeaders() })
      return jsonOrThrow(res, 'Failed to load drug interactions')
    }
  })
}

// ── Controlled Substance Logs ───────────────────────────────────────────

export interface ControlledSubstanceLog {
  id: number
  orderId: number | null
  medicineId: number
  medicineName: string | null
  patientId: number | null
  patientName: string | null
  prescriptionId: number | null
  quantityDispensed: number
  scheduleAtDispensing: 'II' | 'III' | 'IV' | 'V'
  dispensedByName: string | null
  notes: string | null
  createdAt: string
}

export function useControlledSubstanceLogs(limit = 50, offset = 0) {
  return useQuery<ControlledSubstanceLog[]>({
    queryKey: ['controlled-substance-logs', limit, offset],
    queryFn: async () => {
      const res = await fetch(apiUrl(`controlled-substance-logs?limit=${limit}&offset=${offset}`), {
        headers: authHeaders()
      })
      return jsonOrThrow(res, 'Failed to load controlled substance logs')
    }
  })
}

// ── Medicine batches (for supplier-return line items — ported from
// artifacts/web/src/hooks/use-medicine-batches.ts) ─────────────────────────

export interface MedicineBatch {
  id: number
  medicineId: number
  batchNumber: string | null
  expiryDate: string | null
  quantity: number
  costPrice: string | null
  supplierId: number | null
  purchaseOrderId: number | null
  receivedAt: string
  writeOffReason: string | null
  writeOffAt: string | null
  writeOffBy: number | null
  createdAt: string
}

export function useMedicineBatches(medicineId: number | undefined) {
  return useQuery<MedicineBatch[]>({
    queryKey: ['medicine-batches', medicineId],
    queryFn: async () => {
      const res = await fetch(apiUrl(`medicines/${medicineId}/batches`), { headers: authHeaders() })
      return jsonOrThrow(res, 'Failed to load batches')
    },
    enabled: !!medicineId
  })
}

// ── Add stock batch manually (POST /medicines/:id/batches) ─────────────────

export interface AddMedicineBatchInput {
  batchNumber?: string | null
  expiryDate?: string | null
  quantity: number
  costPrice?: string | null
}

export function useAddMedicineBatch(medicineId: number) {
  const queryClient = useQueryClient()
  return useMutation<MedicineBatch, Error, AddMedicineBatchInput>({
    mutationFn: async (data) => {
      const res = await fetch(apiUrl(`medicines/${medicineId}/batches`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(data)
      })
      return jsonOrThrow(res, 'Failed to add batch')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medicine-batches', medicineId] })
      queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('/api/medicines')
      })
    }
  })
}

// ── Write off a whole batch (POST /medicines/:id/batches/:batchId/write-off) ─

export function useWriteOffBatch(medicineId: number) {
  const queryClient = useQueryClient()
  return useMutation<{ message: string; quantityWrittenOff: number }, Error, { batchId: number; reason: string }>({
    mutationFn: async ({ batchId, reason }) => {
      const res = await fetch(apiUrl(`medicines/${medicineId}/batches/${batchId}/write-off`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ reason })
      })
      return jsonOrThrow(res, 'Failed to write off batch')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medicine-batches', medicineId] })
      queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('/api/medicines')
      })
    }
  })
}

// ── Write off N units from overall stock (POST /medicines/:id/write-off) ────

export function useWriteOffStock(medicineId: number) {
  const queryClient = useQueryClient()
  return useMutation<{ message: string }, Error, { quantity: number; reason: string }>({
    mutationFn: async (data) => {
      const res = await fetch(apiUrl(`medicines/${medicineId}/write-off`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(data)
      })
      return jsonOrThrow(res, 'Write-off failed')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medicine-batches', medicineId] })
      queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('/api/medicines')
      })
    }
  })
}

// ── Create supplier return (POST /supplier-returns — see
// artifacts/api-server/src/routes/supplier-returns.ts for the exact body
// shape; a return always targets a specific received batch per line, since
// that's what the server debits stock and cost from) ───────────────────────

export interface CreateSupplierReturnInput {
  supplierId: number
  purchaseOrderId?: number
  reason: string
  items: { medicineId: number; medicineBatchId: number; quantity: number; unitCost?: number }[]
}

export function useCreateSupplierReturn() {
  const queryClient = useQueryClient()
  return useMutation<{ id: number; totalAmount: string }, Error, CreateSupplierReturnInput>({
    mutationFn: async (data) => {
      const res = await fetch(apiUrl('supplier-returns'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(data)
      })
      return jsonOrThrow(res, 'Failed to process supplier return')
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['supplier-returns'] })
      queryClient.invalidateQueries({ queryKey: ['medicine-batches', variables.items[0]?.medicineId] })
      // Returns also debit medicine_batches and refresh each medicine's
      // stock aggregate server-side (see refreshMedicineAggregate in
      // artifacts/api-server/src/lib/batch-helpers.ts) and post a
      // supplier-ledger credit. All of those come from the generated
      // client and are keyed by URL path, not a plain string — match by
      // prefix so list, low-stock, expiring, and any open per-supplier
      // ledger detail all refresh together.
      queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === 'string' &&
          (query.queryKey[0].startsWith('/api/medicines') || query.queryKey[0].startsWith('/api/supplier-ledger'))
      })
    }
  })
}

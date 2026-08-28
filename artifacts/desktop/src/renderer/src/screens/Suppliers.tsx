import type { ReactElement } from 'react'
import { useState } from 'react'
import { Plus, Loader2, Truck, Pencil, Trash2, AlertTriangle } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import {
  useListSuppliers,
  useCreateSupplier,
  useUpdateSupplier,
  useDeleteSupplier,
  getListSuppliersQueryKey
} from '@workspace/api-client-react'
import type { Supplier } from '@workspace/api-client-react'
import { useUiStore } from '../store/uiStore'
import { getTheme, mono, serif } from '../theme'
import { useAuth } from '../hooks/useAuth'
import Modal from '../components/Modal'
import Field from '../components/Field'

interface SupplierFormData {
  name: string
  contactName?: string
  email?: string
  phone?: string
  address?: string
}

// Reusable create/edit modal — `supplier` null means create, otherwise edit.
function SupplierModal({ supplier, onClose }: { supplier: Supplier | null; onClose: () => void }): ReactElement {
  const { dark, showToast } = useUiStore()
  const theme = getTheme(dark)
  const queryClient = useQueryClient()
  const createSupplier = useCreateSupplier()
  const updateSupplier = useUpdateSupplier()
  const [name, setName] = useState(supplier?.name ?? '')
  const [contactName, setContactName] = useState(supplier?.contactName ?? '')
  const [email, setEmail] = useState(supplier?.email ?? '')
  const [phone, setPhone] = useState(supplier?.phone ?? '')
  const [address, setAddress] = useState(supplier?.address ?? '')

  const saving = createSupplier.isPending || updateSupplier.isPending

  const submit = async (): Promise<void> => {
    if (!name.trim()) {
      showToast('Supplier name is required')
      return
    }
    const data: SupplierFormData = {
      name: name.trim(),
      contactName: contactName.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      address: address.trim() || undefined
    }
    try {
      if (supplier) {
        await updateSupplier.mutateAsync({ id: supplier.id, data })
        showToast('Supplier updated')
      } else {
        await createSupplier.mutateAsync({ data })
        showToast(`Added ${name.trim()}`)
      }
      queryClient.invalidateQueries({ queryKey: getListSuppliersQueryKey() })
      onClose()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save supplier')
    }
  }

  return (
    <Modal title={supplier ? `Edit ${supplier.name}` : 'Add supplier'} onClose={onClose}>
      <Field label="Name" value={name} onChange={setName} placeholder="Acme Pharma Distribution" required />
      <Field label="Contact name" value={contactName} onChange={setContactName} placeholder="Contact person" />
      <Field label="Email" value={email} onChange={setEmail} placeholder="orders@acme.com" type="email" />
      <Field label="Phone" value={phone} onChange={setPhone} placeholder="+1 555 000 1234" />
      <Field label="Address" value={address} onChange={setAddress} placeholder="Street, city, region" textarea />
      <button
        onClick={submit}
        disabled={saving}
        style={{ background: theme.primary, color: '#fff' }}
        className="w-full mt-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60"
      >
        {saving && <Loader2 size={14} className="animate-spin" />}
        {saving ? 'Savingâ€¦' : supplier ? 'Save changes' : 'Add supplier'}
      </button>
    </Modal>
  )
}

// Small confirm dialog for the destructive delete action. Historical records
// (purchase orders / returns / payments) reference this supplier via a NOT NULL
// foreign key, so the database refuses the delete while any exist — the
// supplier can only be removed once nothing points at it. This preserves the
// supplier name on all past records automatically.
function DeleteSupplierModal({ supplier, onClose }: { supplier: Supplier; onClose: () => void }): ReactElement {
  const { dark, showToast } = useUiStore()
  const theme = getTheme(dark)
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const deleteSupplier = useDeleteSupplier({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSuppliersQueryKey() })
        showToast(`${supplier.name} deleted`)
        onClose()
      },
      onError: (err) => {
        // The ApiError extends Error, so its .message already carries the
        // backend's 409 text ("Cannot delete supplier: it is referenced by
        // existing records..."). Show it inline instead of a transient toast.
        setError(err instanceof Error ? err.message : 'Failed to delete supplier')
      }
    }
  })

  return (
    <Modal title="Delete supplier" onClose={onClose}>
      <p style={{ color: theme.muted }} className="text-sm">
        Delete <strong style={{ color: theme.text }}>{supplier.name}</strong>?
      </p>
      <p style={{ color: theme.muted }} className="text-sm mt-2">
        This can only be done if this supplier has <strong style={{ color: theme.text }}>no</strong>{' '}
        purchase orders, returns or payments. Past records keep the supplier&apos;s name, so a supplier that
        has any history can&apos;t be deleted here.
      </p>
      {error && (
        <div
          style={{ background: theme.redBg, color: theme.red, border: `1px solid ${theme.redBg}` }}
          className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs mt-3"
        >
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      <div className="flex gap-2 mt-4">
        <button
          onClick={onClose}
          disabled={deleteSupplier.isPending}
          style={{ border: `1px solid ${theme.borderStrong}`, color: theme.text }}
          className="flex-1 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          onClick={() => {
            setError(null)
            deleteSupplier.mutate({ id: supplier.id })
          }}
          disabled={deleteSupplier.isPending}
          style={{ background: theme.red, color: '#fff' }}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60"
        >
          {deleteSupplier.isPending && <Loader2 size={14} className="animate-spin" />}
          {deleteSupplier.isPending ? 'Deletingâ€¦' : 'Delete'}
        </button>
      </div>
    </Modal>
  )
}

export default function Suppliers(): ReactElement {
  const { dark } = useUiStore()
  const theme = getTheme(dark)
  const { user } = useAuth()
  const [showAdd, setShowAdd] = useState(false)
  const [editTarget, setEditTarget] = useState<Supplier | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null)
  const { data: suppliers = [], isLoading } = useListSuppliers()

  const canEdit = user?.role === 'admin' || user?.role === 'pharmacist'
  const canDelete = user?.role === 'admin'

  return (
    <div className="p-7">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 style={{ ...serif, color: theme.text }} className="text-xl font-semibold">
            Suppliers
          </h1>
          <p style={{ color: theme.muted }} className="text-xs mt-0.5">
            {suppliers.length} suppliers on file
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowAdd(true)}
            style={{ background: theme.primary, color: '#fff' }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
          >
            <Plus size={14} />
            Add supplier
          </button>
        )}
      </div>
      <div style={{ background: theme.card, border: `1px solid ${theme.border}` }} className="rounded-xl overflow-hidden">
        {isLoading ? (
          <p style={{ color: theme.muted }} className="p-4 text-sm">
            Loading suppliersâ€¦
          </p>
        ) : suppliers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div style={{ background: theme.primarySoft, color: theme.primaryText }} className="w-12 h-12 rounded-xl flex items-center justify-center mb-3">
              <Truck size={22} />
            </div>
            <p style={{ ...serif, color: theme.text }} className="text-base font-medium">
              No suppliers yet
            </p>
            <p style={{ color: theme.muted }} className="text-sm mt-1 mb-4 max-w-sm">
              Add the distributors you purchase from so you can create purchase orders against them.
            </p>
            {canEdit && (
              <button
                onClick={() => setShowAdd(true)}
                style={{ background: theme.primary, color: '#fff' }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
              >
                <Plus size={14} /> Add supplier
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr
                style={{ color: theme.muted, borderBottom: `1px solid ${theme.border}` }}
                className="text-left text-xs uppercase tracking-wide"
              >
                <th className="py-2.5 px-4 font-medium">Name</th>
                <th className="py-2.5 px-4 font-medium">Contact</th>
                <th className="py-2.5 px-4 font-medium">Email</th>
                <th className="py-2.5 px-4 font-medium">Phone</th>
                <th className="py-2.5 px-4 font-medium">Address</th>
                {(canEdit || canDelete) && (
                  <th className="py-2.5 px-4 font-medium text-right">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s, idx) => (
                <tr
                  key={s.id}
                  style={{ borderTop: idx ? `1px solid ${theme.border}` : 'none', '--row-hover': theme.hover } as React.CSSProperties}
                  className="transition-colors hover:bg-[color:var(--row-hover)]"
                >
                  <td className="py-2.5 px-4" style={{ color: theme.text }}>
                    <span className="font-medium">{s.name}</span>
                  </td>
                  <td className="py-2.5 px-4" style={{ color: theme.muted }}>
                    {s.contactName ?? 'â€”'}
                  </td>
                  <td className="py-2.5 px-4" style={{ ...mono, color: theme.muted }}>
                    {s.email ?? 'â€”'}
                  </td>
                  <td className="py-2.5 px-4" style={{ ...mono, color: theme.muted }}>
                    {s.phone ?? 'â€”'}
                  </td>
                  <td className="py-2.5 px-4" style={{ color: theme.muted }}>
                    {s.address ?? 'â€”'}
                  </td>
                  {(canEdit || canDelete) && (
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-1.5 justify-end">
                        {canEdit && (
                          <button
                            onClick={() => setEditTarget(s)}
                            style={{ border: `1px solid ${theme.borderStrong}`, color: theme.muted }}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors hover:opacity-70"
                            title="Edit supplier"
                          >
                            <Pencil size={13} /> Edit
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => setDeleteTarget(s)}
                            style={{ color: theme.muted }}
                            className="flex items-center justify-center w-7 h-7 rounded-md transition-colors hover:bg-[color:var(--row-hover)]"
                            title="Delete supplier"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {showAdd && <SupplierModal supplier={null} onClose={() => setShowAdd(false)} />}
      {editTarget && <SupplierModal supplier={editTarget} onClose={() => setEditTarget(null)} />}
      {deleteTarget && <DeleteSupplierModal supplier={deleteTarget} onClose={() => setDeleteTarget(null)} />}
    </div>
  )
}

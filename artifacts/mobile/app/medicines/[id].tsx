import { useColors } from '@/hooks/useColors';
import { formatCurrency, getErrorMessage } from '@/lib/format';
import { useMedicineBatches, useWriteOffBatch, type MedicineBatch } from '@/hooks/useMedicineBatches';
import { useAuth } from '@/contexts/AuthContext';
import { customFetch, useCreateMedicineUnit, useDeleteMedicineUnit, useListMedicineUnits, getListMedicineUnitsQueryKey, getGetMedicineQueryKey, useDeleteMedicine, useGetMedicine, useUpdateMedicine, getListMedicinesQueryKey, type MedicineUnit } from '@workspace/api-client-react';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  const colors = useColors();
  if (!value) return null;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: colors.mutedForeground }}>{label}</Text>
      <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.foreground, maxWidth: '55%', textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

// The generated MedicineUnit type predates per-pack barcode + direct sell
// price — the server returns them (and the desktop uses the same extension).
type UnitRow = MedicineUnit & {
  barcode?: string | null;
  sellPrice?: string | null;
};

function BatchRow({ batch, rank, colors, onWriteOff }: { batch: MedicineBatch; rank: number; colors: ReturnType<typeof useColors>; onWriteOff?: (batch: MedicineBatch) => void }) {
  const writtenOff = !!batch.writeOffAt;
  const days = batch.expiryDate ? Math.round((new Date(batch.expiryDate).getTime() - Date.now()) / 86400000) : null;
  const urgency = writtenOff ? colors.mutedForeground : days === null ? colors.mutedForeground : days <= 60 ? colors.destructive : days <= 150 ? colors.warning : colors.success;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View style={{
        width: 20, height: 20, borderRadius: 10, marginRight: 10,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: writtenOff ? colors.muted : rank === 1 ? colors.accent : colors.muted,
      }}>
        <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: writtenOff ? colors.mutedForeground : rank === 1 ? '#fff' : colors.mutedForeground }}>{rank}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: colors.foreground }}>{batch.batchNumber ?? `Batch #${batch.id}`}</Text>
        <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 1 }}>
          {batch.expiryDate ? `exp ${batch.expiryDate}` : 'no expiry set'} · {batch.quantity} units{batch.costPrice ? ` · ${formatCurrency(batch.costPrice)}/u` : ''}
        </Text>
      </View>
      {writtenOff ? (
        <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: colors.mutedForeground }}>WRITTEN OFF</Text>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {days !== null && <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: urgency }}>{days}d</Text>}
          {onWriteOff && (
            <TouchableOpacity onPress={() => onWriteOff(batch)} hitSlop={8}>
              <Feather name="x-circle" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

export default function MedicineDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: med, isLoading } = useGetMedicine(Number(id), {});
  const { data: batches, isLoading: batchesLoading } = useMedicineBatches(Number(id));
  const { user } = useAuth();
  const canWriteOff = user?.role === 'admin' || user?.role === 'pharmacist';
  const canManageUnits = user?.role === 'admin' || user?.role === 'pharmacist';
  const updateMed = useUpdateMedicine({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListMedicinesQueryKey() }); setEditing(false); } } });
  const deleteMed = useDeleteMedicine({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListMedicinesQueryKey() }); router.back(); } } });
  const writeOffBatch = useWriteOffBatch();
  const { data: unitRows } = useListMedicineUnits(Number(id), {});
  const createUnit = useCreateMedicineUnit({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListMedicineUnitsQueryKey(Number(id)) });
        qc.invalidateQueries({ queryKey: getGetMedicineQueryKey(Number(id)) });
        qc.invalidateQueries({ queryKey: getListMedicinesQueryKey() });
        setUf({ uName: '', uFactor: '', uBarcode: '', uSellPrice: '', uIsBase: false });
      },
      onError: (e) => Alert.alert('Could not add unit', getErrorMessage(e)),
    },
  });
  const deleteUnit = useDeleteMedicineUnit({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListMedicineUnitsQueryKey(Number(id)) });
        qc.invalidateQueries({ queryKey: getGetMedicineQueryKey(Number(id)) });
        qc.invalidateQueries({ queryKey: getListMedicinesQueryKey() });
      },
      onError: (e) => Alert.alert('Could not remove unit', getErrorMessage(e)),
    },
  });

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', barcode: '', price: '', quantity: '', manufacturer: '', description: '' });
  const [writeOffTarget, setWriteOffTarget] = useState<MedicineBatch | null>(null);
  const [writeOffReason, setWriteOffReason] = useState('');
  const [unitsOpen, setUnitsOpen] = useState(false);
  const [uf, setUf] = useState({ uName: '', uFactor: '', uBarcode: '', uSellPrice: '', uIsBase: false });
  const [editUnitId, setEditUnitId] = useState<number | null>(null);
  const [editUf, setEditUf] = useState({ uBarcode: '', uSellPrice: '' });
  const [savingUnit, setSavingUnit] = useState(false);

  const saveUnitEdit = async (unit: UnitRow) => {
    setSavingUnit(true);
    try {
      await customFetch(`/api/medicines/${id}/units/${unit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          barcode: editUf.uBarcode.trim() || null,
          sellPrice: editUf.uSellPrice.trim() ? parseFloat(editUf.uSellPrice) : null,
        }),
      });
      qc.invalidateQueries({ queryKey: getListMedicineUnitsQueryKey(Number(id)) });
      qc.invalidateQueries({ queryKey: getGetMedicineQueryKey(Number(id)) });
      qc.invalidateQueries({ queryKey: getListMedicinesQueryKey() });
      setEditUnitId(null);
    } catch (e) {
      Alert.alert('Could not save unit', getErrorMessage(e));
    } finally {
      setSavingUnit(false);
    }
  };

  useEffect(() => {
    if (med) setForm({ name: med.name, barcode: (med as any).barcode ?? '', price: med.price, quantity: String(med.quantity), manufacturer: med.manufacturer ?? '', description: med.description ?? '' });
  }, [med]);

  const stockColor = med ? (med.quantity <= 0 ? colors.destructive : med.quantity <= 10 ? '#EF4444' : med.quantity <= 30 ? '#F59E0B' : colors.success) : colors.muted;

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    heroCard: { backgroundColor: colors.primary, paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 0), paddingBottom: 28, paddingHorizontal: 20 },
    heroName: { color: '#fff', fontSize: 22, fontFamily: 'Inter_700Bold', marginTop: 16 },
    heroGeneric: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 4 },
    statsRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
    statChip: { flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: 12, alignItems: 'center' },
    statVal: { color: '#fff', fontSize: 18, fontFamily: 'Inter_700Bold' },
    statLbl: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontFamily: 'Inter_500Medium', marginTop: 2 },
    section: { backgroundColor: colors.card, marginHorizontal: 12, marginTop: 16, borderRadius: colors.radius, padding: 16 },
    sectionTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.foreground, marginBottom: 12 },
    label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground, marginBottom: 4, marginTop: 12 },
    inp: { height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, paddingHorizontal: 12, color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 14 },
    editBtn: { position: 'absolute', top: insets.top + (Platform.OS === 'web' ? 67 : 0) + 4, right: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    saveBtn: { margin: 12, height: 50, borderRadius: colors.radius, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    deleteBtn: { marginHorizontal: 12, marginBottom: 40, height: 48, borderRadius: colors.radius, borderWidth: 1.5, borderColor: colors.destructive, alignItems: 'center', justifyContent: 'center' },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: insets.bottom + 20, maxHeight: '85%' },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 14 },
    unitRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    row2: { flexDirection: 'row', gap: 10 },
    formChipText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
    checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
    checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  });

  if (isLoading || !med) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}><ActivityIndicator color={colors.primary} /></View>;

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={s.heroCard}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 4 }}>
          <Feather name="arrow-left" size={20} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>
        <Text style={s.heroName}>{med.name}</Text>
        {med.genericName ? <Text style={s.heroGeneric}>{med.genericName}</Text> : null}
        <View style={s.statsRow}>
          <View style={s.statChip}><Text style={s.statVal}>{med.quantity}</Text><Text style={s.statLbl}>In Stock</Text></View>
          <View style={s.statChip}><Text style={s.statVal}>{formatCurrency(med.price)}</Text><Text style={s.statLbl}>Unit Price</Text></View>
          <View style={[s.statChip, { backgroundColor: stockColor + '40' }]}><Text style={[s.statVal, { color: stockColor === colors.success ? '#fff' : stockColor }]}>{med.quantity <= 0 ? 'Out' : med.quantity <= 10 ? 'Critical' : 'OK'}</Text><Text style={s.statLbl}>Status</Text></View>
        </View>
      </View>
      <TouchableOpacity style={s.editBtn} onPress={() => setEditing(e => !e)}>
        <Feather name={editing ? 'x' : 'edit-2'} size={15} color="#fff" />
      </TouchableOpacity>

      {editing ? (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Edit Details</Text>
          <Text style={s.label}>Name</Text>
          <TextInput style={s.inp} value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} placeholderTextColor={colors.mutedForeground} />
          <Text style={s.label}>Barcode / SKU</Text>
          <TextInput style={s.inp} value={form.barcode} onChangeText={v => setForm(f => ({ ...f, barcode: v }))} placeholder="e.g. 8901234567890" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Text style={s.label}>Price ($)</Text><TextInput style={s.inp} value={form.price} onChangeText={v => setForm(f => ({ ...f, price: v }))} keyboardType="decimal-pad" placeholderTextColor={colors.mutedForeground} /></View>
            <View style={{ flex: 1 }}><Text style={s.label}>Quantity</Text><TextInput style={s.inp} value={form.quantity} onChangeText={v => setForm(f => ({ ...f, quantity: v }))} keyboardType="number-pad" placeholderTextColor={colors.mutedForeground} /></View>
          </View>
          <Text style={s.label}>Manufacturer</Text>
          <TextInput style={s.inp} value={form.manufacturer} onChangeText={v => setForm(f => ({ ...f, manufacturer: v }))} placeholderTextColor={colors.mutedForeground} />
          <Text style={s.label}>Description</Text>
          <TextInput style={[s.inp, { height: 70, paddingTop: 10 }]} value={form.description} onChangeText={v => setForm(f => ({ ...f, description: v }))} multiline placeholderTextColor={colors.mutedForeground} />
        </View>
      ) : (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Details</Text>
          {(med as any).barcode ? <InfoRow label="Barcode / SKU" value={(med as any).barcode} /> : null}
          <InfoRow label="Category" value={med.categoryName} />
          <InfoRow label="Manufacturer" value={med.manufacturer} />
          <InfoRow label="Prescription Required" value={med.prescriptionRequired ? 'Yes' : 'No'} />
          <InfoRow label="Description" value={med.description} />
        </View>
      )}

      {!editing && (
        <View style={s.section}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={s.sectionTitle}>Packaging Units</Text>
            {canManageUnits && (
              <TouchableOpacity onPress={() => setUnitsOpen(true)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.primary }}>
                <Text style={{ color: '#fff', fontSize: 11, fontFamily: 'Inter_700Bold' }}>Manage</Text>
              </TouchableOpacity>
            )}
          </View>
          {!unitRows?.length ? (
            <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground }}>
              No packaging units yet. Units control the pack barcode and per-pack sell price (e.g. tablet → strip → box).
            </Text>
          ) : (
            (unitRows as UnitRow[]).map((u) => (
              <View key={u.id} style={s.unitRow}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.foreground }}>
                    {u.unitName}{u.isBaseUnit ? ' (base)' : ''}
                  </Text>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: colors.mutedForeground }}>
                    1 = {u.conversionFactorToBase} base
                  </Text>
                </View>
                <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 4 }}>
                  {u.barcode ? `Barcode: ${u.barcode}` : 'No pack barcode'}
                  {u.sellPrice != null && u.sellPrice !== '' ? ` · Sell: ${formatCurrency(String(u.sellPrice))}` : ' · Auto (base × factor)'}
                </Text>
              </View>
            ))
          )}
        </View>
      )}

      {!editing && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Batches · sells oldest lot first (FEFO)</Text>
          {batchesLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />
          ) : !batches?.length ? (
            <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground }}>
              No batches received yet for this medicine. Batches are created when a purchase order is received.
            </Text>
          ) : (
            [...batches]
              .sort((a, b) => {
                if (!!a.writeOffAt !== !!b.writeOffAt) return a.writeOffAt ? 1 : -1;
                if (!a.expiryDate) return 1;
                if (!b.expiryDate) return -1;
                return a.expiryDate.localeCompare(b.expiryDate);
              })
              .map((b, i) => (
                <BatchRow
                  key={b.id}
                  batch={b}
                  rank={i + 1}
                  colors={colors}
                  onWriteOff={canWriteOff ? (batch) => { setWriteOffTarget(batch); setWriteOffReason(''); } : undefined}
                />
              ))
          )}
        </View>
      )}

      {editing && (
        <TouchableOpacity style={s.saveBtn} onPress={() => updateMed.mutate({ id: med.id, data: { name: form.name, price: form.price, quantity: parseInt(form.quantity) || 0, barcode: form.barcode.trim() || undefined, manufacturer: form.manufacturer || undefined, description: form.description || undefined } as any })} disabled={updateMed.isPending}>
          {updateMed.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Save Changes</Text>}
        </TouchableOpacity>
      )}

      <TouchableOpacity style={s.deleteBtn} onPress={() => Alert.alert('Delete Medicine', `Delete ${med.name}? This cannot be undone.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteMed.mutate({ id: med.id }) }])}>
        <Text style={{ color: colors.destructive, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>Delete Medicine</Text>
      </TouchableOpacity>

      <Modal visible={!!writeOffTarget} transparent animationType="slide" onRequestClose={() => setWriteOffTarget(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: insets.bottom + 20 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 14 }} />
            <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.foreground }}>Write off batch</Text>
            <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 4 }}>
              {writeOffTarget?.batchNumber ?? `Batch #${writeOffTarget?.id}`} · {writeOffTarget?.quantity} units will be removed from sellable stock.
            </Text>
            <Text style={s.label}>Reason *</Text>
            <TextInput
              style={[s.inp, { height: 70, paddingTop: 10 }]}
              value={writeOffReason}
              onChangeText={setWriteOffReason}
              multiline
              placeholder="e.g. Expired, damaged in storage, recalled…"
              placeholderTextColor={colors.mutedForeground}
            />
            <TouchableOpacity
              style={[s.saveBtn, { backgroundColor: colors.destructive, margin: 0, marginTop: 16 }]}
              disabled={writeOffBatch.isPending || !writeOffReason.trim()}
              onPress={() => {
                if (!writeOffTarget) return;
                writeOffBatch.mutate(
                  { medicineId: Number(id), batchId: writeOffTarget.id, reason: writeOffReason.trim() },
                  {
                    onSuccess: () => { setWriteOffTarget(null); qc.invalidateQueries({ queryKey: getListMedicinesQueryKey() }); },
                    onError: (e) => Alert.alert('Could not write off batch', getErrorMessage(e)),
                  },
                );
              }}
            >
              {writeOffBatch.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Write Off Batch</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setWriteOffTarget(null)} style={{ alignItems: 'center', paddingVertical: 14 }}>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={unitsOpen} transparent animationType="slide" onRequestClose={() => setUnitsOpen(false)}>
        <View style={s.overlay}>
          <View style={[s.sheet, { maxHeight: '85%' }]}>
            <View style={s.handle} />
            <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }}>
            <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.foreground, marginBottom: 4 }}>Packaging Units</Text>
            <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginBottom: 12 }}>
              Each unit can carry its own pack barcode and a direct sell price. Leave sell price empty to auto-derive (base price × factor).
            </Text>

            {(unitRows as UnitRow[] | undefined)?.map((u) => (
              <View key={u.id} style={[s.unitRow, { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                {editUnitId === u.id ? (
                  <>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.label}>Pack barcode</Text>
                        <TextInput style={s.inp} value={editUf.uBarcode} onChangeText={v => setEditUf(f => ({ ...f, uBarcode: v }))} placeholder="e.g. 8901234567890" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.label}>Sell price per pack</Text>
                        <TextInput style={s.inp} value={editUf.uSellPrice} onChangeText={v => setEditUf(f => ({ ...f, uSellPrice: v }))} keyboardType="decimal-pad" placeholder="Auto" placeholderTextColor={colors.mutedForeground} />
                      </View>
                    </View>
                    <TouchableOpacity style={[s.saveBtn, { margin: 0, marginTop: 12 }]} onPress={() => saveUnitEdit(u)} disabled={savingUnit}>
                      {savingUnit ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>Save unit</Text>}
                    </TouchableOpacity>
                  </>
                ) : (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 }}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.foreground }}>
                          {u.unitName}{u.isBaseUnit ? ' (base)' : ''}
                        </Text>
                        <Text style={{ fontSize: 10, fontFamily: 'Inter_500Medium', color: colors.mutedForeground }}>1 = {u.conversionFactorToBase} base</Text>
                      </View>
                      <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 3 }}>
                        {u.barcode ? `Barcode: ${u.barcode}` : 'No pack barcode'}
                        {u.sellPrice != null && u.sellPrice !== '' ? ` · Sell: ${formatCurrency(String(u.sellPrice))}` : ' · Auto (base × factor)'}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 12, marginLeft: 8 }}>
                      <TouchableOpacity hitSlop={8} onPress={() => { setEditUnitId(u.id); setEditUf({ uBarcode: u.barcode ?? '', uSellPrice: u.sellPrice != null && u.sellPrice !== '' ? String(u.sellPrice) : '' }); }}>
                        <Feather name="edit-2" size={15} color={colors.mutedForeground} />
                      </TouchableOpacity>
                      <TouchableOpacity hitSlop={8} onPress={() => Alert.alert('Remove Unit', `Remove "${u.unitName}"?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => deleteUnit.mutate({ id: Number(id), unitId: u.id }) }])}>
                        <Feather name="trash-2" size={15} color={colors.destructive} />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            ))}

            <Text style={[s.label, { marginTop: 18 }]}>Add packaging unit</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>Unit name</Text>
                <TextInput style={s.inp} value={uf.uName} onChangeText={v => setUf(f => ({ ...f, uName: v }))} placeholder="e.g. Strip, Box" placeholderTextColor={colors.mutedForeground} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>How many base units?</Text>
                <TextInput style={s.inp} value={uf.uFactor} onChangeText={v => setUf(f => ({ ...f, uFactor: v }))} keyboardType="number-pad" placeholder="e.g. 10" placeholderTextColor={colors.mutedForeground} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>Pack barcode (optional)</Text>
                <TextInput style={s.inp} value={uf.uBarcode} onChangeText={v => setUf(f => ({ ...f, uBarcode: v }))} placeholder="Scan or type" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>Sell price per pack</Text>
                <TextInput style={s.inp} value={uf.uSellPrice} onChangeText={v => setUf(f => ({ ...f, uSellPrice: v }))} keyboardType="decimal-pad" placeholder="Auto" placeholderTextColor={colors.mutedForeground} />
              </View>
            </View>
            <TouchableOpacity
              style={s.checkRow}
              onPress={() => setUf(f => ({ ...f, uIsBase: !f.uIsBase }))}
            >
              <View style={[s.checkbox, { backgroundColor: uf.uIsBase ? colors.primary : 'transparent', borderColor: uf.uIsBase ? colors.primary : colors.border }]}>
                {uf.uIsBase && <Feather name="check" size={13} color="#fff" />}
              </View>
              <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: colors.foreground }}>This is the base unit (set factor to 1, e.g. Tablet)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.saveBtn, { margin: 0, marginTop: 16 }]}
              onPress={() => {
                const factor = parseInt(uf.uFactor);
                if (!uf.uName.trim() || !factor || factor < 1) { Alert.alert('Missing info', 'Unit name and factor (≥1) are required.'); return; }
                createUnit.mutate({
                  id: Number(id),
                  data: {
                    unitName: uf.uName.trim(),
                    conversionFactorToBase: factor,
                    isBaseUnit: uf.uIsBase,
                    barcode: uf.uBarcode.trim() || null,
                    sellPrice: uf.uSellPrice.trim() ? parseFloat(uf.uSellPrice) : null,
                  } as any,
                });
              }}
              disabled={createUnit.isPending}
            >
              {createUnit.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>Add unit</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setUnitsOpen(false)} style={{ alignItems: 'center', paddingVertical: 14 }}>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 13 }}>Close</Text>
            </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

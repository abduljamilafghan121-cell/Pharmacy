import { useColors } from '@/hooks/useColors';
import { formatCurrency, getErrorMessage } from '@/lib/format';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import { useAuth } from '@/contexts/AuthContext';
import { useMedicineBatches, type MedicineBatch } from '@/hooks/useMedicineBatches';
import { useListMedicines, useListSuppliers, getListMedicinesQueryKey, getListSuppliersQueryKey, type Medicine, type Supplier } from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface SupplierReturn {
  id: number;
  supplierId: number;
  supplierName: string | null;
  purchaseOrderId: number | null;
  reason: string;
  totalAmount: string;
  createdAt: string;
}

function BatchPicker({ medicineId, selected, onSelect }: { medicineId: number; selected: MedicineBatch | null; onSelect: (b: MedicineBatch) => void }) {
  const colors = useColors();
  const { data: batches, isLoading } = useMedicineBatches(medicineId);
  if (isLoading) return <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />;
  if (!batches?.length) return <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 8 }}>No batches recorded for this medicine.</Text>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8, height: 60 }} contentContainerStyle={{ alignItems: 'center' }}>
      {batches.map((b) => (
        <TouchableOpacity
          key={b.id}
          onPress={() => onSelect(b)}
          style={{
            paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginRight: 8,
            borderWidth: 1.5, borderColor: selected?.id === b.id ? colors.primary : colors.border,
            backgroundColor: selected?.id === b.id ? colors.primary : colors.card,
          }}
        >
          <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: selected?.id === b.id ? '#fff' : colors.foreground }}>{b.batchNumber ?? `#${b.id}`}</Text>
          <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: selected?.id === b.id ? 'rgba(255,255,255,0.85)' : colors.mutedForeground }}>{b.quantity} in stock</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

export default function SupplierReturnsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const topInset = insets.top + (Platform.OS === 'web' ? 67 : 0);
  const canCreate = user?.role === 'admin' || user?.role === 'pharmacist';

  const { data, isLoading, refetch } = useApiQuery<SupplierReturn[]>(['supplier-returns'], '/api/supplier-returns');
  const { data: suppliers } = useListSuppliers({ query: { queryKey: getListSuppliersQueryKey(), enabled: canCreate } });
  const { data: medicines } = useListMedicines({}, { query: { queryKey: getListMedicinesQueryKey(), enabled: canCreate } });
  const createReturn = useApiMutation<
    SupplierReturn,
    { supplierId: number; reason: string; items: { medicineId: number; medicineBatchId: number; quantity: number }[] }
  >('/api/supplier-returns', [['supplier-returns']]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [medSearch, setMedSearch] = useState('');
  const [selectedMed, setSelectedMed] = useState<Medicine | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<MedicineBatch | null>(null);
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');

  const medResults = useMemo(() => {
    if (!medSearch.trim()) return [];
    const q = medSearch.trim().toLowerCase();
    return (medicines ?? []).filter((m) => m.name.toLowerCase().includes(q)).slice(0, 6);
  }, [medicines, medSearch]);

  const resetForm = () => {
    setSelectedSupplier(null); setSelectedMed(null); setSelectedBatch(null);
    setMedSearch(''); setQuantity(''); setReason('');
  };

  const submit = () => {
    const qty = parseInt(quantity, 10);
    if (!selectedSupplier || !selectedMed || !selectedBatch || !qty || !reason.trim()) {
      Alert.alert('Missing details', 'Supplier, medicine, batch, quantity, and reason are all required.');
      return;
    }
    createReturn.mutate(
      { supplierId: selectedSupplier.id, reason: reason.trim(), items: [{ medicineId: selectedMed.id, medicineBatchId: selectedBatch.id, quantity: qty }] },
      { onSuccess: () => { setSheetOpen(false); resetForm(); }, onError: (e) => Alert.alert('Could not create return', getErrorMessage(e)) },
    );
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.primary, paddingTop: topInset + 10, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    title: { color: '#fff', fontSize: 20, fontFamily: 'Inter_700Bold' },
    addBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    row: { backgroundColor: colors.card, marginHorizontal: 12, marginVertical: 4, borderRadius: colors.radius, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    name: { fontSize: 14, fontFamily: 'Inter_700Bold', color: colors.foreground },
    meta: { fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 2 },
    amt: { fontSize: 14, fontFamily: 'Inter_700Bold', color: colors.destructive },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: insets.bottom + 20, maxHeight: '88%' },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 14 },
    label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground, marginBottom: 4, marginTop: 10 },
    inp: { height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, paddingHorizontal: 12, color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 14 },
    submitBtn: { height: 50, borderRadius: colors.radius, backgroundColor: colors.destructive, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
    chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginRight: 8, borderWidth: 1.5 },
    medOption: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.secondary, marginTop: 6 },
    selectedMedChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 6 },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <TouchableOpacity onPress={() => router.back()}>
            <Feather name="arrow-left" size={20} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
          <Text style={s.title}>Supplier Returns</Text>
        </View>
        {canCreate && (
          <TouchableOpacity style={s.addBtn} onPress={() => setSheetOpen(true)}>
            <Feather name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingVertical: 8, paddingBottom: 40 }}
          refreshing={isLoading}
          onRefresh={refetch}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.row} onPress={() => router.push(`/supplier-returns/${item.id}` as any)}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={s.name}>{item.supplierName ?? 'Unknown supplier'}</Text>
                <Text style={s.meta}>{item.reason}</Text>
                <Text style={s.meta}>{new Date(item.createdAt).toLocaleDateString()}{item.purchaseOrderId ? ` · PO #${item.purchaseOrderId}` : ''}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.amt}>-{formatCurrency(item.totalAmount)}</Text>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} style={{ marginTop: 6 }} />
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60 }}>
              <Feather name="corner-up-left" size={48} color={colors.border} />
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', marginTop: 12 }}>No supplier returns yet</Text>
            </View>
          }
        />
      )}

      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={s.handle} />
              <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.foreground }}>New Supplier Return</Text>

              <Text style={s.label}>Supplier *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ height: 52 }} contentContainerStyle={{ alignItems: 'center' }}>
                {(suppliers ?? []).map((sup) => (
                  <TouchableOpacity
                    key={sup.id}
                    onPress={() => setSelectedSupplier(sup)}
                    style={[s.chip, { borderColor: selectedSupplier?.id === sup.id ? colors.primary : colors.border, backgroundColor: selectedSupplier?.id === sup.id ? colors.primary : colors.card }]}
                  >
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: selectedSupplier?.id === sup.id ? '#fff' : colors.foreground }}>{sup.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={s.label}>Medicine *</Text>
              {selectedMed ? (
                <View style={s.selectedMedChip}>
                  <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{selectedMed.name}</Text>
                  <TouchableOpacity onPress={() => { setSelectedMed(null); setSelectedBatch(null); }}><Feather name="x" size={16} color="#fff" /></TouchableOpacity>
                </View>
              ) : (
                <>
                  <TextInput style={s.inp} value={medSearch} onChangeText={setMedSearch} placeholder="Search medicines…" placeholderTextColor={colors.mutedForeground} />
                  {medResults.map((m) => (
                    <TouchableOpacity key={m.id} style={s.medOption} onPress={() => { setSelectedMed(m); setMedSearch(''); }}>
                      <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: colors.foreground }}>{m.name}</Text>
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {selectedMed && (
                <>
                  <Text style={s.label}>Batch *</Text>
                  <BatchPicker medicineId={selectedMed.id} selected={selectedBatch} onSelect={setSelectedBatch} />
                </>
              )}

              <Text style={s.label}>Quantity to return *</Text>
              <TextInput style={s.inp} value={quantity} onChangeText={setQuantity} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.mutedForeground} />
              <Text style={s.label}>Reason *</Text>
              <TextInput style={[s.inp, { height: 70, paddingTop: 10 }]} value={reason} onChangeText={setReason} multiline placeholder="e.g. Damaged in transit, wrong item shipped…" placeholderTextColor={colors.mutedForeground} />

              <TouchableOpacity style={s.submitBtn} disabled={createReturn.isPending} onPress={submit}>
                {createReturn.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Create Return</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setSheetOpen(false)} style={{ alignItems: 'center', paddingVertical: 14 }}>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

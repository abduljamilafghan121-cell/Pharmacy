import { useColors } from '@/hooks/useColors';
import { useCreatePurchaseOrder, useListMedicines, useListPurchaseOrders, useListSuppliers, getListPurchaseOrdersQueryKey } from '@workspace/api-client-react';
import { formatCurrency } from '@/lib/format';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

type DraftItem = { medicineId: number; quantity: string; unitPrice: string };

export default function PurchaseOrdersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const topInset = insets.top + (Platform.OS === 'web' ? 67 : 0);

  const [createOpen, setCreateOpen] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [items, setItems] = useState<DraftItem[]>([{ medicineId: 0, quantity: '', unitPrice: '' }]);

  const { data: pos, isLoading, refetch } = useListPurchaseOrders({});
  const { data: suppliers } = useListSuppliers({});
  const { data: medicines } = useListMedicines({}, {});
  const createPO = useCreatePurchaseOrder({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() }); setCreateOpen(false); setSupplierId(''); setItems([{ medicineId: 0, quantity: '', unitPrice: '' }]); } } });

  const statusColor = (s: string) => s === 'received' ? colors.success : s === 'cancelled' ? colors.destructive : '#F59E0B';

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.primary, paddingTop: topInset + 10, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { color: '#fff', fontSize: 20, fontFamily: 'Inter_700Bold' },
    addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    card: { backgroundColor: colors.card, marginHorizontal: 12, marginVertical: 4, borderRadius: colors.radius, padding: 14 },
    poId: { fontSize: 14, fontFamily: 'Inter_700Bold', color: colors.foreground },
    poSub: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 2 },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: insets.bottom + 20, maxHeight: '92%' },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: 12 },
    label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground, marginBottom: 4, marginTop: 10 },
    inp: { height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, paddingHorizontal: 12, color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 14 },
    select: { height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, paddingHorizontal: 12, justifyContent: 'center' },
    draftItem: { backgroundColor: colors.muted, borderRadius: 10, padding: 12, marginTop: 8 },
    submitBtn: { height: 50, borderRadius: colors.radius, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  });

  const addItem = () => setItems(prev => [...prev, { medicineId: 0, quantity: '', unitPrice: '' }]);
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));
  const updateItem = (i: number, patch: Partial<DraftItem>) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, ...patch } : it));

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
          <Feather name="arrow-left" size={20} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>
        <Text style={s.title}>Purchase Orders</Text>
        <TouchableOpacity style={s.addBtn} onPress={() => setCreateOpen(true)}>
          <Feather name="plus" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {isLoading ? <ActivityIndicator style={{ flex: 1 }} color={colors.primary} /> : (
        <FlatList
          data={pos ?? []}
          keyExtractor={p => String(p.id)}
          contentContainerStyle={{ paddingVertical: 8, paddingBottom: 40 }}
          refreshing={isLoading}
          onRefresh={refetch}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.card} onPress={() => router.push(`/purchase-orders/${item.id}` as any)}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View>
                  <Text style={s.poId}>PO #{item.id}</Text>
                  <Text style={s.poSub}>{item.supplierName ?? 'Unknown Supplier'}</Text>
                  <Text style={[s.poSub, { marginTop: 2 }]}>{new Date(item.createdAt).toLocaleDateString()} · {formatCurrency(item.total)}</Text>
                </View>
                <View>
                  <View style={[s.badge, { backgroundColor: statusColor(item.status) + '20' }]}>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: statusColor(item.status), textTransform: 'capitalize' }}>{item.status}</Text>
                  </View>
                  {item.status === 'pending' && (
                    <TouchableOpacity onPress={() => router.push(`/purchase-orders/${item.id}` as any)} style={{ marginTop: 8, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: colors.primary }}>
                      <Text style={{ color: '#fff', fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>Receive</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<View style={{ alignItems: 'center', marginTop: 60 }}><Feather name="package" size={48} color={colors.border} /><Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', marginTop: 12 }}>No purchase orders</Text></View>}
        />
      )}

      <Modal visible={createOpen} transparent animationType="slide" onRequestClose={() => setCreateOpen(false)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <KeyboardAwareScrollViewCompat style={{ paddingHorizontal: 20 }} keyboardShouldPersistTaps="handled">
              <Text style={{ fontSize: 17, fontFamily: 'Inter_700Bold', color: colors.foreground, marginTop: 8, marginBottom: 4 }}>New Purchase Order</Text>
              <Text style={s.label}>Supplier *</Text>
              <View style={s.select}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center' }}>
                  {(suppliers ?? []).map(sup => (
                    <TouchableOpacity key={sup.id} onPress={() => setSupplierId(String(sup.id))} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginRight: 6, backgroundColor: supplierId === String(sup.id) ? colors.primary : colors.muted }}>
                      <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: supplierId === String(sup.id) ? '#fff' : colors.mutedForeground }}>{sup.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <Text style={[s.label, { marginTop: 16 }]}>Lines</Text>
              {items.map((item, i) => (
                <View key={i} style={s.draftItem}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground }}>Line {i + 1}</Text>
                    {items.length > 1 && <TouchableOpacity onPress={() => removeItem(i)}><Feather name="trash-2" size={14} color={colors.destructive} /></TouchableOpacity>}
                  </View>
                  <View style={s.select}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center' }}>
                      {(medicines ?? []).slice(0, 20).map(med => (
                        <TouchableOpacity key={med.id} onPress={() => updateItem(i, { medicineId: med.id })} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, marginRight: 5, backgroundColor: item.medicineId === med.id ? colors.primary : colors.background }}>
                          <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: item.medicineId === med.id ? '#fff' : colors.mutedForeground }}>{med.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <TextInput style={[s.inp, { flex: 1 }]} value={item.quantity} onChangeText={v => updateItem(i, { quantity: v })} placeholder="Qty" placeholderTextColor={colors.mutedForeground} keyboardType="numeric" />
                    <TextInput style={[s.inp, { flex: 1 }]} value={item.unitPrice} onChangeText={v => updateItem(i, { unitPrice: v })} placeholder="Unit cost" placeholderTextColor={colors.mutedForeground} keyboardType="numeric" />
                  </View>
                </View>
              ))}
              <TouchableOpacity onPress={addItem} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
                <Feather name="plus-circle" size={16} color={colors.primary} />
                <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: colors.primary }}>Add Line</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.submitBtn} onPress={() => createPO.mutate({ data: { supplierId: parseInt(supplierId), items: items.filter(it => it.medicineId > 0).map(it => ({ medicineId: it.medicineId, quantity: parseInt(it.quantity) || 1, unitPrice: it.unitPrice })) } })} disabled={createPO.isPending}>
                {createPO.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Create Order</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setCreateOpen(false)} style={{ alignItems: 'center', paddingVertical: 14 }}>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }}>Cancel</Text>
              </TouchableOpacity>
            </KeyboardAwareScrollViewCompat>
          </View>
        </View>
      </Modal>
    </View>
  );
}

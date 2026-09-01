import { useColors } from '@/hooks/useColors';
import { formatCurrency } from '@/lib/format';
import {
  useCreateMedicine,
  useListCategories,
  useListMedicines,
  getListMedicinesQueryKey,
} from '@workspace/api-client-react';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

export default function StockScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const topInset = insets.top + (Platform.OS === 'web' ? 67 : 0);

  const [search, setSearch] = useState('');
  const [catId, setCatId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const emptyForm = {
    name: '', genericName: '', price: '', quantity: '', expiryDate: '',
    manufacturer: '', batchNumber: '', categoryId: null as number | null,
    description: '', controlledSchedule: '', drugClass: '', prescriptionRequired: false,
  };
  const [form, setForm] = useState(emptyForm);

  const { data: medicines, isLoading, refetch } = useListMedicines({ search: search || undefined, categoryId: catId ?? undefined }, {});
  const { data: categories } = useListCategories({});
  const createMed = useCreateMedicine({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListMedicinesQueryKey() }); setAddOpen(false); setForm(emptyForm); } } });

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.primary, paddingTop: topInset + 10, paddingBottom: 14, paddingHorizontal: 16 },
    headerTitle: { color: '#fff', fontSize: 20, fontFamily: 'Inter_700Bold' },
    searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, marginTop: 10, paddingHorizontal: 12, height: 40 },
    searchInput: { flex: 1, color: '#fff', fontFamily: 'Inter_400Regular', fontSize: 14, marginLeft: 8 },
    catChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginRight: 8, borderWidth: 1 },
    item: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, marginHorizontal: 12, marginVertical: 4, borderRadius: colors.radius, padding: 14 },
    iconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    itemName: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: colors.foreground },
    itemSub: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 2 },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
    badgeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
    fab: {
      position: 'absolute', bottom: 90 + insets.bottom + (Platform.OS === 'web' ? 34 : 0), right: 20,
      width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary,
      alignItems: 'center', justifyContent: 'center',
      shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 6,
    },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: insets.bottom + 20 },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: 12 },
    sheetTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', color: colors.foreground, margin: 20, marginBottom: 8 },
    label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground, marginBottom: 4, marginTop: 12 },
    inp: { height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, paddingHorizontal: 12, color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 14 },
    row2: { flexDirection: 'row', gap: 10 },
    submitBtn: { height: 50, borderRadius: colors.radius, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 20, marginHorizontal: 0 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
    formChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
    formChipText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
    textarea: { minHeight: 80, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, paddingHorizontal: 12, paddingVertical: 10, color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 14, textAlignVertical: 'top' },
    checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
    checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    hintBox: { backgroundColor: colors.muted, borderRadius: 10, padding: 12, marginTop: 16 },
    hintText: { fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, lineHeight: 16 },
  });

  const stockColor = (qty: number) => {
    if (qty <= 0) return colors.destructive;
    if (qty <= 10) return '#EF4444';
    if (qty <= 30) return '#F59E0B';
    return colors.success;
  };

  const stockLabel = (qty: number) => {
    if (qty <= 0) return 'Out of stock';
    if (qty <= 10) return 'Critical';
    if (qty <= 30) return 'Low';
    return 'In stock';
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Medicine Stock</Text>
        <View style={s.searchRow}>
          <Feather name="search" size={16} color="rgba(255,255,255,0.7)" />
          <TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder="Search medicines…" placeholderTextColor="rgba(255,255,255,0.5)" autoCapitalize="none" />
          {!!search && <TouchableOpacity onPress={() => setSearch('')}><Feather name="x" size={16} color="rgba(255,255,255,0.7)" /></TouchableOpacity>}
        </View>
      </View>

      <View style={{ height: 52, flexShrink: 0, flexGrow: 0 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center' }}>
          {[{ id: null, name: 'All' }, ...(categories ?? [])].map(cat => {
            const active = catId === cat.id;
            return (
              <TouchableOpacity key={cat.id ?? 'all'} style={[s.catChip, { backgroundColor: active ? colors.primary : colors.card, borderColor: active ? colors.primary : colors.border }]} onPress={() => setCatId(cat.id)}>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: active ? '#fff' : colors.mutedForeground }}>{cat.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={medicines ?? []}
          keyExtractor={m => String(m.id)}
          contentContainerStyle={{ paddingBottom: 120 + (Platform.OS === 'web' ? 34 : 0) }}
          refreshing={isLoading}
          onRefresh={refetch}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.item} onPress={() => router.push(`/medicines/${item.id}` as any)}>
              <View style={s.iconWrap}>
                <Ionicons name="medical-outline" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.itemName} numberOfLines={1}>{item.name}</Text>
                <Text style={s.itemSub}>{item.manufacturer ?? item.categoryName ?? 'Uncategorised'} · {formatCurrency(item.price)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <View style={[s.badge, { backgroundColor: stockColor(item.quantity) + '20' }]}>
                  <Text style={[s.badgeText, { color: stockColor(item.quantity) }]}>{item.quantity}</Text>
                </View>
                <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: stockColor(item.quantity) }}>{stockLabel(item.quantity)}</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60 }}>
              <Ionicons name="medical-outline" size={48} color={colors.border} />
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', marginTop: 12 }}>No medicines found</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity style={s.fab} onPress={() => setAddOpen(true)}>
        <Feather name="plus" size={22} color="#fff" />
      </TouchableOpacity>

      {/* Add medicine sheet */}
      <Modal visible={addOpen} transparent animationType="slide" onRequestClose={() => setAddOpen(false)}>
        <View style={s.overlay}>
          <View style={[s.sheet, { maxHeight: '90%' }]}>
            <View style={s.handle} />
            <Text style={s.sheetTitle}>Add Medicine</Text>
            <KeyboardAwareScrollViewCompat style={{ paddingHorizontal: 20 }} keyboardShouldPersistTaps="handled">
              <Text style={s.label}>Medicine Name *</Text>
              <TextInput style={s.inp} value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} placeholder="e.g. Amoxicillin 500mg" placeholderTextColor={colors.mutedForeground} />
              <Text style={s.label}>Generic Name</Text>
              <TextInput style={s.inp} value={form.genericName} onChangeText={v => setForm(f => ({ ...f, genericName: v }))} placeholder="e.g. Amoxicillin" placeholderTextColor={colors.mutedForeground} />
              <View style={s.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>Price ($) *</Text>
                  <TextInput style={s.inp} value={form.price} onChangeText={v => setForm(f => ({ ...f, price: v }))} keyboardType="numeric" placeholder="0.00" placeholderTextColor={colors.mutedForeground} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>Quantity *</Text>
                  <TextInput style={s.inp} value={form.quantity} onChangeText={v => setForm(f => ({ ...f, quantity: v }))} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.mutedForeground} />
                </View>
              </View>
              <Text style={s.label}>Expiry Date *</Text>
              <TextInput style={s.inp} value={form.expiryDate} onChangeText={v => setForm(f => ({ ...f, expiryDate: v }))} placeholder="YYYY-MM-DD" placeholderTextColor={colors.mutedForeground} />

              <Text style={s.label}>Category</Text>
              <View style={s.chipRow}>
                <TouchableOpacity
                  style={[s.formChip, { backgroundColor: form.categoryId === null ? colors.primary : colors.card, borderColor: form.categoryId === null ? colors.primary : colors.border }]}
                  onPress={() => setForm(f => ({ ...f, categoryId: null }))}
                >
                  <Text style={[s.formChipText, { color: form.categoryId === null ? '#fff' : colors.mutedForeground }]}>None</Text>
                </TouchableOpacity>
                {(categories ?? []).map(cat => {
                  const active = form.categoryId === cat.id;
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      style={[s.formChip, { backgroundColor: active ? colors.primary : colors.card, borderColor: active ? colors.primary : colors.border }]}
                      onPress={() => setForm(f => ({ ...f, categoryId: cat.id }))}
                    >
                      <Text style={[s.formChipText, { color: active ? '#fff' : colors.mutedForeground }]}>{cat.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={s.label}>Description</Text>
              <TextInput
                style={s.textarea}
                value={form.description}
                onChangeText={v => setForm(f => ({ ...f, description: v }))}
                placeholder="Dosage instructions, side effects, etc."
                placeholderTextColor={colors.mutedForeground}
                multiline
              />

              <View style={s.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>Manufacturer</Text>
                  <TextInput style={s.inp} value={form.manufacturer} onChangeText={v => setForm(f => ({ ...f, manufacturer: v }))} placeholder="Optional" placeholderTextColor={colors.mutedForeground} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>Batch #</Text>
                  <TextInput style={s.inp} value={form.batchNumber} onChangeText={v => setForm(f => ({ ...f, batchNumber: v }))} placeholder="Optional" placeholderTextColor={colors.mutedForeground} />
                </View>
              </View>

              <Text style={s.label}>Controlled Schedule</Text>
              <View style={s.chipRow}>
                {['Not controlled', 'II', 'III', 'IV', 'V'].map(opt => {
                  const val = opt === 'Not controlled' ? '' : opt;
                  const active = form.controlledSchedule === val;
                  return (
                    <TouchableOpacity
                      key={opt}
                      style={[s.formChip, { backgroundColor: active ? colors.primary : colors.card, borderColor: active ? colors.primary : colors.border }]}
                      onPress={() => setForm(f => ({ ...f, controlledSchedule: val }))}
                    >
                      <Text style={[s.formChipText, { color: active ? '#fff' : colors.mutedForeground }]}>{opt === 'Not controlled' ? opt : `Sch ${opt}`}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={s.label}>Drug Class</Text>
              <TextInput style={s.inp} value={form.drugClass} onChangeText={v => setForm(f => ({ ...f, drugClass: v }))} placeholder="e.g. NSAID, Beta-blocker" placeholderTextColor={colors.mutedForeground} />

              <TouchableOpacity style={s.checkRow} onPress={() => setForm(f => ({ ...f, prescriptionRequired: !f.prescriptionRequired }))}>
                <View style={[s.checkbox, { backgroundColor: form.prescriptionRequired ? colors.primary : 'transparent', borderColor: form.prescriptionRequired ? colors.primary : colors.border }]}>
                  {form.prescriptionRequired && <Feather name="check" size={14} color="#fff" />}
                </View>
                <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: colors.foreground }}>Requires Prescription</Text>
              </TouchableOpacity>

              <View style={s.hintBox}>
                <Text style={s.hintText}>💡 After adding the medicine, open it from Stock and use "Units" to define packaging levels (e.g. tablet → strip → box).</Text>
              </View>

              <TouchableOpacity
                style={s.submitBtn}
                onPress={() => createMed.mutate({
                  data: {
                    name: form.name,
                    price: form.price,
                    quantity: parseInt(form.quantity) || 0,
                    expiryDate: form.expiryDate,
                    genericName: form.genericName || undefined,
                    manufacturer: form.manufacturer || undefined,
                    batchNumber: form.batchNumber || undefined,
                    categoryId: form.categoryId ?? undefined,
                    description: form.description || undefined,
                    prescriptionRequired: form.prescriptionRequired,
                    ...(form.controlledSchedule ? { controlledSchedule: form.controlledSchedule } : {}),
                    ...(form.drugClass ? { drugClass: form.drugClass } : {}),
                  } as any,
                })}
                disabled={createMed.isPending}
              >
                {createMed.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Add Medicine</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setAddOpen(false)} style={{ alignItems: 'center', paddingVertical: 14 }}>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }}>Cancel</Text>
              </TouchableOpacity>
            </KeyboardAwareScrollViewCompat>
          </View>
        </View>
      </Modal>
    </View>
  );
}

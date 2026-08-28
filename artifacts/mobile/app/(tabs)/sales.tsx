import { useColors } from '@/hooks/useColors';
import { formatCurrency, getErrorMessage } from '@/lib/format';
import {
  customFetch,
  useCreateOrder,
  useListCategories,
  useListMedicines,
  useListOrders,
  type Medicine,
  type MedicineUnit,
  type Order,
} from '@workspace/api-client-react';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useQueryClient } from '@tanstack/react-query';
import { getListOrdersQueryKey, getListMedicinesQueryKey } from '@workspace/api-client-react';

type CartItem = {
  medicine: Medicine;
  qty: number;
  unitId?: number;
  unitName?: string;
  conversionFactor: number;
};

interface PrescriptionInfo {
  id: number;
  patientName: string | null;
  doctorName: string | null;
  status: string;
  maxRefills: number;
  refillsUsed: number;
}

function getUnits(medicine: Medicine): MedicineUnit[] {
  return (medicine.units as MedicineUnit[]) ?? [];
}

/** Picks the base packaging unit (conversionFactorToBase = 1) as the
 * default so a freshly-added cart line prices the same as before units
 * existed; mirrors artifacts/web/src/pages/NewSale.tsx. */
function defaultUnit(medicine: Medicine): { unitId?: number; unitName?: string; conversionFactor: number } {
  const units = getUnits(medicine);
  if (units.length === 0) return { conversionFactor: 1 };
  const sorted = [...units].sort((a, b) => a.conversionFactorToBase - b.conversionFactorToBase);
  const base =
    sorted.find((u) => u.isBaseUnit && u.conversionFactorToBase === 1) ??
    sorted.find((u) => u.conversionFactorToBase === 1) ??
    sorted[0];
  return { unitId: base.id, unitName: base.unitName, conversionFactor: base.conversionFactorToBase };
}

/** Price is stored per base unit — a strip of 10 is 10× the base price. */
function priceForUnit(basePriceStr: string, conversionFactor: number): number {
  return parseFloat(basePriceStr) * conversionFactor;
}

function MedicineCard({ med, inCart, onToggle }: { med: Medicine; inCart: boolean; onToggle: () => void }) {
  const colors = useColors();
  const s = StyleSheet.create({
    card: {
      flex: 1, margin: 4,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 12,
      borderWidth: 1.5,
      borderColor: inCart ? colors.primary : 'transparent',
    },
    iconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    name: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.foreground, marginBottom: 2 },
    stock: { fontSize: 10, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginBottom: 4 },
    rxBadge: { fontSize: 9, fontFamily: 'Inter_600SemiBold', color: colors.warning, marginBottom: 8 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    price: { fontSize: 14, fontFamily: 'Inter_700Bold', color: colors.primary },
    addBtn: {
      width: 28, height: 28, borderRadius: 8,
      backgroundColor: inCart ? colors.primary : colors.muted,
      alignItems: 'center', justifyContent: 'center',
    },
  });
  return (
    <Pressable style={s.card} onPress={onToggle}>
      <View style={s.iconWrap}>
        <Ionicons name="medical-outline" size={16} color={colors.primary} />
      </View>
      <Text style={s.name} numberOfLines={2}>{med.name}</Text>
      <Text style={s.stock}>{med.quantity} in stock</Text>
      {med.prescriptionRequired ? <Text style={s.rxBadge}>Rx required</Text> : <View style={{ marginBottom: 8 }} />}
      <View style={s.row}>
        <Text style={s.price}>{formatCurrency(med.price)}</Text>
        <View style={s.addBtn}>
          <Feather name={inCart ? 'check' : 'plus'} size={14} color={inCart ? '#fff' : colors.mutedForeground} />
        </View>
      </View>
    </Pressable>
  );
}

function statusColor(colors: ReturnType<typeof useColors>, status: string) {
  if (status === 'dispensed' || status === 'delivered') return colors.success;
  if (status === 'cancelled') return colors.destructive;
  return colors.warning;
}

function payColor(colors: ReturnType<typeof useColors>, status: string) {
  if (status === 'paid') return colors.success;
  if (status === 'refunded') return colors.warning;
  return colors.destructive;
}

function OrderRow({ order, onPress }: { order: Order; onPress: () => void }) {
  const colors = useColors();
  const s = StyleSheet.create({
    row: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card,
      borderRadius: colors.radius, padding: 14, marginHorizontal: 12, marginBottom: 8,
    },
    id: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.foreground },
    sub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 2 },
    total: { fontSize: 14, fontFamily: 'Inter_700Bold', color: colors.foreground, marginLeft: 8 },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, marginTop: 6, alignSelf: 'flex-start' },
    badgeText: { fontSize: 10, fontFamily: 'Inter_600SemiBold', textTransform: 'capitalize' },
  });
  return (
    <TouchableOpacity style={s.row} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <Text style={s.id}>Order #{order.id}</Text>
        <Text style={s.sub} numberOfLines={1}>
          {order.customerName ?? 'Walk-in customer'} · {new Date(order.createdAt).toLocaleString()}
        </Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <View style={[s.badge, { backgroundColor: statusColor(colors, order.status) + '20' }]}>
            <Text style={[s.badgeText, { color: statusColor(colors, order.status) }]}>{order.status}</Text>
          </View>
          <View style={[s.badge, { backgroundColor: payColor(colors, order.paymentStatus) + '20' }]}>
            <Text style={[s.badgeText, { color: payColor(colors, order.paymentStatus) }]}>{order.paymentStatus}</Text>
          </View>
        </View>
      </View>
      <Text style={s.total}>{formatCurrency(order.total)}</Text>
      <Feather name="chevron-right" size={16} color={colors.mutedForeground} style={{ marginLeft: 6 }} />
    </TouchableOpacity>
  );
}

export default function SalesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const router = useRouter();
  const topInset = insets.top + (Platform.OS === 'web' ? 67 : 0);

  const [mode, setMode] = useState<'shop' | 'history'>('shop');

  const [search, setSearch] = useState('');
  const [catId, setCatId] = useState<number | null>(null);
  const gridRef = useRef<FlatList<any>>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [payMethod, setPayMethod] = useState<'cash' | 'card' | 'insurance'>('cash');
  const [checkingOut, setCheckingOut] = useState(false);
  const [receipt, setReceipt] = useState<{ orderId: number; total: string } | null>(null);

  // Patient (optional) — matches web's "Patient Name" + "Patient ID" fields
  const [patientName, setPatientName] = useState('');
  const [patientIdInput, setPatientIdInput] = useState('');
  const patientId = patientIdInput ? Number(patientIdInput) : null;

  // Prescription — required for Rx & controlled drugs
  const [prescriptionInput, setPrescriptionInput] = useState('');
  const [prescriptionId, setPrescriptionId] = useState<number | null>(null);
  const [prescriptionInfo, setPrescriptionInfo] = useState<PrescriptionInfo | null>(null);
  const [prescriptionLoading, setPrescriptionLoading] = useState(false);
  const [prescriptionError, setPrescriptionError] = useState<string | null>(null);

  // History search
  const [historySearch, setHistorySearch] = useState('');

  const { data: categories } = useListCategories({});
  const { data: medicines, isLoading } = useListMedicines({ search: search || undefined, categoryId: catId ?? undefined }, {});

  // FlatList keeps its scroll offset when `data` shrinks (e.g. switching from
  // "All" to a narrow category like "Antibiotics") — without this, the view
  // stays scrolled past the new, shorter content and shows blank space above
  // the visible cards instead of jumping back to the top.
  useEffect(() => {
    gridRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [search, catId]);
  const { data: orders, isLoading: ordersLoading, refetch: refetchOrders } = useListOrders({ query: { queryKey: getListOrdersQueryKey(), enabled: mode === 'history' } });

  const createOrder = useCreateOrder({ mutation: {} });

  const cartTotal = cart.reduce((sum, c) => sum + priceForUnit(c.medicine.price, c.conversionFactor) * c.qty, 0);
  const requiresRx = cart.some(c => c.medicine.prescriptionRequired);

  // Tapping a medicine card SELECTS it (adds to cart at qty 1); tapping the
  // same card again DESELECTS it (removes from cart entirely). Quantity is
  // then adjusted from the cart sheet's +/- controls.
  const toggleCart = (med: Medicine) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCart(prev => {
      const existing = prev.find(c => c.medicine.id === med.id);
      if (existing) return prev.filter(c => c.medicine.id !== med.id);
      if (med.quantity === 0) {
        Alert.alert('Out of stock', `${med.name} is currently unavailable.`);
        return prev;
      }
      return [...prev, { medicine: med, qty: 1, ...defaultUnit(med) }];
    });
  };

  const removeFromCart = (id: number) => {
    setCart(prev => prev.filter(c => c.medicine.id !== id));
  };

  const updateQty = (id: number, delta: number) => {
    setCart(prev => prev
      .map(c => c.medicine.id === id ? { ...c, qty: Math.max(0, c.qty + delta) } : c)
      .filter(c => c.qty > 0));
  };

  const updateUnit = (id: number, unitId: number) => {
    setCart(prev => prev.map(c => {
      if (c.medicine.id !== id) return c;
      const unit = getUnits(c.medicine).find(u => u.id === unitId);
      if (!unit) return c;
      return { ...c, unitId: unit.id, unitName: unit.unitName, conversionFactor: unit.conversionFactorToBase };
    }));
  };

  const lookupPrescription = async () => {
    if (!prescriptionInput) return;
    const id = Number(prescriptionInput);
    setPrescriptionLoading(true);
    setPrescriptionError(null);
    setPrescriptionInfo(null);
    try {
      const row = await customFetchPrescription(id);
      setPrescriptionInfo(row);
      setPrescriptionId(id);
    } catch (e) {
      setPrescriptionInfo(null);
      setPrescriptionId(null);
      setPrescriptionError(`No prescription with ID #${id} exists.`);
    } finally {
      setPrescriptionLoading(false);
    }
  };

  const clearPrescription = () => {
    setPrescriptionId(null);
    setPrescriptionInput('');
    setPrescriptionInfo(null);
    setPrescriptionError(null);
  };

  const checkout = async () => {
    if (!cart.length) return;
    if (requiresRx && !prescriptionId) {
      Alert.alert('Prescription required', 'One or more items need a verified prescription. Link a prescription ID before completing this sale.');
      return;
    }
    setCheckingOut(true);
    try {
      // NOTE: createOrder already marks the order paid in one transaction —
      // there is no separate "capture payment" step, so we must not call a
      // second payment endpoint here (that was causing the "already paid" error).
      const order = await createOrder.mutateAsync({
        data: {
          paymentMethod: payMethod,
          items: cart.map(c => ({
            medicineId: c.medicine.id,
            quantity: c.qty,
            ...(c.unitId ? { unitId: c.unitId } : {}),
          })),
          ...(patientName.trim() ? { patientName: patientName.trim() } : {}),
          ...(patientId ? { patientId } : {}),
          ...(prescriptionId ? { prescriptionId } : {}),
        },
      });
      qc.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      qc.invalidateQueries({ queryKey: getListMedicinesQueryKey() });
      setReceipt({ orderId: order.id, total: order.total });
      setCart([]);
      setCartOpen(false);
      setPatientName('');
      setPatientIdInput('');
      clearPrescription();
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Sale failed', getErrorMessage(e));
    } finally {
      setCheckingOut(false);
    }
  };

  const filteredOrders = useMemo(() => {
    const list = [...(orders ?? [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (!historySearch.trim()) return list;
    const q = historySearch.trim().toLowerCase();
    return list.filter(o =>
      String(o.id).includes(q) ||
      (o.customerName ?? '').toLowerCase().includes(q)
    );
  }, [orders, historySearch]);

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      backgroundColor: colors.primary,
      paddingTop: topInset + 10,
      paddingBottom: 14,
      paddingHorizontal: 16,
    },
    headerTitle: { color: '#fff', fontSize: 20, fontFamily: 'Inter_700Bold' },
    headerSub: { color: 'rgba(255,255,255,0.65)', fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
    searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, marginTop: 12, paddingHorizontal: 12, height: 40 },
    searchInput: { flex: 1, color: '#fff', fontFamily: 'Inter_400Regular', fontSize: 14, marginLeft: 8 },
    segmentRow: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, marginTop: 12, padding: 3 },
    segmentBtn: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
    segmentText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
    catScrollWrap: { height: 52, flexShrink: 0 },
    catScroll: { paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center' },
    catChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, marginRight: 8, borderWidth: 1 },
    catLabel: { fontSize: 12, fontFamily: 'Inter_500Medium' },
    grid: { paddingHorizontal: 12, paddingBottom: 120 + (Platform.OS === 'web' ? 34 : 0) },
    cartFab: {
      position: 'absolute', bottom: 90 + insets.bottom + (Platform.OS === 'web' ? 34 : 0), right: 20,
      backgroundColor: colors.primary, borderRadius: 28,
      paddingHorizontal: 20, paddingVertical: 14,
      flexDirection: 'row', alignItems: 'center', gap: 8,
      shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 6,
    },
    cartFabText: { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 14 },
    // Cart modal
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: insets.bottom + 20, maxHeight: '88%' },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: 12, marginBottom: 8 },
    sheetTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.foreground, paddingHorizontal: 20, marginBottom: 4 },
    sheetScroll: { paddingHorizontal: 0 },
    cartItem: { paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    cartItemTopRow: { flexDirection: 'row', alignItems: 'center' },
    cartName: { flex: 1, fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.foreground },
    qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    qtyBtn: { width: 26, height: 26, borderRadius: 8, backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
    qtyVal: { width: 24, textAlign: 'center', fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.foreground },
    cartPrice: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.foreground, marginLeft: 12 },
    removeBtn: { marginLeft: 10, padding: 4 },
    unitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    unitChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, borderWidth: 1 },
    unitChipText: { fontSize: 11, fontFamily: 'Inter_500Medium' },
    sectionCard: { marginHorizontal: 20, marginTop: 14 },
    sectionTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.foreground, marginBottom: 8, flexDirection: 'row' },
    sectionHint: { fontSize: 10, fontFamily: 'Inter_400Regular', color: colors.mutedForeground },
    input: {
      backgroundColor: colors.muted, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
      fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.foreground, marginBottom: 8,
    },
    rxRow: { flexDirection: 'row', gap: 8 },
    rxLinkBtn: { paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
    rxLinkText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.primary },
    rxInfoBox: { borderRadius: 10, padding: 10, marginTop: 8, borderWidth: 1 },
    rxInfoTitle: { fontSize: 12, fontFamily: 'Inter_700Bold' },
    rxInfoLine: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },
    totalLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: colors.foreground },
    totalVal: { fontSize: 18, fontFamily: 'Inter_700Bold', color: colors.primary },
    payRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginTop: 10, marginBottom: 14 },
    payBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, alignItems: 'center' },
    checkoutBtn: {
      marginHorizontal: 20, height: 52, borderRadius: colors.radius,
      backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
    },
    // Receipt
    receiptOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    receiptCard: { backgroundColor: colors.card, borderRadius: 20, padding: 28, width: '100%', alignItems: 'center' },
    receiptCheck: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    receiptTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: colors.foreground, marginBottom: 4 },
    receiptSub: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginBottom: 6 },
    receiptAmt: { fontSize: 28, fontFamily: 'Inter_700Bold', color: colors.primary, marginBottom: 20 },
    receiptDone: { width: '100%', height: 48, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  });

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>{mode === 'shop' ? 'Point of Sale' : 'Sales History'}</Text>
        <Text style={s.headerSub}>{mode === 'shop' ? 'Search and add medicines to cart' : 'All counter sales and transactions'}</Text>

        <View style={s.segmentRow}>
          <TouchableOpacity style={[s.segmentBtn, mode === 'shop' && { backgroundColor: '#fff' }]} onPress={() => setMode('shop')}>
            <Text style={[s.segmentText, { color: mode === 'shop' ? colors.primary : 'rgba(255,255,255,0.8)' }]}>New Sale</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.segmentBtn, mode === 'history' && { backgroundColor: '#fff' }]} onPress={() => setMode('history')}>
            <Text style={[s.segmentText, { color: mode === 'history' ? colors.primary : 'rgba(255,255,255,0.8)' }]}>History</Text>
          </TouchableOpacity>
        </View>

        {mode === 'shop' ? (
          <View style={s.searchRow}>
            <Feather name="search" size={16} color="rgba(255,255,255,0.7)" />
            <TextInput
              style={s.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search medicines…"
              placeholderTextColor="rgba(255,255,255,0.5)"
              autoCapitalize="none"
            />
            {!!search && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Feather name="x" size={16} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={s.searchRow}>
            <Feather name="search" size={16} color="rgba(255,255,255,0.7)" />
            <TextInput
              style={s.searchInput}
              value={historySearch}
              onChangeText={setHistorySearch}
              placeholder="Search by order # or patient…"
              placeholderTextColor="rgba(255,255,255,0.5)"
              autoCapitalize="none"
            />
            {!!historySearch && (
              <TouchableOpacity onPress={() => setHistorySearch('')}>
                <Feather name="x" size={16} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {mode === 'shop' ? (
        <>
          {/* Categories */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catScrollWrap} contentContainerStyle={s.catScroll}>
            {[{ id: null, name: 'All' }, ...(categories ?? [])].map(cat => {
              const active = catId === cat.id;
              return (
                <TouchableOpacity key={cat.id ?? 'all'} style={[s.catChip, { backgroundColor: active ? colors.primary : colors.card, borderColor: active ? colors.primary : colors.border }]}
                  onPress={() => setCatId(cat.id)}>
                  <Text style={[s.catLabel, { color: active ? '#fff' : colors.mutedForeground }]}>{cat.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Medicine grid */}
          {isLoading ? (
            <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
          ) : (
            <FlatList
              ref={gridRef}
              style={{ flex: 1 }}
              data={(medicines ?? []).length % 2 === 1 ? [...(medicines ?? []), null] : (medicines ?? [])}
              keyExtractor={(m, i) => (m ? String(m.id) : `filler-${i}`)}
              numColumns={2}
              key="grid-2"
              contentContainerStyle={s.grid}
              columnWrapperStyle={{ gap: 0 }}
              renderItem={({ item }) =>
                item ? (
                  <MedicineCard
                    med={item}
                    inCart={cart.some(c => c.medicine.id === item.id)}
                    onToggle={() => toggleCart(item)}
                  />
                ) : (
                  <View style={{ flex: 1, margin: 4 }} />
                )
              }
              ListEmptyComponent={<Text style={{ textAlign: 'center', color: colors.mutedForeground, marginTop: 40, fontFamily: 'Inter_400Regular' }}>No medicines found</Text>}
              scrollEnabled={true}
            />
          )}

          {/* Cart FAB */}
          {cart.length > 0 && (
            <TouchableOpacity style={s.cartFab} onPress={() => setCartOpen(true)}>
              <Feather name="shopping-cart" size={18} color="#fff" />
              <Text style={s.cartFabText}>{cart.length} items · {formatCurrency(cartTotal)}</Text>
            </TouchableOpacity>
          )}
        </>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={o => String(o.id)}
          contentContainerStyle={{ paddingTop: 14, paddingBottom: 40 + insets.bottom }}
          refreshing={ordersLoading}
          onRefresh={refetchOrders}
          renderItem={({ item }) => (
            <OrderRow order={item} onPress={() => router.push(`/orders/${item.id}` as any)} />
          )}
          ListEmptyComponent={
            ordersLoading
              ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
              : <Text style={{ textAlign: 'center', color: colors.mutedForeground, marginTop: 40, fontFamily: 'Inter_400Regular' }}>No sales recorded yet</Text>
          }
        />
      )}

      {/* Cart sheet */}
      <Modal visible={cartOpen} transparent animationType="slide" onRequestClose={() => setCartOpen(false)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <Text style={s.sheetTitle}>Cart</Text>
            <ScrollView style={{ maxHeight: '100%' }}>
              <ScrollView style={{ maxHeight: 260 }} nestedScrollEnabled scrollEnabled={cart.length > 2}>
                {cart.map(c => {
                  const units = getUnits(c.medicine);
                  return (
                    <View key={c.medicine.id} style={s.cartItem}>
                      <View style={s.cartItemTopRow}>
                        <Text style={s.cartName} numberOfLines={1}>{c.medicine.name}</Text>
                        <View style={s.qtyRow}>
                          <TouchableOpacity style={s.qtyBtn} onPress={() => updateQty(c.medicine.id, -1)}>
                            <Feather name="minus" size={12} color={colors.foreground} />
                          </TouchableOpacity>
                          <Text style={s.qtyVal}>{c.qty}</Text>
                          <TouchableOpacity style={s.qtyBtn} onPress={() => updateQty(c.medicine.id, 1)}>
                            <Feather name="plus" size={12} color={colors.foreground} />
                          </TouchableOpacity>
                        </View>
                        <Text style={s.cartPrice}>{formatCurrency(priceForUnit(c.medicine.price, c.conversionFactor) * c.qty)}</Text>
                        <TouchableOpacity style={s.removeBtn} onPress={() => removeFromCart(c.medicine.id)}>
                          <Feather name="trash-2" size={15} color={colors.destructive} />
                        </TouchableOpacity>
                      </View>
                      {units.length > 0 && (
                        <View style={s.unitRow}>
                          {[...units].sort((a, b) => a.conversionFactorToBase - b.conversionFactorToBase).map(u => {
                            const active = c.unitId === u.id;
                            return (
                              <TouchableOpacity
                                key={u.id}
                                style={[s.unitChip, { backgroundColor: active ? colors.primary : colors.muted, borderColor: active ? colors.primary : colors.border }]}
                                onPress={() => updateUnit(c.medicine.id, u.id)}
                              >
                                <Text style={[s.unitChipText, { color: active ? '#fff' : colors.mutedForeground }]}>{u.unitName}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>

              {/* Patient */}
              <View style={s.sectionCard}>
                <Text style={s.sectionTitle}>Patient</Text>
                <Text style={[s.sectionHint, { marginBottom: 6 }]}>Patient Name is optional · Patient ID enables safety checks</Text>
                <TextInput
                  style={s.input}
                  value={patientName}
                  onChangeText={setPatientName}
                  placeholder="Patient name (optional)"
                  placeholderTextColor={colors.mutedForeground}
                />
                <TextInput
                  style={s.input}
                  value={patientIdInput}
                  onChangeText={t => setPatientIdInput(t.replace(/[^0-9]/g, ''))}
                  placeholder="Patient ID (optional, for safety checks)"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="number-pad"
                />
              </View>

              {/* Prescription */}
              <View style={s.sectionCard}>
                <Text style={s.sectionTitle}>Prescription</Text>
                <Text style={[s.sectionHint, { marginBottom: 6 }]}>
                  {requiresRx ? 'Required — this cart contains a prescription-only medicine' : 'Required for Rx & controlled drugs'}
                </Text>
                <View style={s.rxRow}>
                  <TextInput
                    style={[s.input, { flex: 1, marginBottom: 0 }]}
                    value={prescriptionInput}
                    onChangeText={setPrescriptionInput}
                    placeholder="Prescription ID"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="number-pad"
                  />
                  {prescriptionId ? (
                    <TouchableOpacity style={s.rxLinkBtn} onPress={clearPrescription}>
                      <Feather name="x" size={16} color={colors.primary} />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={s.rxLinkBtn} onPress={lookupPrescription} disabled={!prescriptionInput || prescriptionLoading}>
                      {prescriptionLoading ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={s.rxLinkText}>Link</Text>}
                    </TouchableOpacity>
                  )}
                </View>
                {prescriptionError && (
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.destructive, marginTop: 6 }}>{prescriptionError}</Text>
                )}
                {prescriptionInfo && (
                  <View style={[s.rxInfoBox, {
                    backgroundColor: prescriptionInfo.status !== 'verified' ? '#FEF3C7' : '#ECFDF5',
                    borderColor: prescriptionInfo.status !== 'verified' ? colors.warning : colors.success,
                  }]}>
                    <Text style={[s.rxInfoTitle, { color: prescriptionInfo.status !== 'verified' ? colors.warning : colors.success }]}>
                      {prescriptionInfo.status !== 'verified' ? '⚠ Prescription not verified' : `✓ Rx #${prescriptionInfo.id} — verified`}
                    </Text>
                    {prescriptionInfo.doctorName && (
                      <Text style={[s.rxInfoLine, { color: colors.mutedForeground }]}>Doctor: {prescriptionInfo.doctorName}</Text>
                    )}
                    <Text style={[s.rxInfoLine, { color: colors.foreground }]}>
                      Refills: {prescriptionInfo.refillsUsed} used / {prescriptionInfo.maxRefills} allowed
                    </Text>
                  </View>
                )}
              </View>

              <View style={s.totalRow}>
                <Text style={s.totalLabel}>Total</Text>
                <Text style={s.totalVal}>{formatCurrency(cartTotal)}</Text>
              </View>

              <View style={s.payRow}>
                {(['cash', 'card', 'insurance'] as const).map(m => (
                  <TouchableOpacity key={m} style={[s.payBtn, { backgroundColor: payMethod === m ? colors.secondary : 'transparent', borderColor: payMethod === m ? colors.primary : colors.border }]}
                    onPress={() => setPayMethod(m)}>
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: payMethod === m ? colors.primary : colors.mutedForeground, textTransform: 'capitalize' }}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={s.checkoutBtn} onPress={checkout} disabled={checkingOut}>
                {checkingOut ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 15, fontFamily: 'Inter_600SemiBold' }}>Complete Sale · {formatCurrency(cartTotal)}</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Receipt */}
      <Modal visible={!!receipt} transparent animationType="fade" onRequestClose={() => setReceipt(null)}>
        <View style={s.receiptOverlay}>
          <View style={s.receiptCard}>
            <View style={s.receiptCheck}>
              <Feather name="check" size={28} color="#10B981" />
            </View>
            <Text style={s.receiptTitle}>Sale Complete!</Text>
            <Text style={s.receiptSub}>Order #{receipt?.orderId}</Text>
            <Text style={s.receiptAmt}>{formatCurrency(receipt?.total ?? '0')}</Text>
            <TouchableOpacity style={s.receiptDone} onPress={() => setReceipt(null)}>
              <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Prescriptions expose richer fields (doctorName, maxRefills, refillsUsed)
// than the generated Prescription type covers yet, so this hits the raw
// endpoint the same way artifacts/web/src/pages/NewSale.tsx does.
async function customFetchPrescription(id: number): Promise<PrescriptionInfo> {
  return customFetch<PrescriptionInfo>(`/api/prescriptions/${id}`, { method: 'GET' });
}

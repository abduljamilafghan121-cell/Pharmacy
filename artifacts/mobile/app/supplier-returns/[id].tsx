import { useColors } from '@/hooks/useColors';
import { formatCurrency } from '@/lib/format';
import { useApiQuery } from '@/hooks/useApi';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface SupplierReturnItem {
  id: number;
  medicineId: number;
  medicineName: string | null;
  medicineBatchId: number;
  quantity: number;
  unitCost: string;
  lineTotal: string;
}

interface SupplierReturnDetail {
  id: number;
  supplierId: number;
  supplierName: string | null;
  purchaseOrderId: number | null;
  reason: string;
  totalAmount: string;
  createdAt: string;
  items: SupplierReturnItem[];
}

export default function SupplierReturnDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const topInset = insets.top + (Platform.OS === 'web' ? 67 : 0);

  const { data: ret, isLoading } = useApiQuery<SupplierReturnDetail>(['supplier-returns', id], `/api/supplier-returns/${id}`);

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.primary, paddingTop: topInset + 8, paddingBottom: 20, paddingHorizontal: 20 },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    title: { color: '#fff', fontSize: 20, fontFamily: 'Inter_700Bold' },
    sub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 6 },
    amt: { color: '#fff', fontSize: 26, fontFamily: 'Inter_700Bold', marginTop: 12 },
    section: { backgroundColor: colors.card, marginHorizontal: 12, marginTop: 14, borderRadius: colors.radius, padding: 16 },
    sectionTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.foreground, marginBottom: 10 },
    metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
    metaLabel: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground },
    metaVal: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.foreground },
    itemRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    itemName: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.foreground },
    itemSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 2 },
    itemAmt: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.destructive, marginTop: 4 },
  });

  if (isLoading || !ret) {
    return <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.primary} /></View>;
  }

  return (
    <ScrollView style={s.container}>
      <View style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.back()}>
            <Feather name="arrow-left" size={20} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
          <Text style={s.title}>Return #{ret.id}</Text>
        </View>
        <Text style={s.sub}>{ret.supplierName ?? 'Unknown supplier'} · {new Date(ret.createdAt).toLocaleString()}</Text>
        <Text style={s.amt}>-{formatCurrency(ret.totalAmount)}</Text>
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>Details</Text>
        <View style={s.metaRow}><Text style={s.metaLabel}>Supplier</Text><Text style={s.metaVal}>{ret.supplierName ?? '—'}</Text></View>
        {ret.purchaseOrderId != null && (
          <View style={s.metaRow}><Text style={s.metaLabel}>Purchase Order</Text><Text style={s.metaVal}>#{ret.purchaseOrderId}</Text></View>
        )}
        <View style={s.metaRow}><Text style={s.metaLabel}>Reason</Text><Text style={[s.metaVal, { flexShrink: 1, textAlign: 'right' }]}>{ret.reason}</Text></View>
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>Items ({ret.items.length})</Text>
        {ret.items.map((it, i) => (
          <View key={it.id} style={[s.itemRow, i === ret.items.length - 1 && { borderBottomWidth: 0 }]}>
            <Text style={s.itemName}>{it.medicineName ?? `Medicine #${it.medicineId}`}</Text>
            <Text style={s.itemSub}>Qty {it.quantity} · Batch #{it.medicineBatchId} · {formatCurrency(it.unitCost)}/unit</Text>
            <Text style={s.itemAmt}>-{formatCurrency(it.lineTotal)}</Text>
          </View>
        ))}
      </View>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

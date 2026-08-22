import { useColors } from '@/hooks/useColors';
import { formatCurrency, getErrorMessage } from '@/lib/format';
import { useSellableBatches, type MedicineBatch } from '@/hooks/useMedicineBatches';
import {
  useGetPurchaseOrder,
  useReceivePurchaseOrder,
  getListPurchaseOrdersQueryKey,
  getListMedicinesQueryKey,
  type PurchaseOrderItem,
} from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** What the receiver decided to do for one line: top up an existing,
 * non-expired batch ("choice" holds its id), or create a new one. */
type ReceiveLine = { choice: 'new' | number; batchNumber: string; expiryDate: string };

function daysUntil(dateStr: string) {
  const ms = new Date(dateStr).getTime() - Date.now();
  return Math.round(ms / 86400000);
}

/** One PO line item, with its own batch picker. Each instance calls
 * useSellableBatches independently, which is what lets every line fetch its
 * own medicine's batches without breaking the rules of hooks. */
function ReceiveLineItem({
  item,
  colors,
  line,
  onChange,
}: {
  item: PurchaseOrderItem;
  colors: ReturnType<typeof useColors>;
  line: ReceiveLine;
  onChange: (patch: Partial<ReceiveLine>) => void;
}) {
  const { data: batches, isLoading } = useSellableBatches((item as any).medicineId);
  const selected = typeof line.choice === 'number' ? (batches as MedicineBatch[]).find((b) => b.id === line.choice) : undefined;

  const chip = (active: boolean) => ({
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, marginRight: 8,
    borderWidth: 1.5,
    borderColor: active ? colors.primary : colors.border,
    backgroundColor: active ? colors.primary : colors.card,
  });

  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.foreground }}>
            {item.medicineName ?? `Medicine #${(item as any).medicineId}`}
          </Text>
          <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 2 }}>
            Qty: {item.quantity} {item.unitName ? `(${item.unitName})` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground }}>{formatCurrency(item.unitPrice)} / unit</Text>
          <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.foreground }}>{formatCurrency(parseFloat(item.unitPrice) * item.quantity)}</Text>
        </View>
      </View>

      <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground, marginTop: 10, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 }}>
        Batch for this receipt
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ height: 60 }} contentContainerStyle={{ alignItems: 'center' }}>
        <TouchableOpacity style={chip(line.choice === 'new')} onPress={() => onChange({ choice: 'new' })}>
          <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: line.choice === 'new' ? '#fff' : colors.foreground }}>+ New batch</Text>
        </TouchableOpacity>
        {isLoading && <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 4, marginTop: 8 }} />}
        {(batches as MedicineBatch[]).map((b) => (
          <TouchableOpacity key={b.id} style={chip(line.choice === b.id)} onPress={() => onChange({ choice: b.id })}>
            <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: line.choice === b.id ? '#fff' : colors.foreground }}>{b.batchNumber ?? `#${b.id}`}</Text>
            <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: line.choice === b.id ? 'rgba(255,255,255,0.85)' : colors.mutedForeground }}>{b.quantity} in stock</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {line.choice === 'new' ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <TextInput
            style={{ flex: 1, height: 40, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, paddingHorizontal: 10, color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 12 }}
            value={line.batchNumber}
            onChangeText={(v) => onChange({ batchNumber: v })}
            placeholder="Batch number (optional)"
            placeholderTextColor={colors.mutedForeground}
          />
          <TextInput
            style={{ flex: 1, height: 40, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, paddingHorizontal: 10, color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 12 }}
            value={line.expiryDate}
            onChangeText={(v) => onChange({ expiryDate: v })}
            placeholder="Expiry YYYY-MM-DD"
            placeholderTextColor={colors.mutedForeground}
          />
        </View>
      ) : (
        selected && (
          <View style={{ marginTop: 10, borderRadius: 10, padding: 10, backgroundColor: colors.secondary }}>
            <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: colors.secondaryForeground, lineHeight: 16 }}>
              Adding {item.quantity} unit{item.quantity === 1 ? '' : 's'} to lot {selected.batchNumber ?? `#${selected.id}`} — expiry{' '}
              {selected.expiryDate ? `${selected.expiryDate} (${daysUntil(selected.expiryDate)}d)` : 'none'}, currently {selected.quantity} in stock.
              Cost will be recalculated as a weighted average.
            </Text>
          </View>
        )
      )}
    </View>
  );
}

export default function PurchaseOrderDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: po, isLoading } = useGetPurchaseOrder(Number(id), {});
  const receivePO = useReceivePurchaseOrder({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
        qc.invalidateQueries({ queryKey: getListMedicinesQueryKey() });
      },
      onError: (e) => Alert.alert('Could not receive order', getErrorMessage(e)),
    },
  });

  const [lines, setLines] = useState<Record<number, ReceiveLine>>({});

  // Default every line to "create new batch" once the order loads.
  useEffect(() => {
    if (po?.status !== 'pending' || !po.items?.length) return;
    setLines((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const item of po.items ?? []) {
        const medicineId = (item as any).medicineId as number;
        if (!next[medicineId]) {
          next[medicineId] = { choice: 'new', batchNumber: '', expiryDate: '' };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [po?.id, po?.status]);

  const statusColor = (s: string) => s === 'received' ? colors.success : s === 'cancelled' ? colors.destructive : colors.warning;

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.primary, paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 0) + 8, paddingBottom: 24, paddingHorizontal: 20 },
    title: { color: '#fff', fontSize: 22, fontFamily: 'Inter_700Bold', marginTop: 10 },
    sub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 4 },
    section: { backgroundColor: colors.card, marginHorizontal: 12, marginTop: 14, borderRadius: colors.radius, padding: 16 },
    sectionTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.foreground, marginBottom: 4 },
    receiveBtn: { marginHorizontal: 12, marginTop: 14, marginBottom: 40, height: 50, borderRadius: colors.radius, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  });

  if (isLoading || !po) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}><ActivityIndicator color={colors.primary} /></View>;

  const handleReceive = () => {
    const items = (po.items ?? []).map((item) => {
      const medicineId = (item as any).medicineId as number;
      const line = lines[medicineId];
      if (line && typeof line.choice === 'number') {
        return { medicineId, batchId: line.choice };
      }
      const batchNumber = line?.batchNumber?.trim();
      const expiryDate = line?.expiryDate?.trim();
      return {
        medicineId,
        ...(batchNumber ? { batchNumber } : {}),
        ...(expiryDate ? { expiryDate } : {}),
      };
    });
    Alert.alert('Receive Order', 'Update inventory with the batches selected below?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Receive', onPress: () => receivePO.mutate({ id: po.id, data: { items } }) },
    ]);
  };

  return (
    <ScrollView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><Feather name="arrow-left" size={20} color="rgba(255,255,255,0.8)" /></TouchableOpacity>
        <Text style={s.title}>PO #{po.id}</Text>
        <Text style={s.sub}>{po.supplierName ?? 'Unknown Supplier'} · {new Date(po.createdAt).toLocaleDateString()}</Text>
        <View style={{ marginTop: 12, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: statusColor(po.status) + '30' }}>
          <Text style={{ color: '#fff', fontSize: 12, fontFamily: 'Inter_600SemiBold', textTransform: 'capitalize' }}>{po.status}</Text>
        </View>
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>Items</Text>
        {po.status === 'pending' && (
          <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginBottom: 8 }}>
            Pick an existing batch to top it up, or leave "New batch" to start a fresh lot.
          </Text>
        )}
        {(po.items ?? []).map((item) =>
          po.status === 'pending' ? (
            <ReceiveLineItem
              key={item.id}
              item={item}
              colors={colors}
              line={lines[(item as any).medicineId] ?? { choice: 'new', batchNumber: '', expiryDate: '' }}
              onChange={(patch) => setLines((prev) => ({
                ...prev,
                [(item as any).medicineId]: { ...(prev[(item as any).medicineId] ?? { choice: 'new', batchNumber: '', expiryDate: '' }), ...patch },
              }))}
            />
          ) : (
            <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.foreground }}>{item.medicineName ?? `Medicine #${(item as any).medicineId}`}</Text>
                <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 2 }}>Qty: {item.quantity} {item.unitName ? `(${item.unitName})` : ''}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground }}>{formatCurrency(item.unitPrice)} / unit</Text>
                <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.foreground }}>{formatCurrency(parseFloat(item.unitPrice) * item.quantity)}</Text>
              </View>
            </View>
          )
        )}
      </View>

      <View style={s.section}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: colors.foreground }}>Total</Text>
          <Text style={{ fontSize: 18, fontFamily: 'Inter_700Bold', color: colors.primary }}>{formatCurrency(po.total)}</Text>
        </View>
      </View>

      {po.status === 'pending' && (
        <TouchableOpacity style={s.receiveBtn} onPress={handleReceive} disabled={receivePO.isPending}>
          {receivePO.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Receive & Update Stock</Text>}
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

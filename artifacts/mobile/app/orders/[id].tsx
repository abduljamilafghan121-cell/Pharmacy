import { useColors } from '@/hooks/useColors';
import { formatCurrency } from '@/lib/format';
import { useGetOrder, useUpdateOrderStatus, getListOrdersQueryKey } from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function OrderDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: order, isLoading } = useGetOrder(Number(id), {});
  const updateStatus = useUpdateOrderStatus({ mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListOrdersQueryKey() }) } });

  const statusColor = (s: string) => s === 'dispensed' || s === 'delivered' ? colors.success : s === 'cancelled' ? colors.destructive : '#F59E0B';
  const payColor = (s: string) => s === 'paid' ? colors.success : s === 'refunded' ? '#F59E0B' : colors.destructive;

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.primary, paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 0) + 8, paddingBottom: 24, paddingHorizontal: 20 },
    title: { color: '#fff', fontSize: 22, fontFamily: 'Inter_700Bold', marginTop: 10 },
    sub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 4 },
    badgesRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
    badge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
    section: { backgroundColor: colors.card, marginHorizontal: 12, marginTop: 14, borderRadius: colors.radius, padding: 16 },
    sectionTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.foreground, marginBottom: 12 },
    itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    actionRow: { flexDirection: 'row', gap: 10, marginHorizontal: 12, marginTop: 14, marginBottom: 40 },
    actionBtn: { flex: 1, height: 48, borderRadius: colors.radius, alignItems: 'center', justifyContent: 'center' },
  });

  if (isLoading || !order) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}><ActivityIndicator color={colors.primary} /></View>;

  return (
    <ScrollView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><Feather name="arrow-left" size={20} color="rgba(255,255,255,0.8)" /></TouchableOpacity>
        <Text style={s.title}>Order #{order.id}</Text>
        <Text style={s.sub}>{order.customerName ?? 'Walk-in Customer'} · {new Date(order.createdAt).toLocaleString()}</Text>
        <View style={s.badgesRow}>
          <View style={[s.badge, { backgroundColor: statusColor(order.status) + '30' }]}><Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#fff', textTransform: 'capitalize' }}>{order.status}</Text></View>
          <View style={[s.badge, { backgroundColor: payColor(order.paymentStatus) + '30' }]}><Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#fff', textTransform: 'capitalize' }}>{order.paymentStatus}</Text></View>
        </View>
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>Items</Text>
        {(order.items ?? []).map((item, i) => (
          <View key={item.id} style={[s.itemRow, i === (order.items?.length ?? 0) - 1 && { borderBottomWidth: 0 }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.foreground }}>{item.medicineName ?? `Medicine #${item.medicineId}`}</Text>
              <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 2 }}>Qty: {item.quantity} {item.unitName ? `(${item.unitName})` : ''}</Text>
            </View>
            <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.foreground }}>{formatCurrency(parseFloat(item.price) * item.quantity)}</Text>
          </View>
        ))}
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>Summary</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}><Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Subtotal</Text><Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>{formatCurrency(order.subtotal ?? order.total)}</Text></View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 }}><Text style={{ color: colors.foreground, fontSize: 15, fontFamily: 'Inter_700Bold' }}>Total</Text><Text style={{ color: colors.primary, fontSize: 18, fontFamily: 'Inter_700Bold' }}>{formatCurrency(order.total)}</Text></View>
      </View>

      {order.status === 'pending' && (
        <View style={s.actionRow}>
          <TouchableOpacity style={[s.actionBtn, { backgroundColor: colors.primary }]} onPress={() => updateStatus.mutate({ id: order.id, data: { status: 'dispensed' } })} disabled={updateStatus.isPending}>
            <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>Mark Dispensed</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.actionBtn, { borderWidth: 1.5, borderColor: colors.destructive }]} onPress={() => Alert.alert('Cancel Order', 'Cancel this order?', [{ text: 'No', style: 'cancel' }, { text: 'Cancel Order', style: 'destructive', onPress: () => updateStatus.mutate({ id: order.id, data: { status: 'cancelled' } }) }])}>
            <Text style={{ color: colors.destructive, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

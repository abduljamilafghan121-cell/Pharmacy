import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency } from '@/lib/format';
import {
  useGetInventoryReport,
  useGetLowStockMedicines,
  useGetSalesReport,
  useListOrders,
} from '@workspace/api-client-react';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function StatCard({ label, value, sub, icon, iconBg, onPress }: { label: string; value: string; sub?: string; icon: React.ReactNode; iconBg: string; onPress?: () => void }) {
  const colors = useColors();
  const s = StyleSheet.create({
    card: { flex: 1, backgroundColor: colors.card, borderRadius: colors.radius, padding: 14, margin: 4 },
    iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    val: { fontSize: 20, fontFamily: 'Inter_700Bold', color: colors.foreground },
    lbl: { fontSize: 11, fontFamily: 'Inter_500Medium', color: colors.mutedForeground, marginTop: 2 },
    sub: { fontSize: 10, fontFamily: 'Inter_400Regular', color: colors.success, marginTop: 2 },
  });
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper style={s.card} {...(onPress ? { onPress } : {})}>
      <View style={[s.iconWrap, { backgroundColor: iconBg }]}>{icon}</View>
      <Text style={s.val}>{value}</Text>
      <Text style={s.lbl}>{label}</Text>
      {sub ? <Text style={s.sub}>{sub}</Text> : null}
    </Wrapper>
  );
}

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const router = useRouter();

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const { data: invReport, isLoading: invLoading, refetch: refetchInv } = useGetInventoryReport({});
  const { data: salesReport, isLoading: salesLoading, refetch: refetchSales } = useGetSalesReport({ from: today, to: today }, {});
  const { data: lowStock, isLoading: lowLoading, refetch: refetchLow } = useGetLowStockMedicines({});
  const { data: orders, isLoading: ordersLoading, refetch: refetchOrders } = useListOrders({});

  const isLoading = invLoading || salesLoading || lowLoading || ordersLoading;
  const onRefresh = () => { refetchInv(); refetchSales(); refetchLow(); refetchOrders(); };

  const topInset = insets.top + (Platform.OS === 'web' ? 67 : 0);
  const recentOrders = (orders ?? []).slice(0, 5);

  const showAlertsDigest = () => {
    const low = invReport?.lowStockCount ?? 0;
    const expiring = invReport?.expiringCount ?? 0;
    const outOfStock = invReport?.outOfStockCount ?? 0;
    if (!low && !expiring && !outOfStock) {
      Alert.alert("You're all caught up", 'No low-stock, out-of-stock, or expiring items right now.');
      return;
    }
    const lines = [
      outOfStock ? `${outOfStock} medicine${outOfStock === 1 ? '' : 's'} out of stock` : null,
      low ? `${low} medicine${low === 1 ? '' : 's'} running low` : null,
      expiring ? `${expiring} batch${expiring === 1 ? '' : 'es'} expiring soon` : null,
    ].filter(Boolean).join('\n');
    Alert.alert('Needs attention', lines, [
      { text: 'View stock', onPress: () => router.push('/stock' as any) },
      { text: 'Dismiss', style: 'cancel' },
    ]);
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      backgroundColor: colors.primary,
      paddingTop: topInset + 12,
      paddingBottom: 24,
      paddingHorizontal: 20,
    },
    headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    greeting: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: 'Inter_500Medium' },
    name: { color: '#FFFFFF', fontSize: 20, fontFamily: 'Inter_700Bold', marginTop: 2 },
    bellBtn: {
      width: 40, height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(255,255,255,0.15)',
      alignItems: 'center', justifyContent: 'center',
      position: 'relative',
    },
    bellDot: {
      position: 'absolute', top: 8, right: 9,
      width: 8, height: 8, borderRadius: 4,
      backgroundColor: colors.accent,
      borderWidth: 1.5, borderColor: colors.primary,
    },
    statsRow: { flexDirection: 'row', marginHorizontal: 12, marginTop: -12 },
    sectionTitle: {
      fontSize: 14, fontFamily: 'Inter_600SemiBold',
      color: colors.foreground, marginLeft: 20, marginTop: 20, marginBottom: 10,
    },
    alertCard: {
      marginHorizontal: 16, backgroundColor: colors.card,
      borderRadius: colors.radius, overflow: 'hidden',
    },
    alertRow: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    alertDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
    alertName: { flex: 1, fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.foreground },
    alertSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 1 },
    orderRow: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    orderIcon: {
      width: 36, height: 36, borderRadius: 10,
      backgroundColor: colors.secondary,
      alignItems: 'center', justifyContent: 'center',
      marginRight: 12,
    },
    orderName: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.foreground },
    orderSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 1 },
    orderAmt: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.foreground },
    emptyText: { textAlign: 'center', color: colors.mutedForeground, fontSize: 13, fontFamily: 'Inter_400Regular', paddingVertical: 24 },
    quickRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 4 },
    quickBtn: {
      flex: 1, backgroundColor: colors.card, borderRadius: colors.radius,
      paddingVertical: 14, alignItems: 'center', gap: 6,
    },
    quickLabel: { fontSize: 11, fontFamily: 'Inter_500Medium', color: colors.mutedForeground },
  });

  const greetHour = new Date().getHours();
  const greet = greetHour < 12 ? 'Good morning' : greetHour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <View style={s.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 + (Platform.OS === 'web' ? 34 : 0) }}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Header */}
        <View style={s.header}>
          <View style={s.headerRow}>
            <View>
              <Text style={s.greeting}>{greet},</Text>
              <Text style={s.name}>{user?.name ?? 'Pharmacist'}</Text>
            </View>
            <TouchableOpacity style={s.bellBtn} onPress={showAlertsDigest}>
              <Ionicons name="notifications-outline" size={20} color="#FFFFFF" />
              {((invReport?.lowStockCount ?? 0) + (invReport?.expiringCount ?? 0) + (invReport?.outOfStockCount ?? 0)) > 0 && (
                <View style={s.bellDot} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          <StatCard
            label="Today's Revenue"
            value={formatCurrency(salesReport?.totalRevenue ?? '0')}
            icon={<Feather name="trending-up" size={16} color={colors.primary} />}
            iconBg={colors.secondary}
            onPress={() => router.push('/reports' as any)}
          />
          <StatCard
            label="Orders Today"
            value={String(salesReport?.totalOrders ?? 0)}
            icon={<Feather name="shopping-cart" size={16} color="#F59E0B" />}
            iconBg="#FFF8E1"
            onPress={() => router.push('/(tabs)/sales' as any)}
          />
        </View>
        <View style={s.statsRow}>
          <StatCard
            label="Low Stock Items"
            value={String(invReport?.lowStockCount ?? 0)}
            icon={<Ionicons name="warning-outline" size={16} color="#EF4444" />}
            iconBg="#FEF2F2"
            onPress={() => router.push('/(tabs)/stock' as any)}
          />
          <StatCard
            label="Total Medicines"
            value={String(invReport?.totalMedicines ?? 0)}
            icon={<Ionicons name="medical-outline" size={16} color="#10B981" />}
            iconBg="#ECFDF5"
            onPress={() => router.push('/(tabs)/stock' as any)}
          />
        </View>

        {/* Quick actions */}
        <Text style={s.sectionTitle}>Quick Actions</Text>
        <View style={s.quickRow}>
          {[
            { icon: 'shopping-cart', label: 'New Sale', route: '/(tabs)/sales' as const },
            { icon: 'package', label: 'Purchase Orders', route: '/purchase-orders' as const },
            { icon: 'users', label: 'Patients', route: '/(tabs)/patients' as const },
            { icon: 'bar-chart-2', label: 'Reports', route: '/reports' as const },
          ].map(q => (
            <TouchableOpacity key={q.label} style={s.quickBtn} onPress={() => router.push(q.route as any)}>
              <Feather name={q.icon as any} size={20} color={colors.primary} />
              <Text style={s.quickLabel}>{q.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Low stock alerts */}
        {(lowStock?.length ?? 0) > 0 && (
          <>
            <Text style={s.sectionTitle}>Low Stock Alerts</Text>
            <View style={s.alertCard}>
              {(lowStock ?? []).slice(0, 5).map((med, i) => (
                <TouchableOpacity key={med.id} style={[s.alertRow, i === (Math.min(4, (lowStock?.length ?? 1) - 1)) && { borderBottomWidth: 0 }]}
                  onPress={() => router.push(`/medicines/${med.id}` as any)}>
                  <View style={[s.alertDot, { backgroundColor: med.quantity < 5 ? '#EF4444' : '#F59E0B' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.alertName}>{med.name}</Text>
                    <Text style={s.alertSub}>{med.quantity} remaining</Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Recent orders */}
        <Text style={s.sectionTitle}>Recent Orders</Text>
        <View style={[s.alertCard, { marginBottom: 8 }]}>
          {ordersLoading ? (
            <ActivityIndicator style={{ padding: 20 }} color={colors.primary} />
          ) : recentOrders.length === 0 ? (
            <Text style={s.emptyText}>No orders yet</Text>
          ) : (
            recentOrders.map((order, i) => (
              <TouchableOpacity key={order.id} style={[s.orderRow, i === recentOrders.length - 1 && { borderBottomWidth: 0 }]}
                onPress={() => router.push(`/orders/${order.id}` as any)}>
                <View style={s.orderIcon}>
                  <Feather name="file-text" size={16} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.orderName}>Order #{order.id}</Text>
                  <Text style={s.orderSub}>{order.customerName ?? 'Walk-in'} · {order.status}</Text>
                </View>
                <Text style={s.orderAmt}>{formatCurrency(order.total)}</Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

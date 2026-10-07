import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';
import { useApiMutation } from '@/hooks/useApi';
import { usePharmacySettings } from '@/hooks/usePharmacySettings';
import { formatCurrency } from '@/lib/format';
import {
  useGetExpiringMedicines,
  useGetInventoryReport,
  useGetLowStockMedicines,
  useGetSalesReport,
  useGetTopMedicines,
  useListOrders,
} from '@workspace/api-client-react';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Alert,
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

// The digest endpoint isn't in the generated api-client-react client yet,
// same as artifacts/desktop/src/renderer/src/hooks/useNotifications.ts.
type DigestResponse = {
  message: string;
  summary: { lowStockCount: number; expiringCount: number; pendingPrescriptionCount: number };
};

// Local date (not UTC) as YYYY-MM-DD — toISOString() rolls over at UTC
// midnight, which is wrong for anyone west of Greenwich.
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysUntil(iso?: string | null): number | null {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

function expiryLabel(days: number | null): string {
  if (days === null) return '—';
  if (days < 0) return 'Expired';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `${days} days`;
}

function StatCard({ label, value, sub, subColor, icon, iconBg, onPress }: { label: string; value: string; sub?: string; subColor?: string; icon: React.ReactNode; iconBg: string; onPress?: () => void }) {
  const colors = useColors();
  const s = StyleSheet.create({
    card: { width: 162, backgroundColor: colors.card, borderRadius: colors.radius, padding: 14, marginRight: 8 },
    iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    val: { fontSize: 20, fontFamily: 'Inter_700Bold', color: colors.foreground },
    lbl: { fontSize: 11, fontFamily: 'Inter_500Medium', color: colors.mutedForeground, marginTop: 2 },
    sub: { fontSize: 10, fontFamily: 'Inter_500Medium', color: colors.success, marginTop: 4 },
  });
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper style={s.card} {...(onPress ? { onPress } : {})}>
      <View style={[s.iconWrap, { backgroundColor: iconBg }]}>{icon}</View>
      <Text style={s.val}>{value}</Text>
      <Text style={s.lbl}>{label}</Text>
      {sub ? <Text style={[s.sub, subColor ? { color: subColor } : null]}>{sub}</Text> : null}
    </Wrapper>
  );
}

function SectionHeader({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  const colors = useColors();
  const s = StyleSheet.create({
    row: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginLeft: 20, marginRight: 20, marginTop: 20, marginBottom: 10,
    },
    title: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: colors.foreground },
    action: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    actionText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: colors.mutedForeground },
  });
  return (
    <View style={s.row}>
      <Text style={s.title}>{title}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity style={s.action} onPress={onAction}>
          <Text style={s.actionText}>{actionLabel}</Text>
          <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const router = useRouter();
  const { data: settings } = usePharmacySettings();

  const now = new Date();
  const today = localDateStr(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = localDateStr(yesterdayDate);

  const { data: invReport, isLoading: invLoading, refetch: refetchInv } = useGetInventoryReport({});
  // Two-day range so today's numbers and the vs-yesterday trend both come
  // from the same byDay payload (matching artifacts/desktop Dashboard).
  const { data: salesReport, isLoading: salesLoading, refetch: refetchSales } = useGetSalesReport({ from: yesterday, to: today }, {});
  const { data: lowStock, isLoading: lowLoading, refetch: refetchLow } = useGetLowStockMedicines({});
  const { data: topMedicines, isLoading: topLoading, refetch: refetchTop } = useGetTopMedicines({});
  const { data: expiring, isLoading: expiringLoading, refetch: refetchExpiring } = useGetExpiringMedicines({});
  const { data: orders, isLoading: ordersLoading, refetch: refetchOrders } = useListOrders({});
  const digest = useApiMutation<DigestResponse, void>('/api/notifications/send-digest', []);

  const isLoading = invLoading || salesLoading || lowLoading || topLoading || expiringLoading || ordersLoading;
  const onRefresh = () => {
    refetchInv(); refetchSales(); refetchLow(); refetchTop(); refetchExpiring(); refetchOrders();
  };

  const topInset = insets.top + (Platform.OS === 'web' ? 67 : 0);
  const recentOrders = (orders ?? []).slice(0, 5);

  const todayRow = salesReport?.byDay.find((d) => d.date === today);
  const yesterdayRow = salesReport?.byDay.find((d) => d.date === yesterday);
  const todayRevenue = todayRow ? parseFloat(todayRow.revenue) : 0;
  const todayOrders = todayRow?.orders ?? 0;
  const avgBasket = todayOrders > 0 ? todayRevenue / todayOrders : 0;
  // Only show a trend arrow when there's a real prior day to compare against.
  const yesterdayRevenue = yesterdayRow ? parseFloat(yesterdayRow.revenue) : null;
  const revenueTrendPct =
    yesterdayRevenue != null && yesterdayRevenue > 0
      ? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 1000) / 10
      : null;

  const showAlertsDigest = () => {
    const low = invReport?.lowStockCount ?? 0;
    const expiringCount = invReport?.expiringCount ?? 0;
    const outOfStock = invReport?.outOfStockCount ?? 0;
    if (!low && !expiringCount && !outOfStock) {
      Alert.alert("You're all caught up", 'No low-stock, out-of-stock, or expiring items right now.');
      return;
    }
    const lines = [
      outOfStock ? `${outOfStock} medicine${outOfStock === 1 ? '' : 's'} out of stock` : null,
      low ? `${low} medicine${low === 1 ? '' : 's'} running low` : null,
      expiringCount ? `${expiringCount} batch${expiringCount === 1 ? '' : 'es'} expiring soon` : null,
    ].filter(Boolean).join('\n');
    Alert.alert('Needs attention', lines, [
      { text: 'View stock', onPress: () => router.push('/stock' as any) },
      { text: 'Dismiss', style: 'cancel' },
    ]);
  };

  const sendEmailDigest = () => {
    digest.mutate(undefined, {
      onSuccess: (data) =>
        Alert.alert(
          'Digest sent',
          `${data.summary.lowStockCount} low-stock, ${data.summary.expiringCount} expiring, ${data.summary.pendingPrescriptionCount} prescriptions pending`,
        ),
      onError: (err) => Alert.alert("Couldn't send digest", err.message || 'Try again later.'),
    });
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
    subtitle: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 4 },
    headerMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
    dateText: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontFamily: 'Inter_400Regular' },
    digestBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: 'rgba(255,255,255,0.15)',
      borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7,
    },
    digestText: { color: '#FFFFFF', fontSize: 11, fontFamily: 'Inter_600SemiBold' },
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
    statsRow: { paddingHorizontal: 12, marginTop: -12 },
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
    alertValue: { fontSize: 11, fontFamily: 'Inter_600SemiBold', marginLeft: 8 },
    moreText: {
      textAlign: 'center', color: colors.mutedForeground, fontSize: 11,
      fontFamily: 'Inter_500Medium', paddingVertical: 8,
    },
    rankChip: {
      width: 24, height: 24, borderRadius: 7, marginRight: 12,
      backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center',
    },
    rankText: { fontSize: 11, fontFamily: 'Inter_700Bold', color: colors.primary },
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
    emptyText: { textAlign: 'center', color: colors.mutedForeground, fontSize: 13, fontFamily: 'Inter_400Regular', paddingVertical: 24, paddingHorizontal: 20, lineHeight: 18 },
    quickRow: { paddingHorizontal: 16, gap: 10, marginBottom: 4 },
    quickBtn: {
      flex: 1, backgroundColor: colors.card, borderRadius: colors.radius,
      paddingVertical: 14, alignItems: 'center', gap: 6,
    },
    quickLabel: { fontSize: 11, fontFamily: 'Inter_500Medium', color: colors.mutedForeground },
  });

  const greetHour = new Date().getHours();
  const greet = greetHour < 12 ? 'Good morning' : greetHour < 18 ? 'Good afternoon' : 'Good evening';

  const quickActions: { icon: string; label: string; onPress: () => void }[] = [
    { icon: 'shopping-cart', label: 'New Sale', onPress: () => router.push('/(tabs)/sales' as any) },
    { icon: 'file-text', label: 'Prescriptions', onPress: () => router.push('/prescriptions' as any) },
    // Timestamp param so the stock screen re-opens the Add Medicine sheet
    // even when we're already sitting on it.
    { icon: 'plus-circle', label: 'Add Medicine', onPress: () => router.push({ pathname: '/stock', params: { add: String(Date.now()) } } as any) },
    { icon: 'package', label: 'Purchase Orders', onPress: () => router.push('/purchase-orders' as any) },
    { icon: 'users', label: 'Patients', onPress: () => router.push('/(tabs)/patients' as any) },
    { icon: 'bar-chart-2', label: 'Reports', onPress: () => router.push('/reports' as any) },
  ];

  const lowStockList = lowStock ?? [];
  const expiringList = expiring ?? [];
  const topList = topMedicines ?? [];

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
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={s.greeting}>{greet},</Text>
              <Text style={s.name}>{user?.name ?? 'Pharmacist'}</Text>
              <Text style={s.subtitle} numberOfLines={1}>
                Here's what's happening at {settings?.name ?? 'your pharmacy'}.
              </Text>
            </View>
            <TouchableOpacity style={s.bellBtn} onPress={showAlertsDigest}>
              <Ionicons name="notifications-outline" size={20} color="#FFFFFF" />
              {((invReport?.lowStockCount ?? 0) + (invReport?.expiringCount ?? 0) + (invReport?.outOfStockCount ?? 0)) > 0 && (
                <View style={s.bellDot} />
              )}
            </TouchableOpacity>
          </View>
          <View style={s.headerMeta}>
            <Text style={s.dateText}>
              {now.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
            </Text>
            {user?.role === 'admin' && (
              <TouchableOpacity style={s.digestBtn} onPress={sendEmailDigest} disabled={digest.isPending}>
                {digest.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Feather name="mail" size={13} color="#FFFFFF" />
                )}
                <Text style={s.digestText}>Email Digest</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Stats */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.statsRow}>
          <StatCard
            label="Today's Revenue"
            value={formatCurrency(todayRevenue)}
            sub={revenueTrendPct != null ? `${revenueTrendPct >= 0 ? '▲' : '▼'} ${Math.abs(revenueTrendPct)}% vs yesterday` : undefined}
            subColor={revenueTrendPct == null ? undefined : revenueTrendPct >= 0 ? colors.success : colors.destructive}
            icon={<Feather name="trending-up" size={16} color={colors.primary} />}
            iconBg={colors.secondary}
            onPress={() => router.push('/reports' as any)}
          />
          <StatCard
            label="Avg. Basket"
            value={todayOrders > 0 ? formatCurrency(avgBasket) : '—'}
            icon={<Feather name="credit-card" size={16} color="#6366F1" />}
            iconBg="#EEF2FF"
            onPress={() => router.push('/(tabs)/sales' as any)}
          />
          <StatCard
            label="Orders Today"
            value={String(todayOrders)}
            icon={<Feather name="shopping-cart" size={16} color="#F59E0B" />}
            iconBg="#FFF8E1"
            onPress={() => router.push('/(tabs)/sales' as any)}
          />
          <StatCard
            label="Low Stock Items"
            value={String(invReport?.lowStockCount ?? 0)}
            icon={<Ionicons name="warning-outline" size={16} color="#EF4444" />}
            iconBg="#FEF2F2"
            onPress={() => router.push('/stock' as any)}
          />
          <StatCard
            label="Expiring < 30d"
            value={String(invReport?.expiringCount ?? 0)}
            icon={<Ionicons name="time-outline" size={16} color="#EF4444" />}
            iconBg="#FEF2F2"
            onPress={() => router.push('/stock' as any)}
          />
          <StatCard
            label="Out of Stock"
            value={String(invReport?.outOfStockCount ?? 0)}
            icon={<Feather name="package" size={16} color="#EF4444" />}
            iconBg="#FEF2F2"
            onPress={() => router.push('/stock' as any)}
          />
          <StatCard
            label="Total Medicines"
            value={String(invReport?.totalMedicines ?? 0)}
            icon={<Ionicons name="medical-outline" size={16} color="#10B981" />}
            iconBg="#ECFDF5"
            onPress={() => router.push('/stock' as any)}
          />
        </ScrollView>

        {/* Quick actions */}
        <SectionHeader title="Quick Actions" />
        <View style={s.quickRow}>
          {[quickActions.slice(0, 3), quickActions.slice(3, 6)].map((row, ri) => (
            <View key={ri} style={{ flexDirection: 'row', gap: 10 }}>
              {row.map((q) => (
                <TouchableOpacity key={q.label} style={s.quickBtn} onPress={q.onPress}>
                  <Feather name={q.icon as any} size={20} color={colors.primary} />
                  <Text style={s.quickLabel}>{q.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>

        {/* Top selling medicines */}
        <SectionHeader title="Top Selling Medicines" actionLabel="Reports" onAction={() => router.push('/reports' as any)} />
        <View style={s.alertCard}>
          {topLoading ? (
            <ActivityIndicator style={{ padding: 20 }} color={colors.primary} />
          ) : topList.length === 0 ? (
            <Text style={s.emptyText}>No sales data yet — top sellers will appear here once you make a few sales.</Text>
          ) : (
            topList.slice(0, 5).map((item, i, arr) => (
              <TouchableOpacity
                key={item.medicineId}
                style={[s.orderRow, i === Math.min(4, arr.length - 1) && { borderBottomWidth: 0 }]}
                onPress={() => router.push('/reports' as any)}
              >
                <View style={s.rankChip}>
                  <Text style={s.rankText}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.orderName} numberOfLines={1}>{item.medicineName}</Text>
                  <Text style={s.orderSub}>{item.totalSold} sold</Text>
                </View>
                <Text style={s.orderAmt}>{formatCurrency(item.revenue)}</Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Low stock alerts */}
        {lowStockList.length > 0 && (
          <>
            <SectionHeader title="Low Stock Alerts" actionLabel="Stock" onAction={() => router.push('/stock' as any)} />
            <View style={s.alertCard}>
              {lowStockList.slice(0, 5).map((med, i) => (
                <TouchableOpacity
                  key={med.id}
                  style={[s.alertRow, i === Math.min(4, lowStockList.length - 1) && { borderBottomWidth: 0 }]}
                  onPress={() => router.push(`/medicines/${med.id}` as any)}
                >
                  <View style={[s.alertDot, { backgroundColor: med.quantity < 5 ? '#EF4444' : '#F59E0B' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.alertName}>{med.name}</Text>
                    <Text style={s.alertSub}>{med.quantity} remaining</Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              ))}
              {lowStockList.length > 5 && <Text style={s.moreText}>+{lowStockList.length - 5} more</Text>}
            </View>
          </>
        )}

        {/* Expiring soon */}
        {expiringList.length > 0 && (
          <>
            <SectionHeader title="Expiring Soon" actionLabel="Stock" onAction={() => router.push('/stock' as any)} />
            <View style={s.alertCard}>
              {expiringList.slice(0, 5).map((med, i) => {
                const days = daysUntil(med.expiryDate);
                const urgent = days !== null && days <= 7;
                return (
                  <TouchableOpacity
                    key={med.id}
                    style={[s.alertRow, i === Math.min(4, expiringList.length - 1) && { borderBottomWidth: 0 }]}
                    onPress={() => router.push(`/medicines/${med.id}` as any)}
                  >
                    <View style={[s.alertDot, { backgroundColor: urgent ? '#EF4444' : '#F59E0B' }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.alertName}>{med.name}</Text>
                      <Text style={s.alertSub}>Expires {med.expiryDate ?? '—'}</Text>
                    </View>
                    <Text style={[s.alertValue, { color: urgent ? '#EF4444' : colors.warning }]}>
                      {expiryLabel(days)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {expiringList.length > 5 && <Text style={s.moreText}>+{expiringList.length - 5} more</Text>}
            </View>
          </>
        )}

        {/* Recent orders */}
        <SectionHeader title="Recent Orders" actionLabel="Sales" onAction={() => router.push('/(tabs)/sales' as any)} />
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

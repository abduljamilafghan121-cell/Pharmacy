import { useColors } from '@/hooks/useColors';
import { formatCurrency } from '@/lib/format';
import { useApiQuery } from '@/hooks/useApi';
import { useGetInventoryReport, useGetSalesReport, useGetTopMedicines, useGetRevenueReport } from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function MetricCard({ label, value, icon, color }: { label: string; value: string; icon: string; color: string }) {
  const colors = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: colors.radius, padding: 14, margin: 4 }}>
      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: color + '20', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
        <Feather name={icon as any} size={15} color={color} />
      </View>
      <Text style={{ fontSize: 18, fontFamily: 'Inter_700Bold', color: colors.foreground }}>{value}</Text>
      <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: colors.mutedForeground, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

export default function ReportsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topInset = insets.top + (Platform.OS === 'web' ? 67 : 0);

  const [range, setRange] = useState<'today' | 'week' | 'month'>('week');

  const today = new Date().toISOString().slice(0, 10);
  const from = range === 'today' ? today : range === 'week'
    ? new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
    : new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const { data: invReport, isLoading: invLoad } = useGetInventoryReport({});
  const { data: salesReport, isLoading: salesLoad } = useGetSalesReport({ from, to: today }, {});
  const { data: topMeds, isLoading: topLoad } = useGetTopMedicines({});
  const { data: revReport, isLoading: revLoad } = useGetRevenueReport({ from, to: today }, {});

  interface ProfitReport { revenue: string; cost: string; profit: string; marginPct: number; note: string }
  interface StaffProductivityRow { userId: number | null; userName: string | null; totalOrders: number; totalRevenue: string; totalItems: number }
  interface ReorderSuggestion { medicineId: number; medicineName: string; genericName: string | null; currentStock: number; reorderLevel: number; sold30Days: number; dailyRate: number; suggestedReorderQty: number; urgency: 'critical' | 'high' | 'medium' }

  const { data: profitReport, isLoading: profitLoad } = useApiQuery<ProfitReport>(['reports-profit', from, today], `/api/reports/profit?from=${from}&to=${today}`);
  const { data: staffProductivity, isLoading: staffLoad } = useApiQuery<StaffProductivityRow[]>(['reports-staff-productivity', from, today], `/api/reports/staff-productivity?from=${from}&to=${today}`);
  const { data: reorderSuggestions, isLoading: reorderLoad } = useApiQuery<ReorderSuggestion[]>(['medicines-reorder-suggestions'], '/api/medicines/reorder-suggestions');

  const isLoading = invLoad || salesLoad || topLoad || revLoad;

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.primary, paddingTop: topInset + 10, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
    title: { color: '#fff', fontSize: 20, fontFamily: 'Inter_700Bold', flex: 1 },
    section: { backgroundColor: colors.card, marginHorizontal: 12, marginTop: 14, borderRadius: colors.radius, padding: 16 },
    sectionTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.foreground, marginBottom: 12 },
    rangeRow: { flexDirection: 'row', gap: 8, marginHorizontal: 12, marginTop: 14 },
    rangeBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', borderWidth: 1.5 },
    topRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    barBg: { flex: 1, height: 6, backgroundColor: colors.muted, borderRadius: 3, marginHorizontal: 10, overflow: 'hidden' },
    bar: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  });

  const maxSold = Math.max(...(topMeds ?? []).map(m => m.totalSold), 1);

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
          <Feather name="arrow-left" size={20} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>
        <Text style={s.title}>Reports & Analytics</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Range selector */}
        <View style={s.rangeRow}>
          {(['today', 'week', 'month'] as const).map(r => (
            <TouchableOpacity key={r} style={[s.rangeBtn, { borderColor: range === r ? colors.primary : colors.border, backgroundColor: range === r ? colors.secondary : 'transparent' }]} onPress={() => setRange(r)}>
              <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: range === r ? colors.primary : colors.mutedForeground, textTransform: 'capitalize' }}>{r === 'week' ? '7 Days' : r === 'month' ? '30 Days' : 'Today'}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {isLoading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        ) : (
          <>
            {/* Sales metrics */}
            <View style={{ flexDirection: 'row', marginHorizontal: 8, marginTop: 10 }}>
              <MetricCard label="Total Revenue" value={formatCurrency(salesReport?.totalRevenue ?? '0')} icon="trending-up" color={colors.primary} />
              <MetricCard label="Orders" value={String(salesReport?.totalOrders ?? 0)} icon="shopping-cart" color="#F59E0B" />
            </View>

            {/* Inventory metrics */}
            <View style={{ flexDirection: 'row', marginHorizontal: 8 }}>
              <MetricCard label="Total Medicines" value={String(invReport?.totalMedicines ?? 0)} icon="activity" color="#10B981" />
              <MetricCard label="Low Stock" value={String(invReport?.lowStockCount ?? 0)} icon="alert-triangle" color="#EF4444" />
            </View>
            <View style={{ flexDirection: 'row', marginHorizontal: 8 }}>
              <MetricCard label="Expiring Soon" value={String(invReport?.expiringCount ?? 0)} icon="clock" color="#F59E0B" />
              <MetricCard label="Out of Stock" value={String(invReport?.outOfStockCount ?? 0)} icon="x-circle" color="#EF4444" />
            </View>

            {/* Top medicines */}
            <View style={[s.section, { marginTop: 14 }]}>
              <Text style={s.sectionTitle}>Top Selling Medicines</Text>
              {(topMeds ?? []).slice(0, 8).map((med, i) => (
                <View key={med.medicineId} style={[s.topRow, i === Math.min(7, (topMeds?.length ?? 1) - 1) && { borderBottomWidth: 0 }]}>
                  <Text style={{ width: 20, fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground }}>{i + 1}</Text>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.foreground }} numberOfLines={1}>{med.medicineName}</Text>
                    <View style={s.barBg}><View style={[s.bar, { width: `${(med.totalSold / maxSold) * 100}%` as any }]} /></View>
                  </View>
                  <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: colors.foreground }}>{med.totalSold} sold</Text>
                    <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: colors.mutedForeground }}>{formatCurrency(med.revenue)}</Text>
                  </View>
                </View>
              ))}
              {(topMeds ?? []).length === 0 && <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: 'Inter_400Regular' }}>No sales data yet</Text>}
            </View>

            {/* Gross Profit */}
            <View style={[s.section, { marginTop: 14 }]}>
              <Text style={s.sectionTitle}>Gross Profit</Text>
              {profitLoad ? (
                <ActivityIndicator color={colors.primary} />
              ) : profitReport ? (
                <>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: colors.mutedForeground }}>Revenue</Text>
                      <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: colors.foreground, marginTop: 2 }}>{formatCurrency(profitReport.revenue)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: colors.mutedForeground }}>Cost</Text>
                      <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: colors.foreground, marginTop: 2 }}>{formatCurrency(profitReport.cost)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: colors.mutedForeground }}>Profit</Text>
                      <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: '#10B981', marginTop: 2 }}>{formatCurrency(profitReport.profit)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: colors.mutedForeground }}>Margin</Text>
                      <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: colors.primary, marginTop: 2 }}>{profitReport.marginPct.toFixed(1)}%</Text>
                    </View>
                  </View>
                  {profitReport.note ? <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 10 }}>{profitReport.note}</Text> : null}
                </>
              ) : (
                <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: 'Inter_400Regular' }}>No profit data for this range</Text>
              )}
            </View>

            {/* Sales Over Time */}
            {(salesReport?.byDay ?? []).length > 0 && (
              <View style={[s.section, { marginBottom: 0 }]}>
                <Text style={s.sectionTitle}>Sales Over Time</Text>
                {(salesReport?.byDay ?? []).slice(-7).map((day, i, arr) => (
                  <View key={day.date} style={[{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: colors.mutedForeground, width: 80 }}>{new Date(day.date).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</Text>
                    <View style={{ flex: 1 }}><View style={[s.barBg]}><View style={[s.bar, { width: `${(parseFloat(day.revenue) / Math.max(...(salesReport?.byDay ?? []).map(d => parseFloat(d.revenue)), 1)) * 100}%` as any }]} /></View></View>
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: colors.foreground, marginLeft: 8 }}>{formatCurrency(day.revenue)}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Staff Productivity */}
            <View style={[s.section, { marginTop: 14 }]}>
              <Text style={s.sectionTitle}>Staff Productivity</Text>
              {staffLoad ? (
                <ActivityIndicator color={colors.primary} />
              ) : (staffProductivity ?? []).length === 0 ? (
                <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: 'Inter_400Regular' }}>No staff sales in this range</Text>
              ) : (
                [...(staffProductivity ?? [])].sort((a, b) => parseFloat(b.totalRevenue) - parseFloat(a.totalRevenue)).map((st, i, arr) => (
                  <View key={st.userId ?? i} style={[s.topRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: colors.primary }}>{(st.userName ?? '?').charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.foreground }}>{st.userName ?? 'Unknown staff'}</Text>
                      <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: colors.mutedForeground }}>{st.totalOrders} orders · {st.totalItems} items</Text>
                    </View>
                    <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.foreground }}>{formatCurrency(st.totalRevenue)}</Text>
                  </View>
                ))
              )}
            </View>

            {/* Smart Reorder Suggestions */}
            <View style={[s.section, { marginTop: 14, marginBottom: 12 }]}>
              <Text style={s.sectionTitle}>Smart Reorder Suggestions</Text>
              {reorderLoad ? (
                <ActivityIndicator color={colors.primary} />
              ) : (reorderSuggestions ?? []).length === 0 ? (
                <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: 'Inter_400Regular' }}>Nothing needs reordering right now</Text>
              ) : (
                (reorderSuggestions ?? []).map((rs, i, arr) => {
                  const urgColor = rs.urgency === 'critical' ? colors.destructive : rs.urgency === 'high' ? '#F59E0B' : colors.primary;
                  return (
                    <View key={rs.medicineId} style={[s.topRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.foreground }} numberOfLines={1}>{rs.medicineName}</Text>
                        <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 1 }}>
                          {rs.currentStock} left · selling ~{rs.dailyRate.toFixed(1)}/day
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, backgroundColor: urgColor + '20', marginBottom: 3 }}>
                          <Text style={{ fontSize: 9, fontFamily: 'Inter_700Bold', color: urgColor, textTransform: 'uppercase' }}>{rs.urgency}</Text>
                        </View>
                        <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: colors.foreground }}>Reorder {rs.suggestedReorderQty}</Text>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

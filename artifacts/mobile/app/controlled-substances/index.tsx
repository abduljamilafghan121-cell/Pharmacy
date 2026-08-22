import { useColors } from '@/hooks/useColors';
import { useApiQuery } from '@/hooks/useApi';
import { getErrorMessage } from '@/lib/format';
import { useAuth } from '@/contexts/AuthContext';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ControlledLog {
  id: number;
  orderId: number | null;
  medicineId: number;
  medicineName: string | null;
  patientId: number | null;
  patientName: string | null;
  prescriptionId: number | null;
  quantityDispensed: number;
  scheduleAtDispensing: 'II' | 'III' | 'IV' | 'V';
  dispensedByName: string | null;
  notes: string | null;
  createdAt: string;
}

const SCHEDULES = ['', 'II', 'III', 'IV', 'V'];

const scheduleColor = (colors: ReturnType<typeof import('@/hooks/useColors').useColors>, sch: string) => {
  if (sch === 'II') return colors.destructive;
  if (sch === 'III') return '#EA580C';
  if (sch === 'IV') return colors.warning;
  return colors.primary;
};

export default function ControlledSubstancesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const topInset = insets.top + (Platform.OS === 'web' ? 67 : 0);
  const authorized = user?.role === 'admin' || user?.role === 'pharmacist';

  const { data, isLoading, isError, error, refetch } = useApiQuery<ControlledLog[]>(
    ['controlled-substance-logs'],
    '/api/controlled-substance-logs?limit=200',
    { enabled: authorized },
  );

  const [scheduleFilter, setScheduleFilter] = useState('');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let rows = data ?? [];
    if (scheduleFilter) rows = rows.filter((l) => l.scheduleAtDispensing === scheduleFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((l) =>
        (l.medicineName ?? '').toLowerCase().includes(q) ||
        (l.patientName ?? '').toLowerCase().includes(q) ||
        (l.dispensedByName ?? '').toLowerCase().includes(q)
      );
    }
    return rows;
  }, [data, scheduleFilter, search]);

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.primary, paddingTop: topInset + 10, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
    title: { color: '#fff', fontSize: 20, fontFamily: 'Inter_700Bold' },
    filterRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingTop: 12 },
    filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
    searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 10, marginHorizontal: 12, marginTop: 10, marginBottom: 6, paddingHorizontal: 12, height: 40, borderWidth: 1, borderColor: colors.border },
    searchInput: { flex: 1, marginLeft: 8, fontFamily: 'Inter_400Regular', fontSize: 13, color: colors.foreground },
    row: { backgroundColor: colors.card, marginHorizontal: 12, marginVertical: 4, borderRadius: colors.radius, padding: 14 },
    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    med: { fontSize: 14, fontFamily: 'Inter_700Bold', color: colors.foreground },
    meta: { fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 2 },
    schedule: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
    refRow: { flexDirection: 'row', gap: 14, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
    refItem: { flexDirection: 'column' },
    refLabel: { fontSize: 9, fontFamily: 'Inter_500Medium', color: colors.mutedForeground, textTransform: 'uppercase' },
    refVal: { fontSize: 12, fontFamily: 'Inter_700Bold', color: colors.primary, marginTop: 1 },
    errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginTop: 12, padding: 12, borderRadius: 10, backgroundColor: colors.destructive + '12', borderWidth: 1, borderColor: colors.destructive + '30' },
    errorText: { flex: 1, fontSize: 12, fontFamily: 'Inter_500Medium', color: colors.destructive },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>
        <Text style={s.title}>Controlled Substance Log</Text>
      </View>

      {!authorized ? (
        <View style={{ alignItems: 'center', marginTop: 80, paddingHorizontal: 30 }}>
          <Feather name="lock" size={48} color={colors.border} />
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', marginTop: 12, textAlign: 'center' }}>
            Only admins and pharmacists can view the controlled substance log.
          </Text>
        </View>
      ) : (
        <>
          <View style={s.filterRow}>
            {SCHEDULES.map((sch) => {
              const active = scheduleFilter === sch;
              return (
                <TouchableOpacity
                  key={sch || 'all'}
                  style={[s.filterChip, { backgroundColor: active ? colors.primary : colors.card, borderColor: active ? colors.primary : colors.border }]}
                  onPress={() => setScheduleFilter(sch)}
                >
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: active ? '#fff' : colors.mutedForeground }}>{sch === '' ? 'All' : `Sch ${sch}`}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={s.searchRow}>
            <Feather name="search" size={15} color={colors.mutedForeground} />
            <TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder="Filter by medicine, patient, or staff…" placeholderTextColor={colors.mutedForeground} />
          </View>

          {isError && (
            <View style={s.errorBox}>
              <Feather name="alert-triangle" size={15} color={colors.destructive} />
              <Text style={s.errorText}>{getErrorMessage(error)}</Text>
              <TouchableOpacity onPress={() => refetch()}>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: colors.destructive }}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          {isLoading ? (
            <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={{ paddingVertical: 8, paddingBottom: 40 }}
              refreshing={isLoading}
              onRefresh={refetch}
              renderItem={({ item }) => (
                <View style={s.row}>
                  <View style={s.topRow}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text style={s.med}>{item.medicineName ?? `Medicine #${item.medicineId}`}</Text>
                      <Text style={s.meta}>{new Date(item.createdAt).toLocaleString()}</Text>
                    </View>
                    <View style={[s.schedule, { backgroundColor: scheduleColor(colors, item.scheduleAtDispensing) + '20' }]}>
                      <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: scheduleColor(colors, item.scheduleAtDispensing) }}>Sch {item.scheduleAtDispensing}</Text>
                    </View>
                  </View>
                  <Text style={s.meta}>
                    {item.patientName ? `${item.patientName}${item.patientId ? ` #${item.patientId}` : ''}` : 'No patient on file'} · Qty {item.quantityDispensed} · Dispensed by {item.dispensedByName ?? 'Unknown'}
                  </Text>
                  <View style={s.refRow}>
                    <View style={s.refItem}>
                      <Text style={s.refLabel}>Rx #</Text>
                      <Text style={s.refVal}>{item.prescriptionId ?? '—'}</Text>
                    </View>
                    <View style={s.refItem}>
                      <Text style={s.refLabel}>Order #</Text>
                      <Text style={s.refVal}>{item.orderId ?? '—'}</Text>
                    </View>
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', marginTop: 60 }}>
                  <Feather name="lock" size={48} color={colors.border} />
                  <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', marginTop: 12 }}>
                    {isError ? 'Could not load the log' : 'No controlled substance dispensing logged'}
                  </Text>
                </View>
              }
            />
          )}
        </>
      )}
    </View>
  );
}

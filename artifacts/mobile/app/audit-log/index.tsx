import { useColors } from '@/hooks/useColors';
import { useApiQuery } from '@/hooks/useApi';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, FlatList, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface AuditEntry {
  id: number;
  userId: number | null;
  userName: string | null;
  action: string;
  entityType: string;
  entityId: number | null;
  description: string | null;
  createdAt: string;
}

const actionColor = (colors: ReturnType<typeof useColors>, action: string) => {
  if (action === 'CREATE') return colors.success;
  if (action === 'DELETE') return colors.destructive;
  if (action === 'UPDATE') return colors.warning;
  return colors.primary;
};

export default function AuditLogScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topInset = insets.top + (Platform.OS === 'web' ? 67 : 0);

  const { data, isLoading, refetch } = useApiQuery<{ entries: AuditEntry[]; total: number }>(
    ['audit-logs'],
    '/api/audit-logs?limit=200',
  );

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.primary, paddingTop: topInset + 10, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
    title: { color: '#fff', fontSize: 20, fontFamily: 'Inter_700Bold', marginLeft: 12 },
    sub: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontFamily: 'Inter_400Regular', marginLeft: 12 },
    row: { backgroundColor: colors.card, marginHorizontal: 12, marginVertical: 4, borderRadius: colors.radius, padding: 14 },
    topLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    badgeText: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.3 },
    desc: { fontSize: 13, fontFamily: 'Inter_500Medium', color: colors.foreground, marginTop: 6 },
    meta: { fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 4 },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>
        <View>
          <Text style={s.title}>Audit Log</Text>
          {typeof data?.total === 'number' && <Text style={s.sub}>{data.total} events recorded</Text>}
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      ) : (
        <FlatList
          data={data?.entries ?? []}
          keyExtractor={(e) => String(e.id)}
          contentContainerStyle={{ paddingVertical: 8, paddingBottom: 40 }}
          refreshing={isLoading}
          onRefresh={refetch}
          renderItem={({ item }) => (
            <View style={s.row}>
              <View style={s.topLine}>
                <View style={[s.badge, { backgroundColor: actionColor(colors, item.action) + '20' }]}>
                  <Text style={[s.badgeText, { color: actionColor(colors, item.action) }]}>{item.action}</Text>
                </View>
                <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground, textTransform: 'capitalize' }}>
                  {item.entityType}{item.entityId ? ` #${item.entityId}` : ''}
                </Text>
              </View>
              {item.description ? <Text style={s.desc}>{item.description}</Text> : null}
              <Text style={s.meta}>{item.userName ?? 'System'} · {new Date(item.createdAt).toLocaleString()}</Text>
            </View>
          )}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60 }}>
              <Feather name="shield" size={48} color={colors.border} />
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', marginTop: 12 }}>No audit events yet</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

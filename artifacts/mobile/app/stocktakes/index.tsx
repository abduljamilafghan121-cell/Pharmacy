import { useColors } from '@/hooks/useColors';
import { getErrorMessage } from '@/lib/format';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Stocktake {
  id: number;
  reference: string;
  status: string;
  notes: string | null;
  createdByName: string | null;
  finalizedAt: string | null;
  createdAt: string;
}

export default function StocktakesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topInset = insets.top + (Platform.OS === 'web' ? 67 : 0);

  const { data, isLoading, refetch } = useApiQuery<Stocktake[]>(['stocktakes'], '/api/stocktakes');
  const createStocktake = useApiMutation<Stocktake, { reference?: string; notes?: string }>('/api/stocktakes', [['stocktakes']]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  const statusColor = (st: string) => st === 'finalized' ? colors.success : st === 'cancelled' ? colors.destructive : colors.warning;

  const startStocktake = () => {
    createStocktake.mutate(
      { reference: reference.trim() || undefined, notes: notes.trim() || undefined },
      {
        onSuccess: (created) => {
          setSheetOpen(false);
          setReference('');
          setNotes('');
          router.push(`/stocktakes/${created.id}` as any);
        },
        onError: (e) => Alert.alert('Could not start stocktake', getErrorMessage(e)),
      },
    );
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.primary, paddingTop: topInset + 10, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    title: { color: '#fff', fontSize: 20, fontFamily: 'Inter_700Bold' },
    addBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    row: { backgroundColor: colors.card, marginHorizontal: 12, marginVertical: 4, borderRadius: colors.radius, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    ref: { fontSize: 14, fontFamily: 'Inter_700Bold', color: colors.foreground },
    meta: { fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 2 },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: insets.bottom + 20 },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 14 },
    label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground, marginBottom: 4, marginTop: 10 },
    inp: { height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, paddingHorizontal: 12, color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 14 },
    submitBtn: { height: 50, borderRadius: colors.radius, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <TouchableOpacity onPress={() => router.back()}>
            <Feather name="arrow-left" size={20} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
          <Text style={s.title}>Stocktakes</Text>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={() => setSheetOpen(true)}>
          <Feather name="plus" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingVertical: 8, paddingBottom: insets.bottom + 40 }}
          refreshing={isLoading}
          onRefresh={refetch}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.row} onPress={() => router.push(`/stocktakes/${item.id}` as any)}>
              <View style={{ flex: 1 }}>
                <Text style={s.ref}>{item.reference}</Text>
                <Text style={s.meta}>{item.createdByName ?? 'Unknown'} · {new Date(item.createdAt).toLocaleDateString()}</Text>
                {item.notes ? <Text style={s.meta}>{item.notes}</Text> : null}
              </View>
              <View style={[s.badge, { backgroundColor: statusColor(item.status) + '20' }]}>
                <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: statusColor(item.status), textTransform: 'capitalize' }}>{item.status.replace('_', ' ')}</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60 }}>
              <Feather name="clipboard" size={48} color={colors.border} />
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', marginTop: 12 }}>No stocktakes yet</Text>
            </View>
          }
        />
      )}

      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.foreground }}>Start Stocktake</Text>
            <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 4 }}>
              This will snapshot every medicine's current stock so you can count and reconcile it.
            </Text>
            <Text style={s.label}>Reference (optional)</Text>
            <TextInput style={s.inp} value={reference} onChangeText={setReference} placeholder="Auto-generated if left blank" placeholderTextColor={colors.mutedForeground} />
            <Text style={s.label}>Notes (optional)</Text>
            <TextInput style={[s.inp, { height: 70, paddingTop: 10 }]} value={notes} onChangeText={setNotes} multiline placeholderTextColor={colors.mutedForeground} />
            <TouchableOpacity style={s.submitBtn} disabled={createStocktake.isPending} onPress={startStocktake}>
              {createStocktake.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Start Stocktake</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSheetOpen(false)} style={{ alignItems: 'center', paddingVertical: 14 }}>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

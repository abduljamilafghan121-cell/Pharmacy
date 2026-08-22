import { useColors } from '@/hooks/useColors';
import { getErrorMessage } from '@/lib/format';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import { getListMedicinesQueryKey } from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface StocktakeItem {
  id: number;
  stocktakeId: number;
  medicineId: number;
  medicineName: string;
  systemQuantity: number;
  countedQuantity: number | null;
  notes: string | null;
}

interface StocktakeDetail {
  id: number;
  reference: string;
  status: string;
  notes: string | null;
  createdAt: string;
  finalizedAt: string | null;
  items: StocktakeItem[];
}

function StocktakeItemRow({
  item,
  colors,
  locked,
}: {
  item: StocktakeItem;
  colors: ReturnType<typeof useColors>;
  locked: boolean;
}) {
  const [value, setValue] = useState(item.countedQuantity != null ? String(item.countedQuantity) : '');
  const [saved, setSaved] = useState(item.countedQuantity);
  const [saving, setSaving] = useState(false);

  const updateItem = useApiMutation<StocktakeItem, { countedQuantity: number | null }>(
    () => `/api/stocktakes/${item.stocktakeId}/items/${item.id}`,
    [],
    'PATCH',
  );

  const numValue = value.trim() === '' ? null : parseInt(value, 10);
  const diff = numValue !== null && !Number.isNaN(numValue) ? numValue - item.systemQuantity : null;

  const save = () => {
    const clean = value.trim() === '' ? null : (Number.isNaN(numValue!) ? null : numValue);
    if (clean === saved) return;
    setSaving(true);
    updateItem.mutate(
      { countedQuantity: clean },
      {
        onSuccess: () => { setSaved(clean); setSaving(false); },
        onError: (e) => { setSaving(false); Alert.alert('Could not save count', getErrorMessage(e)); },
      },
    );
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, marginHorizontal: 12, marginVertical: 3, borderRadius: colors.radius, padding: 12 }}>
      <View style={{ flex: 1, marginRight: 10 }}>
        <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.foreground }}>{item.medicineName}</Text>
        <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 2 }}>System: {item.systemQuantity}</Text>
      </View>
      {diff !== null && diff !== 0 && (
        <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: diff > 0 ? colors.success : colors.destructive, marginRight: 8 }}>
          {diff > 0 ? `+${diff}` : diff}
        </Text>
      )}
      {saving && <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 8 }} />}
      <TextInput
        style={{
          width: 72, height: 38, borderRadius: 8, textAlign: 'center',
          borderWidth: 1.5, borderColor: saved !== null && diff !== null && diff !== 0 ? colors.warning : colors.border,
          backgroundColor: locked ? colors.muted : colors.input,
          color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 14,
        }}
        value={value}
        onChangeText={setValue}
        onEndEditing={save}
        onBlur={save}
        keyboardType="numeric"
        placeholder="Count"
        placeholderTextColor={colors.mutedForeground}
        editable={!locked}
      />
    </View>
  );
}

export default function StocktakeDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const topInset = insets.top + (Platform.OS === 'web' ? 67 : 0);

  const { data: stocktake, isLoading, refetch } = useApiQuery<StocktakeDetail>(['stocktake', id], `/api/stocktakes/${id}`);
  const finalize = useApiMutation<{ message: string; adjustments: number }, Record<string, never>>(
    `/api/stocktakes/${id}/finalize`,
    [['stocktakes'], ['stocktake', id]],
    'POST',
  );

  const [search, setSearch] = useState('');

  const locked = stocktake?.status === 'finalized';
  const items = stocktake?.items ?? [];
  const filtered = useMemo(
    () => (search.trim() ? items.filter((i) => i.medicineName.toLowerCase().includes(search.trim().toLowerCase())) : items),
    [items, search],
  );
  const countedN = items.filter((i) => i.countedQuantity != null).length;

  const handleFinalize = () => {
    Alert.alert(
      'Finalize stocktake',
      `${countedN} of ${items.length} items have a count. Any medicine with a different counted quantity will have its stock adjusted to match. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Finalize',
          style: 'destructive',
          onPress: () => {
            finalize.mutate(
              {},
              {
                onSuccess: (res) => {
                  qc.invalidateQueries({ queryKey: getListMedicinesQueryKey() });
                  Alert.alert('Stocktake finalized', `${res.adjustments} medicine${res.adjustments === 1 ? '' : 's'} adjusted.`);
                },
                onError: (e) => Alert.alert('Could not finalize', getErrorMessage(e)),
              },
            );
          },
        },
      ],
    );
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.primary, paddingTop: topInset + 10, paddingBottom: 14, paddingHorizontal: 16 },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    title: { color: '#fff', fontSize: 18, fontFamily: 'Inter_700Bold' },
    sub: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2, marginLeft: 32 },
    searchBar: { margin: 12, height: 42, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 12, color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 13 },
    finalizeBar: { padding: 12, paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
    finalizeBtn: { height: 50, borderRadius: colors.radius, backgroundColor: colors.destructive, alignItems: 'center', justifyContent: 'center' },
    progressText: { textAlign: 'center', fontSize: 11, fontFamily: 'Inter_500Medium', color: colors.mutedForeground, marginBottom: 8 },
  });

  if (isLoading || !stocktake) {
    return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}><ActivityIndicator color={colors.primary} /></View>;
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.back()}>
            <Feather name="arrow-left" size={20} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
          <Text style={s.title}>{stocktake.reference}</Text>
        </View>
        <Text style={s.sub}>
          {locked ? `Finalized ${new Date(stocktake.finalizedAt!).toLocaleString()}` : `${countedN} of ${items.length} counted`}
        </Text>
      </View>

      <TextInput
        style={s.searchBar}
        value={search}
        onChangeText={setSearch}
        placeholder="Search medicines to count…"
        placeholderTextColor={colors.mutedForeground}
      />

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingBottom: locked ? insets.bottom + 24 : 16 }}
        renderItem={({ item }) => <StocktakeItemRow item={item} colors={colors} locked={!!locked} />}
        refreshing={isLoading}
        onRefresh={refetch}
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', color: colors.mutedForeground, marginTop: 40, fontFamily: 'Inter_400Regular', fontSize: 12 }}>
            {items.length === 0 ? 'No medicines to count' : 'No matches'}
          </Text>
        }
      />

      {!locked && (
        <View style={s.finalizeBar}>
          <Text style={s.progressText}>Counts save automatically as you type each one</Text>
          <TouchableOpacity style={s.finalizeBtn} onPress={handleFinalize} disabled={finalize.isPending}>
            {finalize.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Finalize Stocktake</Text>}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

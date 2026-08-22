import { useColors } from '@/hooks/useColors';
import { formatCurrency, getErrorMessage } from '@/lib/format';
import { useApiQuery } from '@/hooks/useApi';
import { customFetch } from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Shift {
  id: number;
  openedByName: string | null;
  openingFloat: string;
  openedAt: string;
  closingCountedCash: string | null;
  manualCashOut: string | null;
  expectedCash: string | null;
  variance: string | null;
  notes: string | null;
  closedAt: string | null;
  status: 'open' | 'closed';
}

export default function CashRegisterScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const topInset = insets.top + (Platform.OS === 'web' ? 67 : 0);

  const { data: current, isLoading: currentLoading, refetch: refetchCurrent } = useApiQuery<Shift | null>(['cash-shift-current'], '/api/cash-shifts/current');
  const { data: history, isLoading: historyLoading, refetch: refetchHistory } = useApiQuery<Shift[]>(['cash-shifts'], '/api/cash-shifts?limit=30');

  const [openSheet, setOpenSheet] = useState(false);
  const [closeSheet, setCloseSheet] = useState(false);
  const [openingFloat, setOpeningFloat] = useState('');
  const [countedCash, setCountedCash] = useState('');
  const [manualCashOut, setManualCashOut] = useState('');
  const [notes, setNotes] = useState('');

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['cash-shift-current'] });
    qc.invalidateQueries({ queryKey: ['cash-shifts'] });
  };

  const openShift = useMutation({
    mutationFn: (openingFloatValue: number) =>
      customFetch('/api/cash-shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openingFloat: openingFloatValue }),
      }),
    onSuccess: () => { invalidateAll(); setOpenSheet(false); setOpeningFloat(''); },
    onError: (e) => Alert.alert('Could not open register', getErrorMessage(e)),
  });

  const closeShift = useMutation({
    mutationFn: (vars: { id: number; closingCountedCash: number; manualCashOut?: number; notes?: string }) =>
      customFetch(`/api/cash-shifts/${vars.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closingCountedCash: vars.closingCountedCash, manualCashOut: vars.manualCashOut, notes: vars.notes }),
      }),
    onSuccess: () => { invalidateAll(); setCloseSheet(false); setCountedCash(''); setManualCashOut(''); setNotes(''); },
    onError: (e) => Alert.alert('Could not close register', getErrorMessage(e)),
  });

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.primary, paddingTop: topInset + 10, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
    title: { color: '#fff', fontSize: 20, fontFamily: 'Inter_700Bold' },
    section: { backgroundColor: colors.card, marginHorizontal: 12, marginTop: 14, borderRadius: colors.radius, padding: 16 },
    sectionTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.foreground, marginBottom: 4 },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, marginBottom: 12 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    actionBtn: { height: 48, borderRadius: colors.radius, alignItems: 'center', justifyContent: 'center' },
    row: { backgroundColor: colors.card, marginHorizontal: 12, marginVertical: 4, borderRadius: colors.radius, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    meta: { fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 2 },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: insets.bottom + 20 },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 14 },
    label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground, marginBottom: 4, marginTop: 10 },
    inp: { height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, paddingHorizontal: 12, color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 14 },
    submitBtn: { height: 50, borderRadius: colors.radius, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  });

  const isLoading = currentLoading || historyLoading;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>
        <Text style={s.title}>Cash Register</Text>
      </View>

      <FlatList
        data={history ?? []}
        keyExtractor={(item) => String(item.id)}
        refreshing={isLoading}
        onRefresh={() => { refetchCurrent(); refetchHistory(); }}
        ListHeaderComponent={
          <>
            <View style={s.section}>
              <Text style={s.sectionTitle}>Current shift</Text>
              {currentLoading ? (
                <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />
              ) : current ? (
                <>
                  <View style={s.statusRow}>
                    <View style={[s.dot, { backgroundColor: colors.success }]} />
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.success }}>OPEN</Text>
                  </View>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: colors.foreground }}>
                    Opened by {current.openedByName ?? 'Unknown'} · {new Date(current.openedAt).toLocaleString()}
                  </Text>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: colors.mutedForeground, marginTop: 2 }}>
                    Opening float: {formatCurrency(current.openingFloat)}
                  </Text>
                  <TouchableOpacity style={[s.actionBtn, { backgroundColor: colors.destructive, marginTop: 14 }]} onPress={() => setCloseSheet(true)}>
                    <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>Close Register</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <View style={s.statusRow}>
                    <View style={[s.dot, { backgroundColor: colors.mutedForeground }]} />
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground }}>NO SHIFT OPEN</Text>
                  </View>
                  <TouchableOpacity style={[s.actionBtn, { backgroundColor: colors.primary }]} onPress={() => setOpenSheet(true)}>
                    <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>Open Register</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
            <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.6, marginLeft: 24, marginTop: 20, marginBottom: 4 }}>
              Recent shifts
            </Text>
          </>
        }
        renderItem={({ item }) => (
          <View style={s.row}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.foreground }}>{item.openedByName ?? 'Unknown'}</Text>
              <Text style={s.meta}>{new Date(item.openedAt).toLocaleString()}</Text>
              {item.status === 'closed' && item.variance != null && (
                <Text style={[s.meta, { color: Math.abs(parseFloat(item.variance)) < 0.01 ? colors.success : colors.destructive }]}>
                  {Math.abs(parseFloat(item.variance)) < 0.01 ? 'Balanced' : `${parseFloat(item.variance) > 0 ? 'Over' : 'Short'} ${formatCurrency(Math.abs(parseFloat(item.variance)))}`}
                </Text>
              )}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: item.status === 'open' ? colors.success : colors.mutedForeground, textTransform: 'uppercase' }}>{item.status}</Text>
              <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.foreground, marginTop: 4 }}>{formatCurrency(item.openingFloat)}</Text>
            </View>
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListEmptyComponent={!isLoading ? (
          <Text style={{ textAlign: 'center', color: colors.mutedForeground, marginTop: 20, fontFamily: 'Inter_400Regular', fontSize: 12 }}>No shift history yet</Text>
        ) : null}
      />

      <Modal visible={openSheet} transparent animationType="slide" onRequestClose={() => setOpenSheet(false)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.foreground }}>Open Register</Text>
            <Text style={s.label}>Opening float ($)</Text>
            <TextInput style={s.inp} value={openingFloat} onChangeText={setOpeningFloat} keyboardType="numeric" placeholder="0.00" placeholderTextColor={colors.mutedForeground} />
            <TouchableOpacity
              style={s.submitBtn}
              disabled={openShift.isPending}
              onPress={() => openShift.mutate(parseFloat(openingFloat) || 0)}
            >
              {openShift.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Open Register</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setOpenSheet(false)} style={{ alignItems: 'center', paddingVertical: 14 }}>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={closeSheet} transparent animationType="slide" onRequestClose={() => setCloseSheet(false)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.foreground }}>Close Register</Text>
            <Text style={s.label}>Counted cash in drawer ($) *</Text>
            <TextInput style={s.inp} value={countedCash} onChangeText={setCountedCash} keyboardType="numeric" placeholder="0.00" placeholderTextColor={colors.mutedForeground} />
            <Text style={s.label}>Manual cash out ($, optional)</Text>
            <TextInput style={s.inp} value={manualCashOut} onChangeText={setManualCashOut} keyboardType="numeric" placeholder="0.00" placeholderTextColor={colors.mutedForeground} />
            <Text style={s.label}>Notes (optional)</Text>
            <TextInput style={[s.inp, { height: 70, paddingTop: 10 }]} value={notes} onChangeText={setNotes} multiline placeholderTextColor={colors.mutedForeground} />
            <TouchableOpacity
              style={[s.submitBtn, { backgroundColor: colors.destructive }]}
              disabled={closeShift.isPending || !current}
              onPress={() => current && closeShift.mutate({
                id: current.id,
                closingCountedCash: parseFloat(countedCash) || 0,
                manualCashOut: manualCashOut ? parseFloat(manualCashOut) : undefined,
                notes: notes || undefined,
              })}
            >
              {closeShift.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Close Register</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setCloseSheet(false)} style={{ alignItems: 'center', paddingVertical: 14 }}>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

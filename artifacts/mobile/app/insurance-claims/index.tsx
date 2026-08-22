import { useColors } from '@/hooks/useColors';
import { formatCurrency, getErrorMessage } from '@/lib/format';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import { useAuth } from '@/contexts/AuthContext';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface InsuranceClaim {
  id: number;
  orderId: number;
  providerName: string;
  policyNumber: string;
  claimAmount: string;
  status: string;
  submittedByName: string | null;
  submittedAt: string;
  resolvedAt: string | null;
  notes: string | null;
}

export default function InsuranceClaimsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const topInset = insets.top + (Platform.OS === 'web' ? 67 : 0);
  const canCreate = user?.role === 'admin' || user?.role === 'pharmacist' || user?.role === 'cashier';

  const { data, isLoading, refetch } = useApiQuery<InsuranceClaim[]>(['insurance-claims'], '/api/insurance-claims');
  const createClaim = useApiMutation<InsuranceClaim, { orderId: number; providerName: string; policyNumber?: string; claimAmount: number; notes?: string }>(
    '/api/insurance-claims',
    [['insurance-claims']],
  );

  const [sheetOpen, setSheetOpen] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [providerName, setProviderName] = useState('');
  const [policyNumber, setPolicyNumber] = useState('');
  const [claimAmount, setClaimAmount] = useState('');
  const [notes, setNotes] = useState('');

  const resetForm = () => { setOrderId(''); setProviderName(''); setPolicyNumber(''); setClaimAmount(''); setNotes(''); };

  const submit = () => {
    const orderIdNum = parseInt(orderId, 10);
    const amountNum = parseFloat(claimAmount);
    if (!orderIdNum || !providerName.trim() || !amountNum) {
      Alert.alert('Missing details', 'Sale/Order ID, provider name, and claim amount are required.');
      return;
    }
    createClaim.mutate(
      { orderId: orderIdNum, providerName: providerName.trim(), policyNumber: policyNumber.trim() || undefined, claimAmount: amountNum, notes: notes.trim() || undefined },
      { onSuccess: () => { setSheetOpen(false); resetForm(); }, onError: (e) => Alert.alert('Could not submit claim', getErrorMessage(e)) },
    );
  };

  const statusColor = (st: string) => {
    if (st === 'approved' || st === 'paid') return colors.success;
    if (st === 'denied' || st === 'rejected') return colors.destructive;
    return colors.warning;
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.primary, paddingTop: topInset + 10, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    title: { color: '#fff', fontSize: 20, fontFamily: 'Inter_700Bold' },
    addBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    row: { backgroundColor: colors.card, marginHorizontal: 12, marginVertical: 4, borderRadius: colors.radius, padding: 14 },
    topLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    provider: { fontSize: 14, fontFamily: 'Inter_700Bold', color: colors.foreground },
    meta: { fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 2 },
    amt: { fontSize: 15, fontFamily: 'Inter_700Bold', color: colors.foreground },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, marginTop: 6, alignSelf: 'flex-start' },
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
          <Text style={s.title}>Insurance Claims</Text>
        </View>
        {canCreate && (
          <TouchableOpacity style={s.addBtn} onPress={() => setSheetOpen(true)}>
            <Feather name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingVertical: 8, paddingBottom: 40 }}
          refreshing={isLoading}
          onRefresh={refetch}
          renderItem={({ item }) => (
            <View style={s.row}>
              <View style={s.topLine}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={s.provider}>{item.providerName}</Text>
                  <Text style={s.meta}>Policy {item.policyNumber} · Order #{item.orderId}</Text>
                  <Text style={s.meta}>{new Date(item.submittedAt).toLocaleDateString()}</Text>
                </View>
                <Text style={s.amt}>{formatCurrency(item.claimAmount)}</Text>
              </View>
              <View style={[s.badge, { backgroundColor: statusColor(item.status) + '20' }]}>
                <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: statusColor(item.status), textTransform: 'capitalize' }}>{item.status}</Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60 }}>
              <Feather name="shield" size={48} color={colors.border} />
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', marginTop: 12 }}>No insurance claims yet</Text>
            </View>
          }
        />
      )}

      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.foreground }}>New Claim</Text>
            <Text style={s.label}>Sale / Order ID *</Text>
            <TextInput style={s.inp} value={orderId} onChangeText={setOrderId} keyboardType="numeric" placeholder="e.g. 1042" placeholderTextColor={colors.mutedForeground} />
            <Text style={s.label}>Insurance provider *</Text>
            <TextInput style={s.inp} value={providerName} onChangeText={setProviderName} placeholder="e.g. Delta Health" placeholderTextColor={colors.mutedForeground} />
            <Text style={s.label}>Policy number</Text>
            <TextInput style={s.inp} value={policyNumber} onChangeText={setPolicyNumber} placeholderTextColor={colors.mutedForeground} />
            <Text style={s.label}>Claim amount ($) *</Text>
            <TextInput style={s.inp} value={claimAmount} onChangeText={setClaimAmount} keyboardType="numeric" placeholder="0.00" placeholderTextColor={colors.mutedForeground} />
            <Text style={s.label}>Notes</Text>
            <TextInput style={[s.inp, { height: 70, paddingTop: 10 }]} value={notes} onChangeText={setNotes} multiline placeholderTextColor={colors.mutedForeground} />
            <TouchableOpacity style={s.submitBtn} disabled={createClaim.isPending} onPress={submit}>
              {createClaim.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Submit Claim</Text>}
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

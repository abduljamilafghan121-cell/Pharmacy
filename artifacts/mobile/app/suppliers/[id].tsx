import { useColors } from '@/hooks/useColors';
import { formatCurrency } from '@/lib/format';
import { useCreateSupplierPayment, useGetSupplierLedger, getListSupplierLedgerQueryKey } from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { ActivityIndicator, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SupplierLedgerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: ledger, isLoading } = useGetSupplierLedger(Number(id), {});
  const [payOpen, setPayOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'cash' | 'bank' | 'cheque' | 'transfer'>('cash');
  const [note, setNote] = useState('');

  const createPayment = useCreateSupplierPayment({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListSupplierLedgerQueryKey() });
        setPayOpen(false);
        setAmount('');
        setNote('');
      },
    },
  });

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.primary, paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 0) + 8, paddingBottom: 24, paddingHorizontal: 20 },
    title: { color: '#fff', fontSize: 20, fontFamily: 'Inter_700Bold', marginTop: 10 },
    sub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 4 },
    statsRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
    statChip: { flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: 10, alignItems: 'center' },
    statVal: { color: '#fff', fontSize: 15, fontFamily: 'Inter_700Bold' },
    statLbl: { color: 'rgba(255,255,255,0.65)', fontSize: 9, fontFamily: 'Inter_500Medium', marginTop: 2 },
    section: { backgroundColor: colors.card, marginHorizontal: 12, marginTop: 14, borderRadius: colors.radius, padding: 14 },
    sectionTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.foreground, marginBottom: 10 },
    entryRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: insets.bottom + 20 },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 20 },
    label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground, marginBottom: 4, marginTop: 10 },
    inp: { height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, paddingHorizontal: 12, color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 14 },
    payBtn: { height: 50, borderRadius: colors.radius, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  });

  if (isLoading || !ledger) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}><ActivityIndicator color={colors.primary} /></View>;

  const balance = parseFloat(ledger.balance);

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()}><Feather name="arrow-left" size={20} color="rgba(255,255,255,0.8)" /></TouchableOpacity>
          <Text style={s.title}>{ledger.supplierName}</Text>
          <Text style={s.sub}>{ledger.email ?? ledger.phone ?? ''}</Text>
          <View style={s.statsRow}>
            <View style={s.statChip}><Text style={s.statVal}>{formatCurrency(ledger.totalOrdered)}</Text><Text style={s.statLbl}>ORDERED</Text></View>
            <View style={s.statChip}><Text style={s.statVal}>{formatCurrency(ledger.totalPaid)}</Text><Text style={s.statLbl}>PAID</Text></View>
            <View style={[s.statChip, { backgroundColor: balance > 0 ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)' }]}>
              <Text style={[s.statVal, { color: '#fff' }]}>{formatCurrency(Math.abs(balance))}</Text>
              <Text style={s.statLbl}>{balance > 0 ? 'DUE' : 'OVERPAID'}</Text>
            </View>
          </View>
        </View>

        {balance > 0 && (
          <TouchableOpacity style={{ marginHorizontal: 12, marginTop: 14, height: 48, borderRadius: colors.radius, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }} onPress={() => setPayOpen(true)}>
            <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>Record Payment</Text>
          </TouchableOpacity>
        )}

        <View style={s.section}>
          <Text style={s.sectionTitle}>Ledger Entries</Text>
          {ledger.entries.length === 0 ? (
            <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: 'Inter_400Regular' }}>No transactions yet</Text>
          ) : (
            ledger.entries.map((entry, i) => (
              <View key={entry.id} style={[s.entryRow, i === ledger.entries.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.foreground }}>{entry.description}</Text>
                    <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 2 }}>{new Date(entry.date).toLocaleDateString()}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    {parseFloat(entry.debit) > 0 && <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.destructive }}>-{formatCurrency(entry.debit)}</Text>}
                    {parseFloat(entry.credit) > 0 && <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.success }}>+{formatCurrency(entry.credit)}</Text>}
                    <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: colors.mutedForeground }}>Bal: {formatCurrency(entry.runningBalance)}</Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <Modal visible={payOpen} transparent animationType="slide" onRequestClose={() => setPayOpen(false)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.foreground, marginBottom: 4 }}>Record Payment</Text>
            <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginBottom: 12 }}>Outstanding: {formatCurrency(balance)}</Text>
            <Text style={s.label}>Amount ($)</Text>
            <TextInput style={s.inp} value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder={balance.toFixed(2)} placeholderTextColor={colors.mutedForeground} />
            <Text style={s.label}>Method</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['cash', 'bank', 'cheque', 'transfer'] as const).map(m => (
                <TouchableOpacity key={m} onPress={() => setMethod(m)} style={{ flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', borderColor: method === m ? colors.primary : colors.border, backgroundColor: method === m ? colors.secondary : 'transparent' }}>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: method === m ? colors.primary : colors.mutedForeground, textTransform: 'capitalize' }}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={s.label}>Note (optional)</Text>
            <TextInput style={s.inp} value={note} onChangeText={setNote} placeholder="Reference, invoice #…" placeholderTextColor={colors.mutedForeground} />
            <TouchableOpacity style={s.payBtn} onPress={() => createPayment.mutate({ data: { supplierId: Number(id), amount: amount || String(balance), method, note: note || null } })} disabled={createPayment.isPending}>
              {createPayment.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Record Payment</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

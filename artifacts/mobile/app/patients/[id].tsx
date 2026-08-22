import { useColors } from '@/hooks/useColors';
import { formatCurrency } from '@/lib/format';
import { useGetPatient, useListOrders, useListPrescriptions, useUpdatePatient, getListPatientsQueryKey } from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function PatientDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: patient, isLoading } = useGetPatient(Number(id), {});
  const { data: orders } = useListOrders({});
  const { data: prescriptions } = useListPrescriptions({});
  const updatePatient = useUpdatePatient({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListPatientsQueryKey() }); setEditing(false); } } });

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', notes: '' });

  useEffect(() => {
    if (patient) setForm({ name: patient.name, phone: patient.phone ?? '', notes: patient.notes ?? '' });
  }, [patient]);

  const patientOrders = (orders ?? []).filter(o => o.customerId === patient?.id).slice(0, 10);
  const patientRx = (prescriptions ?? []).filter(p => p.customerId === patient?.id).slice(0, 5);

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    hero: { backgroundColor: colors.primary, paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 0) + 8, paddingBottom: 28, paddingHorizontal: 20, alignItems: 'center' },
    backBtn: { alignSelf: 'flex-start', marginBottom: 12 },
    avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    avatarText: { color: '#fff', fontSize: 28, fontFamily: 'Inter_700Bold' },
    heroName: { color: '#fff', fontSize: 20, fontFamily: 'Inter_700Bold' },
    heroPhone: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 4 },
    section: { backgroundColor: colors.card, marginHorizontal: 12, marginTop: 14, borderRadius: colors.radius, padding: 16 },
    sectionTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.foreground, marginBottom: 12 },
    label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground, marginBottom: 4, marginTop: 10 },
    inp: { height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, paddingHorizontal: 12, color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 14 },
    orderRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    rxRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  });

  const statusColor = (s: string) => s === 'dispensed' || s === 'verified' ? colors.success : s === 'cancelled' || s === 'rejected' ? colors.destructive : '#F59E0B';

  if (isLoading || !patient) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}><ActivityIndicator color={colors.primary} /></View>;

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={s.hero}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>
        <View style={s.avatar}><Text style={s.avatarText}>{patient.name.charAt(0).toUpperCase()}</Text></View>
        <Text style={s.heroName}>{patient.name}</Text>
        <Text style={s.heroPhone}>{patient.phone ?? 'No phone'}</Text>
      </View>

      {/* Edit / Info */}
      <View style={s.section}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={s.sectionTitle}>Patient Info</Text>
          <TouchableOpacity onPress={() => setEditing(e => !e)}>
            <Feather name={editing ? 'x' : 'edit-2'} size={16} color={colors.primary} />
          </TouchableOpacity>
        </View>
        {editing ? (
          <>
            <Text style={s.label}>Name</Text>
            <TextInput style={s.inp} value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} placeholderTextColor={colors.mutedForeground} />
            <Text style={s.label}>Phone</Text>
            <TextInput style={s.inp} value={form.phone} onChangeText={v => setForm(f => ({ ...f, phone: v }))} keyboardType="phone-pad" placeholderTextColor={colors.mutedForeground} />
            <Text style={s.label}>Notes</Text>
            <TextInput style={[s.inp, { height: 70, paddingTop: 10 }]} value={form.notes} onChangeText={v => setForm(f => ({ ...f, notes: v }))} multiline placeholderTextColor={colors.mutedForeground} />
            <TouchableOpacity onPress={() => updatePatient.mutate({ id: patient.id, data: { name: form.name, phone: form.phone || undefined, notes: form.notes || undefined } })} disabled={updatePatient.isPending}
              style={{ marginTop: 14, height: 46, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
              {updatePatient.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold' }}>Save</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}><Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: 'Inter_500Medium' }}>Phone</Text><Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>{patient.phone ?? '—'}</Text></View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}><Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: 'Inter_500Medium' }}>Notes</Text><Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold', maxWidth: '60%', textAlign: 'right' }}>{patient.notes ?? '—'}</Text></View>
          </>
        )}
      </View>

      {/* Orders */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Order History ({patientOrders.length})</Text>
        {patientOrders.length === 0 ? <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: 'Inter_400Regular' }}>No orders yet</Text> : patientOrders.map((o, i) => (
          <TouchableOpacity key={o.id} style={[s.orderRow, i === patientOrders.length - 1 && { borderBottomWidth: 0 }]} onPress={() => router.push(`/orders/${o.id}` as any)}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.foreground }}>Order #{o.id}</Text>
              <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 2 }}>{new Date(o.createdAt).toLocaleDateString()}</Text>
            </View>
            <View style={[s.statusBadge, { backgroundColor: statusColor(o.status) + '20' }]}><Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: statusColor(o.status), textTransform: 'capitalize' }}>{o.status}</Text></View>
            <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.foreground, marginLeft: 10 }}>{formatCurrency(o.total)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Prescriptions */}
      <View style={[s.section, { marginBottom: 12 }]}>
        <Text style={s.sectionTitle}>Prescriptions ({patientRx.length})</Text>
        {patientRx.length === 0 ? <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: 'Inter_400Regular' }}>No prescriptions</Text> : patientRx.map((rx, i) => (
          <View key={rx.id} style={[s.rxRow, i === patientRx.length - 1 && { borderBottomWidth: 0 }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.foreground }}>Rx #{rx.id}</Text>
              <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 2 }}>{new Date(rx.createdAt).toLocaleDateString()}</Text>
            </View>
            <View style={[s.statusBadge, { backgroundColor: statusColor(rx.status) + '20' }]}><Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: statusColor(rx.status), textTransform: 'capitalize' }}>{rx.status}</Text></View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

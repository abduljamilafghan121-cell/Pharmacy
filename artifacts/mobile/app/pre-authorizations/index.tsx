import { useColors } from '@/hooks/useColors';
import { getErrorMessage } from '@/lib/format';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import { useAuth } from '@/contexts/AuthContext';
import { useListMedicines, useListPatients, getListMedicinesQueryKey, getListPatientsQueryKey, type Medicine, type Patient } from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface PreAuth {
  id: number;
  patientName: string | null;
  medicineName: string | null;
  insurerName: string;
  policyNumber: string | null;
  status: string;
  submittedAt: string;
}

export default function PreAuthorizationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const topInset = insets.top + (Platform.OS === 'web' ? 67 : 0);
  const canCreate = user?.role === 'admin' || user?.role === 'pharmacist';

  const { data, isLoading, refetch } = useApiQuery<PreAuth[]>(['pre-authorizations'], '/api/pre-authorizations');
  const { data: medicines } = useListMedicines({}, { query: { queryKey: getListMedicinesQueryKey(), enabled: canCreate } });
  const { data: patients } = useListPatients({}, { query: { queryKey: getListPatientsQueryKey(), enabled: canCreate } });
  const createPA = useApiMutation<PreAuth, { medicineId: number; patientId?: number; insurerName: string; policyNumber?: string; diagnosisCode?: string; notes?: string }>(
    '/api/pre-authorizations',
    [['pre-authorizations']],
  );

  const [sheetOpen, setSheetOpen] = useState(false);
  const [medSearch, setMedSearch] = useState('');
  const [selectedMed, setSelectedMed] = useState<Medicine | null>(null);
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [insurerName, setInsurerName] = useState('');
  const [policyNumber, setPolicyNumber] = useState('');
  const [diagnosisCode, setDiagnosisCode] = useState('');
  const [notes, setNotes] = useState('');

  const medResults = useMemo(() => {
    if (!medSearch.trim()) return [];
    const q = medSearch.trim().toLowerCase();
    return (medicines ?? []).filter((m) => m.name.toLowerCase().includes(q)).slice(0, 6);
  }, [medicines, medSearch]);

  const patientResults = useMemo(() => {
    if (!patientSearch.trim()) return [];
    const q = patientSearch.trim().toLowerCase();
    return (patients ?? []).filter((p) => p.name.toLowerCase().includes(q)).slice(0, 6);
  }, [patients, patientSearch]);

  const resetForm = () => { setSelectedMed(null); setMedSearch(''); setSelectedPatient(null); setPatientSearch(''); setInsurerName(''); setPolicyNumber(''); setDiagnosisCode(''); setNotes(''); };

  const submit = () => {
    if (!selectedMed || !insurerName.trim()) {
      Alert.alert('Missing details', 'A medicine and insurer name are required.');
      return;
    }
    createPA.mutate(
      { medicineId: selectedMed.id, patientId: selectedPatient?.id, insurerName: insurerName.trim(), policyNumber: policyNumber.trim() || undefined, diagnosisCode: diagnosisCode.trim() || undefined, notes: notes.trim() || undefined },
      { onSuccess: () => { setSheetOpen(false); resetForm(); }, onError: (e) => Alert.alert('Could not submit request', getErrorMessage(e)) },
    );
  };

  const statusColor = (st: string) => {
    if (st === 'approved') return colors.success;
    if (st === 'denied' || st === 'expired') return colors.destructive;
    return colors.warning;
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.primary, paddingTop: topInset + 10, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    title: { color: '#fff', fontSize: 20, fontFamily: 'Inter_700Bold' },
    addBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    row: { backgroundColor: colors.card, marginHorizontal: 12, marginVertical: 4, borderRadius: colors.radius, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    med: { fontSize: 14, fontFamily: 'Inter_700Bold', color: colors.foreground },
    meta: { fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 2 },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: insets.bottom + 20, maxHeight: '85%' },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 14 },
    label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground, marginBottom: 4, marginTop: 10 },
    inp: { height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, paddingHorizontal: 12, color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 14 },
    submitBtn: { height: 50, borderRadius: colors.radius, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
    medOption: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.secondary, marginTop: 6 },
    selectedMedChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 6 },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <TouchableOpacity onPress={() => router.back()}>
            <Feather name="arrow-left" size={20} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
          <Text style={s.title}>Pre-Authorizations</Text>
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
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={s.med}>{item.medicineName ?? 'Unknown medicine'}</Text>
                <Text style={s.meta}>{item.patientName ?? 'Unknown patient'} · {item.insurerName}</Text>
                <Text style={s.meta}>{new Date(item.submittedAt).toLocaleDateString()}</Text>
              </View>
              <View style={[s.badge, { backgroundColor: statusColor(item.status) + '20' }]}>
                <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: statusColor(item.status), textTransform: 'capitalize' }}>{item.status}</Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60 }}>
              <Feather name="file-text" size={48} color={colors.border} />
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', marginTop: 12 }}>No pre-authorizations yet</Text>
            </View>
          }
        />
      )}

      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={s.handle} />
            <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.foreground }}>New Pre-Authorization</Text>

            <Text style={s.label}>Medicine *</Text>
            {selectedMed ? (
              <View style={s.selectedMedChip}>
                <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{selectedMed.name}</Text>
                <TouchableOpacity onPress={() => setSelectedMed(null)}><Feather name="x" size={16} color="#fff" /></TouchableOpacity>
              </View>
            ) : (
              <>
                <TextInput style={s.inp} value={medSearch} onChangeText={setMedSearch} placeholder="Search medicines…" placeholderTextColor={colors.mutedForeground} />
                {medResults.map((m) => (
                  <TouchableOpacity key={m.id} style={s.medOption} onPress={() => { setSelectedMed(m); setMedSearch(''); }}>
                    <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: colors.foreground }}>{m.name}</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}

            <Text style={s.label}>Patient <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>(optional)</Text></Text>
            {selectedPatient ? (
              <View style={s.selectedMedChip}>
                <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{selectedPatient.name}</Text>
                <TouchableOpacity onPress={() => setSelectedPatient(null)}><Feather name="x" size={16} color="#fff" /></TouchableOpacity>
              </View>
            ) : (
              <>
                <TextInput style={s.inp} value={patientSearch} onChangeText={setPatientSearch} placeholder="Search patients…" placeholderTextColor={colors.mutedForeground} />
                {patientResults.map((p) => (
                  <TouchableOpacity key={p.id} style={s.medOption} onPress={() => { setSelectedPatient(p); setPatientSearch(''); }}>
                    <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: colors.foreground }}>{p.name}</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}

            <Text style={s.label}>Insurer *</Text>
            <TextInput style={s.inp} value={insurerName} onChangeText={setInsurerName} placeholder="e.g. Delta Health" placeholderTextColor={colors.mutedForeground} />
            <Text style={s.label}>Policy number</Text>
            <TextInput style={s.inp} value={policyNumber} onChangeText={setPolicyNumber} placeholderTextColor={colors.mutedForeground} />
            <Text style={s.label}>Diagnosis code</Text>
            <TextInput style={s.inp} value={diagnosisCode} onChangeText={setDiagnosisCode} placeholderTextColor={colors.mutedForeground} />
            <Text style={s.label}>Notes</Text>
            <TextInput style={[s.inp, { height: 60, paddingTop: 10 }]} value={notes} onChangeText={setNotes} multiline placeholderTextColor={colors.mutedForeground} />

            <TouchableOpacity style={s.submitBtn} disabled={createPA.isPending} onPress={submit}>
              {createPA.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Submit Request</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSheetOpen(false)} style={{ alignItems: 'center', paddingVertical: 14 }}>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }}>Cancel</Text>
            </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

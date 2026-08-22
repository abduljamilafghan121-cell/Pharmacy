import { useColors } from '@/hooks/useColors';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import { getErrorMessage } from '@/lib/format';
import { useAuth } from '@/contexts/AuthContext';
import { useListMedicines, customFetch, type Medicine } from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface DrugInteraction {
  id: number;
  medicine1Id: number;
  medicine2Id: number;
  severity: 'minor' | 'moderate' | 'major' | 'contraindicated';
  description: string | null;
  createdAt: string;
}

const SEVERITIES = ['minor', 'moderate', 'major', 'contraindicated'] as const;

export default function DrugInteractionsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const topInset = insets.top + (Platform.OS === 'web' ? 67 : 0);
  const canManage = user?.role === 'admin' || user?.role === 'pharmacist';

  const { data, isLoading, refetch } = useApiQuery<DrugInteraction[]>(['drug-interactions'], '/api/drug-interactions');
  // The endpoint only returns medicine ids — pull the medicine list once to
  // resolve names locally rather than firing a request per row.
  const { data: medicines } = useListMedicines({}, {});
  const nameById = useMemo(() => {
    const map = new Map<number, string>();
    (medicines ?? []).forEach((m) => map.set(m.id, m.name));
    return map;
  }, [medicines]);

  const create = useApiMutation<DrugInteraction, { medicine1Id: number; medicine2Id: number; severity: string; description?: string }>(
    '/api/drug-interactions',
    [['drug-interactions']],
  );

  const removeInteraction = async (id: number) => {
    try {
      await customFetch(`/api/drug-interactions/${id}`, { method: 'DELETE' });
      refetch();
    } catch (e) {
      Alert.alert("Couldn't remove interaction", getErrorMessage(e));
    }
  };

  const [addOpen, setAddOpen] = useState(false);
  const [med1Search, setMed1Search] = useState('');
  const [med1, setMed1] = useState<Medicine | null>(null);
  const [med2Search, setMed2Search] = useState('');
  const [med2, setMed2] = useState<Medicine | null>(null);
  const [severity, setSeverity] = useState<typeof SEVERITIES[number]>('moderate');
  const [description, setDescription] = useState('');
  const [filterQuery, setFilterQuery] = useState('');

  const med1Results = useMemo(() => {
    if (!med1Search.trim()) return [];
    const q = med1Search.trim().toLowerCase();
    return (medicines ?? []).filter((m) => m.name.toLowerCase().includes(q)).slice(0, 6);
  }, [medicines, med1Search]);
  const med2Results = useMemo(() => {
    if (!med2Search.trim()) return [];
    const q = med2Search.trim().toLowerCase();
    return (medicines ?? []).filter((m) => m.name.toLowerCase().includes(q)).slice(0, 6);
  }, [medicines, med2Search]);

  const resetForm = () => { setMed1(null); setMed1Search(''); setMed2(null); setMed2Search(''); setSeverity('moderate'); setDescription(''); };

  const submit = () => {
    if (!med1 || !med2) {
      Alert.alert('Missing medicines', 'Select both medicines involved in the interaction.');
      return;
    }
    if (med1.id === med2.id) {
      Alert.alert('Invalid selection', 'A medicine cannot interact with itself.');
      return;
    }
    create.mutate(
      { medicine1Id: med1.id, medicine2Id: med2.id, severity, description: description.trim() || undefined },
      { onSuccess: () => { setAddOpen(false); resetForm(); }, onError: (e) => Alert.alert("Couldn't add interaction", getErrorMessage(e)) },
    );
  };

  const severityColor = (sev: string) => {
    if (sev === 'major' || sev === 'contraindicated') return colors.destructive;
    if (sev === 'moderate') return colors.warning;
    return colors.primary;
  };

  const filtered = useMemo(() => {
    const rows = data ?? [];
    if (!filterQuery.trim()) return rows;
    const q = filterQuery.trim().toLowerCase();
    return rows.filter((i) =>
      (nameById.get(i.medicine1Id) ?? '').toLowerCase().includes(q) ||
      (nameById.get(i.medicine2Id) ?? '').toLowerCase().includes(q) ||
      i.severity.includes(q) ||
      (i.description ?? '').toLowerCase().includes(q)
    );
  }, [data, filterQuery, nameById]);

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.primary, paddingTop: topInset + 10, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    title: { color: '#fff', fontSize: 20, fontFamily: 'Inter_700Bold' },
    addBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 10, marginHorizontal: 12, marginTop: 12, marginBottom: 6, paddingHorizontal: 12, height: 40, borderWidth: 1, borderColor: colors.border },
    searchInput: { flex: 1, marginLeft: 8, fontFamily: 'Inter_400Regular', fontSize: 13, color: colors.foreground },
    row: { backgroundColor: colors.card, marginHorizontal: 12, marginVertical: 4, borderRadius: colors.radius, padding: 14, flexDirection: 'row', alignItems: 'flex-start' },
    pair: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.foreground },
    desc: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 4 },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, marginTop: 8, alignSelf: 'flex-start' },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: insets.bottom + 20, maxHeight: '88%' },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 14 },
    sheetTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.foreground, marginBottom: 4 },
    label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground, marginBottom: 4, marginTop: 12 },
    inp: { height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, paddingHorizontal: 12, color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 14 },
    selectedChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
    medOption: { paddingVertical: 9, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
    sevRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    sevChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
    submitBtn: { height: 50, borderRadius: colors.radius, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <TouchableOpacity onPress={() => router.back()}>
            <Feather name="arrow-left" size={20} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
          <Text style={s.title}>Drug Interactions</Text>
        </View>
        {canManage && (
          <TouchableOpacity style={s.addBtn} onPress={() => setAddOpen(true)}>
            <Feather name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      <View style={s.searchRow}>
        <Feather name="search" size={15} color={colors.mutedForeground} />
        <TextInput style={s.searchInput} value={filterQuery} onChangeText={setFilterQuery} placeholder="Filter by medicine or severity…" placeholderTextColor={colors.mutedForeground} />
      </View>

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
              <View style={{ flex: 1 }}>
                <Text style={s.pair}>
                  {nameById.get(item.medicine1Id) ?? `Medicine #${item.medicine1Id}`} + {nameById.get(item.medicine2Id) ?? `Medicine #${item.medicine2Id}`}
                </Text>
                {item.description ? <Text style={s.desc}>{item.description}</Text> : null}
                <View style={[s.badge, { backgroundColor: severityColor(item.severity) + '20' }]}>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: severityColor(item.severity), textTransform: 'capitalize' }}>{item.severity}</Text>
                </View>
              </View>
              {canManage && (
                <TouchableOpacity
                  style={{ padding: 6 }}
                  onPress={() => Alert.alert('Remove interaction', 'Delete this interaction rule?', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => removeInteraction(item.id) },
                  ])}
                >
                  <Feather name="trash-2" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              )}
            </View>
          )}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60 }}>
              <Feather name="alert-triangle" size={48} color={colors.border} />
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', marginTop: 12 }}>
                {(data ?? []).length === 0 ? 'No interaction rules defined yet' : 'No interactions match your filter'}
              </Text>
            </View>
          }
        />
      )}

      <Modal visible={addOpen} transparent animationType="slide" onRequestClose={() => setAddOpen(false)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <Text style={s.sheetTitle}>Add Drug Interaction Rule</Text>

            <Text style={s.label}>Medicine 1 *</Text>
            {med1 ? (
              <View style={s.selectedChip}>
                <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{med1.name}</Text>
                <TouchableOpacity onPress={() => setMed1(null)}><Feather name="x" size={16} color="#fff" /></TouchableOpacity>
              </View>
            ) : (
              <>
                <TextInput style={s.inp} value={med1Search} onChangeText={setMed1Search} placeholder="Search medicine…" placeholderTextColor={colors.mutedForeground} />
                {med1Results.map((m) => (
                  <TouchableOpacity key={m.id} style={s.medOption} onPress={() => { setMed1(m); setMed1Search(''); }}>
                    <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: colors.foreground }}>{m.name}</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}

            <Text style={s.label}>Medicine 2 *</Text>
            {med2 ? (
              <View style={s.selectedChip}>
                <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{med2.name}</Text>
                <TouchableOpacity onPress={() => setMed2(null)}><Feather name="x" size={16} color="#fff" /></TouchableOpacity>
              </View>
            ) : (
              <>
                <TextInput style={s.inp} value={med2Search} onChangeText={setMed2Search} placeholder="Search medicine…" placeholderTextColor={colors.mutedForeground} />
                {med2Results.map((m) => (
                  <TouchableOpacity key={m.id} style={s.medOption} onPress={() => { setMed2(m); setMed2Search(''); }}>
                    <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: colors.foreground }}>{m.name}</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}
            {med1 && med2 && med1.id === med2.id && (
              <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.destructive, marginTop: 6 }}>A medicine cannot interact with itself.</Text>
            )}

            <Text style={s.label}>Severity *</Text>
            <View style={s.sevRow}>
              {SEVERITIES.map((sev) => {
                const active = severity === sev;
                return (
                  <TouchableOpacity key={sev} style={[s.sevChip, { backgroundColor: active ? severityColor(sev) : colors.card, borderColor: active ? severityColor(sev) : colors.border }]} onPress={() => setSeverity(sev)}>
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: active ? '#fff' : colors.mutedForeground, textTransform: 'capitalize' }}>{sev}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={s.label}>Clinical description</Text>
            <TextInput style={s.inp} value={description} onChangeText={setDescription} placeholder="e.g. Increases bleeding risk" placeholderTextColor={colors.mutedForeground} />

            <TouchableOpacity style={[s.submitBtn, { opacity: create.isPending || !med1 || !med2 || med1?.id === med2?.id ? 0.6 : 1 }]} disabled={create.isPending || !med1 || !med2 || med1?.id === med2?.id} onPress={submit}>
              {create.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Save</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setAddOpen(false); resetForm(); }} style={{ alignItems: 'center', paddingVertical: 14 }}>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

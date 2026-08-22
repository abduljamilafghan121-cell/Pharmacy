import { useColors } from '@/hooks/useColors';
import { useCreatePatient, useListPatients, getListPatientsQueryKey } from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import {
  ActivityIndicator,
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
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

export default function PatientsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const topInset = insets.top + (Platform.OS === 'web' ? 67 : 0);

  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const emptyForm = { name: '', phone: '', gender: '', dob: '', notes: '' };
  const [form, setForm] = useState(emptyForm);

  const { data: patients, isLoading, refetch } = useListPatients({ search: search || undefined }, {});
  const createPatient = useCreatePatient({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListPatientsQueryKey() });
        setAddOpen(false);
        setForm(emptyForm);
      },
    },
  });

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.primary, paddingTop: topInset + 10, paddingBottom: 14, paddingHorizontal: 16 },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerTitle: { color: '#fff', fontSize: 20, fontFamily: 'Inter_700Bold' },
    addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, marginTop: 10, paddingHorizontal: 12, height: 40 },
    searchInput: { flex: 1, color: '#fff', fontFamily: 'Inter_400Regular', fontSize: 14, marginLeft: 8 },
    item: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.card, marginHorizontal: 12, marginVertical: 4,
      borderRadius: colors.radius, padding: 14,
    },
    avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    avatarText: { fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.primary },
    name: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: colors.foreground },
    phone: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 2 },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: insets.bottom + 20 },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: 12 },
    sheetTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', color: colors.foreground, margin: 20, marginBottom: 4 },
    label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground, marginBottom: 4, marginTop: 12 },
    inp: { height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, paddingHorizontal: 12, color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 14 },
    row2: { flexDirection: 'row', gap: 10 },
    formChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1, flex: 1, alignItems: 'center' },
    formChipText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
    chipRow: { flexDirection: 'row', gap: 8 },
    submitBtn: { height: 50, borderRadius: colors.radius, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerRow}>
          <Text style={s.headerTitle}>Patients</Text>
          <TouchableOpacity style={s.addBtn} onPress={() => setAddOpen(true)}>
            <Feather name="user-plus" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={s.searchRow}>
          <Feather name="search" size={16} color="rgba(255,255,255,0.7)" />
          <TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder="Search patients…" placeholderTextColor="rgba(255,255,255,0.5)" autoCapitalize="words" />
          {!!search && <TouchableOpacity onPress={() => setSearch('')}><Feather name="x" size={16} color="rgba(255,255,255,0.7)" /></TouchableOpacity>}
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      ) : (
        <FlatList
          data={patients ?? []}
          keyExtractor={p => String(p.id)}
          contentContainerStyle={{ paddingVertical: 8, paddingBottom: 100 + (Platform.OS === 'web' ? 34 : 0) }}
          refreshing={isLoading}
          onRefresh={refetch}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.item} onPress={() => router.push(`/patients/${item.id}` as any)}>
              <View style={s.avatar}>
                <Text style={s.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{item.name}</Text>
                <Text style={s.phone}>{item.phone ?? 'No phone'}</Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60 }}>
              <Feather name="users" size={48} color={colors.border} />
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', marginTop: 12 }}>No patients yet</Text>
              <TouchableOpacity onPress={() => setAddOpen(true)} style={{ marginTop: 12, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.primary, borderRadius: 12 }}>
                <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold' }}>Add First Patient</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      <Modal visible={addOpen} transparent animationType="slide" onRequestClose={() => setAddOpen(false)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <Text style={s.sheetTitle}>Register Patient</Text>
            <KeyboardAwareScrollViewCompat style={{ paddingHorizontal: 20 }} keyboardShouldPersistTaps="handled">
              <Text style={s.label}>Full Name *</Text>
              <TextInput style={s.inp} value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} placeholder="Patient's full name" placeholderTextColor={colors.mutedForeground} autoCapitalize="words" />
              <Text style={s.label}>Phone</Text>
              <TextInput style={s.inp} value={form.phone} onChangeText={v => setForm(f => ({ ...f, phone: v }))} placeholder="+880…" placeholderTextColor={colors.mutedForeground} keyboardType="phone-pad" />

              <Text style={s.label}>Gender</Text>
              <View style={s.chipRow}>
                {(['male', 'female', 'other'] as const).map(g => {
                  const active = form.gender === g;
                  return (
                    <TouchableOpacity
                      key={g}
                      style={[s.formChip, { backgroundColor: active ? colors.primary : colors.card, borderColor: active ? colors.primary : colors.border }]}
                      onPress={() => setForm(f => ({ ...f, gender: active ? '' : g }))}
                    >
                      <Text style={[s.formChipText, { color: active ? '#fff' : colors.mutedForeground, textTransform: 'capitalize' }]}>{g}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={s.label}>Date of Birth</Text>
              <TextInput style={s.inp} value={form.dob} onChangeText={v => setForm(f => ({ ...f, dob: v }))} placeholder="YYYY-MM-DD" placeholderTextColor={colors.mutedForeground} />

              <Text style={s.label}>Notes</Text>
              <TextInput style={[s.inp, { height: 80, paddingTop: 10 }]} value={form.notes} onChangeText={v => setForm(f => ({ ...f, notes: v }))} placeholder="Allergies, conditions…" placeholderTextColor={colors.mutedForeground} multiline />
              <TouchableOpacity
                style={s.submitBtn}
                onPress={() => createPatient.mutate({
                  data: {
                    name: form.name,
                    phone: form.phone || undefined,
                    notes: form.notes || undefined,
                    ...(form.gender ? { gender: form.gender } : {}),
                    ...(form.dob ? { dateOfBirth: form.dob } : {}),
                  } as any,
                })}
                disabled={createPatient.isPending || !form.name.trim()}
              >
                {createPatient.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Register Patient</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setAddOpen(false)} style={{ alignItems: 'center', paddingVertical: 14 }}>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }}>Cancel</Text>
              </TouchableOpacity>
            </KeyboardAwareScrollViewCompat>
          </View>
        </View>
      </Modal>
    </View>
  );
}

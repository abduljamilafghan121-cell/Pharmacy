import { useColors } from '@/hooks/useColors';
import { useCreateUser, useListUsers, getListUsersQueryKey } from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

export default function UsersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const topInset = insets.top + (Platform.OS === 'web' ? 67 : 0);

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'pharmacist' as 'admin' | 'pharmacist' });

  const { data: users, isLoading, refetch } = useListUsers({});
  const createUser = useCreateUser({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListUsersQueryKey() }); setAddOpen(false); setForm({ name: '', email: '', password: '', role: 'pharmacist' }); } } });

  const roleColor = (r: string) => r === 'admin' ? colors.primary : '#F59E0B';

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.primary, paddingTop: topInset + 10, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { color: '#fff', fontSize: 20, fontFamily: 'Inter_700Bold' },
    addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    card: { backgroundColor: colors.card, marginHorizontal: 12, marginVertical: 4, borderRadius: colors.radius, padding: 14, flexDirection: 'row', alignItems: 'center' },
    avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    avatarText: { fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.primary },
    name: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: colors.foreground },
    email: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 2 },
    badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: insets.bottom + 20, maxHeight: '85%' },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: 12 },
    label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground, marginBottom: 4, marginTop: 12 },
    inp: { height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, paddingHorizontal: 12, color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 14 },
    submitBtn: { height: 50, borderRadius: colors.radius, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
          <Feather name="arrow-left" size={20} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>
        <Text style={s.title}>Staff Accounts</Text>
        <TouchableOpacity style={s.addBtn} onPress={() => setAddOpen(true)}>
          <Feather name="user-plus" size={16} color="#fff" />
        </TouchableOpacity>
      </View>

      {isLoading ? <ActivityIndicator style={{ flex: 1 }} color={colors.primary} /> : (
        <FlatList
          data={users ?? []}
          keyExtractor={u => String(u.id)}
          contentContainerStyle={{ paddingVertical: 8, paddingBottom: 40 }}
          refreshing={isLoading}
          onRefresh={refetch}
          renderItem={({ item }) => (
            <View style={s.card}>
              <View style={s.avatar}><Text style={s.avatarText}>{item.name.charAt(0).toUpperCase()}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{item.name}</Text>
                <Text style={s.email}>{item.email}</Text>
              </View>
              <View style={[s.badge, { backgroundColor: roleColor(item.role) + '20' }]}>
                <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: roleColor(item.role), textTransform: 'capitalize' }}>{item.role}</Text>
              </View>
            </View>
          )}
          ListEmptyComponent={<View style={{ alignItems: 'center', marginTop: 60 }}><Feather name="users" size={48} color={colors.border} /><Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', marginTop: 12 }}>No staff accounts</Text></View>}
        />
      )}

      <Modal visible={addOpen} transparent animationType="slide" onRequestClose={() => setAddOpen(false)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <KeyboardAwareScrollViewCompat style={{ paddingHorizontal: 20 }} keyboardShouldPersistTaps="handled">
              <Text style={{ fontSize: 17, fontFamily: 'Inter_700Bold', color: colors.foreground, marginTop: 8, marginBottom: 4 }}>Create Staff Account</Text>
              <Text style={s.label}>Full Name *</Text>
              <TextInput style={s.inp} value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} placeholder="Staff member name" placeholderTextColor={colors.mutedForeground} autoCapitalize="words" />
              <Text style={s.label}>Email *</Text>
              <TextInput style={s.inp} value={form.email} onChangeText={v => setForm(f => ({ ...f, email: v }))} placeholder="staff@pharmacy.com" placeholderTextColor={colors.mutedForeground} keyboardType="email-address" autoCapitalize="none" />
              <Text style={s.label}>Password *</Text>
              <TextInput style={s.inp} value={form.password} onChangeText={v => setForm(f => ({ ...f, password: v }))} placeholder="Minimum 6 characters" placeholderTextColor={colors.mutedForeground} secureTextEntry />
              <Text style={s.label}>Role</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {(['pharmacist', 'admin'] as const).map(r => (
                  <TouchableOpacity key={r} onPress={() => setForm(f => ({ ...f, role: r }))} style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1.5, borderColor: form.role === r ? roleColor(r) : colors.border, backgroundColor: form.role === r ? roleColor(r) + '15' : 'transparent' }}>
                    <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: form.role === r ? roleColor(r) : colors.mutedForeground, textTransform: 'capitalize' }}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={s.submitBtn} onPress={() => createUser.mutate({ data: { name: form.name, email: form.email, password: form.password, role: form.role } })} disabled={createUser.isPending || !form.name || !form.email || !form.password}>
                {createUser.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Create Account</Text>}
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

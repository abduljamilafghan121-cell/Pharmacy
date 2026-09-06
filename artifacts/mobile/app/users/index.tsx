import { useColors } from '@/hooks/useColors';
import { useCreateUser, useListUsers, getListUsersQueryKey, customFetch, type User } from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useAuth } from '@/contexts/AuthContext';
import { getErrorMessage } from '@/lib/format';

const ALL_ROLES = ['admin', 'pharmacist', 'cashier', 'viewer'] as const;
type Role = (typeof ALL_ROLES)[number];

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  pharmacist: 'Pharmacist',
  cashier: 'Cashier',
  viewer: 'Viewer (read-only)',
};

type UserRow = User & { isActive?: boolean };

export default function UsersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const topInset = insets.top + (Platform.OS === 'web' ? 67 : 0);

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'pharmacist' as Role });

  const [editing, setEditing] = useState<UserRow | null>(null);
  const [editForm, setEditForm] = useState({ name: '', phone: '', role: 'pharmacist' as Role, isActive: true });
  const [editBusy, setEditBusy] = useState(false);
  const [resetForm, setResetForm] = useState({ password: '', confirm: '' });
  const [resetBusy, setResetBusy] = useState(false);

  const { data: users, isLoading, refetch } = useListUsers({});
  const createUser = useCreateUser({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListUsersQueryKey() }); setAddOpen(false); setForm({ name: '', email: '', password: '', role: 'pharmacist' }); } } });

  const roleColor = (r: string) => (r === 'admin' ? colors.primary : r === 'pharmacist' ? '#3B82F6' : r === 'cashier' ? '#F59E0B' : '#94A3B8');

  const openEdit = (u: UserRow) => {
    setEditing(u);
    setEditForm({ name: u.name, phone: u.phone ?? '', role: (u.role as Role) ?? 'pharmacist', isActive: u.isActive !== false });
    setResetForm({ password: '', confirm: '' });
  };

  const saveEdit = async () => {
    if (!editing) return;
    setEditBusy(true);
    try {
      await customFetch(`/api/users/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name.trim(),
          phone: editForm.phone.trim() || null,
          role: editForm.role,
          isActive: editForm.isActive,
        }),
      });
      qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
      setEditing(null);
    } catch (e) {
      Alert.alert('Could not save', getErrorMessage(e));
    } finally {
      setEditBusy(false);
    }
  };

  const saveReset = async () => {
    if (!editing) return;
    if (resetForm.password.length < 6) {
      Alert.alert('Password too short', 'New password must be at least 6 characters.');
      return;
    }
    if (resetForm.password !== resetForm.confirm) {
      Alert.alert('Passwords do not match', 'Please re-enter the new password.');
      return;
    }
    setResetBusy(true);
    try {
      await customFetch(`/api/users/${editing.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: resetForm.password }),
      });
      Alert.alert('Password reset', `Password for ${editing.name} has been reset.`);
      setResetForm({ password: '', confirm: '' });
    } catch (e) {
      Alert.alert('Could not reset password', getErrorMessage(e));
    } finally {
      setResetBusy(false);
    }
  };

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
    editBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.input, alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
    inactiveTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: colors.muted, marginLeft: 6 },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: insets.bottom + 20, maxHeight: '88%' },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: 12 },
    label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground, marginBottom: 4, marginTop: 12 },
    inp: { height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, paddingHorizontal: 12, color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 14 },
    submitBtn: { height: 50, borderRadius: colors.radius, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
    rolePill: { flexBasis: '48%', paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1.5 },
    rolePillText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', textTransform: 'capitalize' },
    sectionTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.foreground },
    hint: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 8 },
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
          renderItem={({ item }) => {
            const row = item as UserRow;
            const inactive = row.isActive === false;
            return (
              <View style={[s.card, { opacity: inactive ? 0.6 : 1 }]}>
                <View style={s.avatar}><Text style={s.avatarText}>{row.name.charAt(0).toUpperCase()}</Text></View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={s.name}>{row.name}</Text>
                    {inactive && <Text style={[s.inactiveTag, { color: colors.mutedForeground }]}>Inactive</Text>}
                  </View>
                  <Text style={s.email}>{row.email}</Text>
                </View>
                <View style={[s.badge, { backgroundColor: roleColor(row.role) + '20' }]}>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: roleColor(row.role), textTransform: 'capitalize' }}>{row.role}</Text>
                </View>
                <TouchableOpacity style={s.editBtn} onPress={() => openEdit(row)}>
                  <Feather name="edit-2" size={14} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            );
          }}
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
              <Text style={s.label}>Access level</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {ALL_ROLES.map(r => (
                  <TouchableOpacity key={r} onPress={() => setForm(f => ({ ...f, role: r }))} style={[s.rolePill, { borderColor: form.role === r ? roleColor(r) : colors.border, backgroundColor: form.role === r ? roleColor(r) + '15' : 'transparent' }]}>
                    <Text style={[s.rolePillText, { color: form.role === r ? roleColor(r) : colors.mutedForeground }]}>{ROLE_LABELS[r]}</Text>
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

      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <KeyboardAwareScrollViewCompat style={{ paddingHorizontal: 20 }} keyboardShouldPersistTaps="handled">
              <Text style={{ fontSize: 17, fontFamily: 'Inter_700Bold', color: colors.foreground, marginTop: 8, marginBottom: 4 }}>Edit {editing?.name}</Text>
              <Text style={s.label}>Full Name</Text>
              <TextInput style={s.inp} value={editForm.name} onChangeText={v => setEditForm(f => ({ ...f, name: v }))} autoCapitalize="words" />
              <Text style={s.label}>Phone</Text>
              <TextInput style={s.inp} value={editForm.phone} onChangeText={v => setEditForm(f => ({ ...f, phone: v }))} keyboardType="phone-pad" placeholder="Optional" placeholderTextColor={colors.mutedForeground} />
              <Text style={s.label}>Access level</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {ALL_ROLES.map(r => (
                  <TouchableOpacity key={r} onPress={() => me?.id !== editing?.id && setEditForm(f => ({ ...f, role: r }))} style={[s.rolePill, { borderColor: editForm.role === r ? roleColor(r) : colors.border, backgroundColor: editForm.role === r ? roleColor(r) + '15' : 'transparent', opacity: me?.id === editing?.id ? 0.5 : 1 }]}>
                    <Text style={[s.rolePillText, { color: editForm.role === r ? roleColor(r) : colors.mutedForeground }]}>{ROLE_LABELS[r]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.label}>Account status</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {([true, false] as const).map(active => (
                  <TouchableOpacity key={String(active)} onPress={() => me?.id !== editing?.id && setEditForm(f => ({ ...f, isActive: active }))} style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1.5, borderColor: editForm.isActive === active ? (active ? colors.success : colors.destructive) : colors.border, backgroundColor: editForm.isActive === active ? (active ? colors.success + '15' : colors.destructive + '15') : 'transparent', opacity: me?.id === editing?.id ? 0.5 : 1 }}>
                    <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: editForm.isActive === active ? (active ? colors.success : colors.destructive) : colors.mutedForeground }}>{active ? 'Active' : 'Deactivated'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {me?.id === editing?.id && <Text style={s.hint}>You cannot change your own role or deactivate your own account.</Text>}

              <TouchableOpacity style={s.submitBtn} onPress={saveEdit} disabled={editBusy || !editForm.name.trim()}>
                {editBusy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Save Changes</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditing(null)} style={{ alignItems: 'center', paddingVertical: 14 }}>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }}>Cancel</Text>
              </TouchableOpacity>

              <View style={{ borderTopWidth: 1, borderTopColor: colors.border, marginTop: 8 }}>
                <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: colors.foreground, marginTop: 16 }}>Reset Password</Text>
                <Text style={s.label}>New Password</Text>
                <TextInput style={s.inp} value={resetForm.password} onChangeText={v => setResetForm(f => ({ ...f, password: v }))} placeholder="Minimum 6 characters" placeholderTextColor={colors.mutedForeground} secureTextEntry />
                <Text style={s.label}>Confirm New Password</Text>
                <TextInput style={s.inp} value={resetForm.confirm} onChangeText={v => setResetForm(f => ({ ...f, confirm: v }))} placeholder="Re-enter password" placeholderTextColor={colors.mutedForeground} secureTextEntry />
                <TouchableOpacity style={[s.submitBtn, { backgroundColor: colors.muted }]} onPress={saveReset} disabled={resetBusy}>
                  {resetBusy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Set Password</Text>}
                </TouchableOpacity>
              </View>
            </KeyboardAwareScrollViewCompat>
          </View>
        </View>
      </Modal>
    </View>
  );
}
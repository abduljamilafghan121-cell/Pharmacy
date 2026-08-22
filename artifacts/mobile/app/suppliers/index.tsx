import { useColors } from '@/hooks/useColors';
import { useCreateSupplier, useListSuppliers, getListSuppliersQueryKey } from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

export default function SuppliersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const topInset = insets.top + (Platform.OS === 'web' ? 67 : 0);

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: '', contactName: '', email: '', phone: '', address: '' });

  const { data: suppliers, isLoading, refetch } = useListSuppliers({});
  const createSupplier = useCreateSupplier({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListSuppliersQueryKey() }); setAddOpen(false); setForm({ name: '', contactName: '', email: '', phone: '', address: '' }); } } });

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.primary, paddingTop: topInset + 10, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { color: '#fff', fontSize: 20, fontFamily: 'Inter_700Bold' },
    addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    card: { backgroundColor: colors.card, marginHorizontal: 12, marginVertical: 4, borderRadius: colors.radius, padding: 14, flexDirection: 'row', alignItems: 'center' },
    avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    avatarText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: colors.primary },
    name: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: colors.foreground },
    sub: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 2 },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: insets.bottom + 20, maxHeight: '90%' },
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
        <Text style={s.title}>Suppliers</Text>
        <TouchableOpacity style={s.addBtn} onPress={() => setAddOpen(true)}>
          <Feather name="plus" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {isLoading ? <ActivityIndicator style={{ flex: 1 }} color={colors.primary} /> : (
        <FlatList
          data={suppliers ?? []}
          keyExtractor={s => String(s.id)}
          contentContainerStyle={{ paddingVertical: 8, paddingBottom: 40 }}
          refreshing={isLoading}
          onRefresh={refetch}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.card} onPress={() => router.push(`/suppliers/${item.id}` as any)}>
              <View style={s.avatar}><Text style={s.avatarText}>{item.name.charAt(0).toUpperCase()}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{item.name}</Text>
                <Text style={s.sub}>{item.contactName ?? item.email ?? item.phone ?? 'No contact info'}</Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={<View style={{ alignItems: 'center', marginTop: 60 }}><Feather name="truck" size={48} color={colors.border} /><Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', marginTop: 12 }}>No suppliers yet</Text></View>}
        />
      )}

      <Modal visible={addOpen} transparent animationType="slide" onRequestClose={() => setAddOpen(false)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <KeyboardAwareScrollViewCompat style={{ paddingHorizontal: 20 }} keyboardShouldPersistTaps="handled">
              <Text style={{ fontSize: 17, fontFamily: 'Inter_700Bold', color: colors.foreground, marginTop: 8, marginBottom: 4 }}>Add Supplier</Text>
              <Text style={s.label}>Company Name *</Text>
              <TextInput style={s.inp} value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} placeholder="e.g. Square Pharma" placeholderTextColor={colors.mutedForeground} />
              <Text style={s.label}>Contact Name</Text>
              <TextInput style={s.inp} value={form.contactName} onChangeText={v => setForm(f => ({ ...f, contactName: v }))} placeholder="Person to contact" placeholderTextColor={colors.mutedForeground} />
              <Text style={s.label}>Email</Text>
              <TextInput style={s.inp} value={form.email} onChangeText={v => setForm(f => ({ ...f, email: v }))} placeholder="email@supplier.com" placeholderTextColor={colors.mutedForeground} keyboardType="email-address" autoCapitalize="none" />
              <Text style={s.label}>Phone</Text>
              <TextInput style={s.inp} value={form.phone} onChangeText={v => setForm(f => ({ ...f, phone: v }))} placeholder="+880…" placeholderTextColor={colors.mutedForeground} keyboardType="phone-pad" />
              <Text style={s.label}>Address</Text>
              <TextInput style={[s.inp, { height: 70, paddingTop: 10 }]} value={form.address} onChangeText={v => setForm(f => ({ ...f, address: v }))} placeholder="Street, city" placeholderTextColor={colors.mutedForeground} multiline />
              <TouchableOpacity style={s.submitBtn} onPress={() => createSupplier.mutate({ data: { name: form.name, contactName: form.contactName || undefined, email: form.email || undefined, phone: form.phone || undefined, address: form.address || undefined } })} disabled={createSupplier.isPending || !form.name.trim()}>
                {createSupplier.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Add Supplier</Text>}
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

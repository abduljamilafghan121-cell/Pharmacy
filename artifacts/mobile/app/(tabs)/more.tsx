import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type MenuItem = { label: string; icon: string; route?: string; onPress?: () => void; badge?: string; danger?: boolean };

export default function MoreScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const router = useRouter();
  const topInset = insets.top + (Platform.OS === 'web' ? 67 : 0);

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  const role = user?.role;
  const canSeeCashRegister = role === 'admin' || role === 'pharmacist' || role === 'cashier';
  const canSeeInsuranceClaims = role === 'admin' || role === 'pharmacist' || role === 'viewer';
  const canSeePreAuths = role === 'admin' || role === 'pharmacist';
  const canSeeSupplierReturns = role === 'admin' || role === 'pharmacist' || role === 'viewer';
  const canSeeControlledSubstances = role === 'admin' || role === 'pharmacist';

  const sections: { title: string; items: MenuItem[] }[] = [
    {
      title: 'Inventory',
      items: [
        { label: 'Purchase Orders', icon: 'package', route: '/purchase-orders' },
        { label: 'Suppliers', icon: 'truck', route: '/suppliers' },
        { label: 'Stocktakes', icon: 'clipboard', route: '/stocktakes' },
        ...(canSeeSupplierReturns ? [{ label: 'Supplier Returns', icon: 'corner-up-left', route: '/supplier-returns' } as MenuItem] : []),
      ],
    },
    ...(canSeeCashRegister || canSeeInsuranceClaims || canSeePreAuths ? [{
      title: 'Register & Insurance',
      items: [
        ...(canSeeCashRegister ? [{ label: 'Cash Register', icon: 'dollar-sign', route: '/cash-register' } as MenuItem] : []),
        ...(canSeeInsuranceClaims ? [{ label: 'Insurance Claims', icon: 'shield', route: '/insurance-claims' } as MenuItem] : []),
        ...(canSeePreAuths ? [{ label: 'Pre-Authorizations', icon: 'file-text', route: '/pre-authorizations' } as MenuItem] : []),
      ],
    }] : []),
    {
      title: 'Clinical',
      items: [
        { label: 'Prescriptions', icon: 'file-text', route: '/prescriptions' },
        { label: 'Drug Interactions', icon: 'alert-triangle', route: '/drug-interactions' },
        ...(canSeeControlledSubstances ? [{ label: 'Controlled Substances', icon: 'lock', route: '/controlled-substances' } as MenuItem] : []),
      ],
    },
    {
      title: 'Analytics',
      items: [
        { label: 'Reports & Analytics', icon: 'bar-chart-2', route: '/reports' },
      ],
    },
    ...(user?.role === 'admin' ? [{
      title: 'Administration',
      items: [
        { label: 'Pharmacy Settings', icon: 'settings', route: '/settings' },
        { label: 'Staff Accounts', icon: 'user-check', route: '/users' },
        { label: 'Audit Log', icon: 'shield', route: '/audit-log' },
      ],
    }] : []),
    {
      title: 'Account',
      items: [
        { label: 'Sign Out', icon: 'log-out', onPress: handleLogout, danger: true },
      ],
    },
  ];

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.primary, paddingTop: topInset + 10, paddingBottom: 24, paddingHorizontal: 20 },
    profileRow: { flexDirection: 'row', alignItems: 'center' },
    avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: '#fff', fontSize: 20, fontFamily: 'Inter_700Bold' },
    profileInfo: { marginLeft: 14 },
    profileName: { color: '#fff', fontSize: 17, fontFamily: 'Inter_700Bold' },
    profileEmail: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
    roleBadge: { marginTop: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)' },
    roleText: { color: '#fff', fontSize: 11, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5 },
    sectionTitle: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.8, marginLeft: 20, marginTop: 24, marginBottom: 6 },
    card: { backgroundColor: colors.card, marginHorizontal: 12, borderRadius: colors.radius, overflow: 'hidden' },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
    rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    rowLabel: { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium' },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.profileRow}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{(user?.name ?? 'U').charAt(0).toUpperCase()}</Text>
          </View>
          <View style={s.profileInfo}>
            <Text style={s.profileName}>{user?.name}</Text>
            <Text style={s.profileEmail}>{user?.email}</Text>
            <View style={s.roleBadge}>
              <Text style={s.roleText}>{user?.role}</Text>
            </View>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 100 + (Platform.OS === 'web' ? 34 : 0) }}>
        {sections.map(section => (
          <View key={section.title}>
            <Text style={s.sectionTitle}>{section.title}</Text>
            <View style={s.card}>
              {section.items.map((item, i) => (
                <Pressable
                  key={item.label}
                  style={({ pressed }) => [s.row, i === section.items.length - 1 && { borderBottomWidth: 0 }, { opacity: pressed ? 0.7 : 1 }]}
                  onPress={item.onPress ?? (() => item.route && router.push(item.route as any))}
                >
                  <View style={[s.rowIcon, { backgroundColor: item.danger ? '#FEF2F2' : colors.secondary }]}>
                    <Feather name={item.icon as any} size={16} color={item.danger ? colors.destructive : colors.primary} />
                  </View>
                  <Text style={[s.rowLabel, { color: item.danger ? colors.destructive : colors.foreground }]}>{item.label}</Text>
                  {!item.danger && <Feather name="chevron-right" size={16} color={colors.mutedForeground} />}
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        <Text style={{ textAlign: 'center', color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 32 }}>PharmaCore v1.0.0</Text>
      </ScrollView>
    </View>
  );
}

import { useColors } from '@/hooks/useColors';
import { getErrorMessage } from '@/lib/format';
import { usePharmacySettings, useUpdatePharmacySettings } from '@/hooks/usePharmacySettings';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Display-only presets — NOT live exchange rates. Picking one just changes
// the label formatCurrency() uses everywhere; the underlying numbers never
// change. "Custom" lets a pharmacy type any symbol/code (e.g. "afg").
const CURRENCY_PRESETS: { label: string; symbol: string; position: 'prefix' | 'suffix' }[] = [
  { label: 'US Dollar', symbol: '$', position: 'prefix' },
  { label: 'Euro', symbol: '€', position: 'prefix' },
  { label: 'British Pound', symbol: '£', position: 'prefix' },
  { label: 'Afghani', symbol: 'AFN', position: 'suffix' },
  { label: 'Pakistani Rupee', symbol: '₨', position: 'prefix' },
  { label: 'Indian Rupee', symbol: '₹', position: 'prefix' },
  { label: 'UAE Dirham', symbol: 'AED', position: 'prefix' },
  { label: 'Saudi Riyal', symbol: 'SAR', position: 'suffix' },
];

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topInset = insets.top + (Platform.OS === 'web' ? 67 : 0);

  const { data, isLoading } = usePharmacySettings();
  const update = useUpdatePharmacySettings();

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [taxRate, setTaxRate] = useState('0');
  const [currencySymbol, setCurrencySymbol] = useState('$');
  const [currencyPosition, setCurrencyPosition] = useState<'prefix' | 'suffix'>('prefix');
  const [initialised, setInitialised] = useState(false);

  useEffect(() => {
    if (data && !initialised) {
      setName(data.name ?? '');
      setAddress(data.address ?? '');
      setPhone(data.phone ?? '');
      setTaxRate(data.taxRatePercent ?? '0');
      setCurrencySymbol(data.currencySymbol ?? '$');
      setCurrencyPosition(data.currencyPosition ?? 'prefix');
      setInitialised(true);
    }
  }, [data, initialised]);

  const save = () => {
    const taxVal = parseFloat(taxRate);
    if (isNaN(taxVal) || taxVal < 0 || taxVal > 100) {
      Alert.alert('Invalid tax rate', 'Tax rate must be between 0 and 100.');
      return;
    }
    update.mutate(
      {
        name: name.trim() || 'My Pharmacy',
        address: address.trim() || null,
        phone: phone.trim() || null,
        taxRatePercent: taxVal.toFixed(2),
        currencySymbol: currencySymbol.trim() || '$',
        currencyPosition,
      },
      {
        onSuccess: () => Alert.alert('Saved', 'Pharmacy settings updated.'),
        onError: (e) => Alert.alert("Couldn't save settings", getErrorMessage(e)),
      },
    );
  };

  const preview = currencyPosition === 'prefix' ? `${currencySymbol}1,234.56` : `1,234.56 ${currencySymbol}`;

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.primary, paddingTop: topInset + 10, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
    title: { color: '#fff', fontSize: 20, fontFamily: 'Inter_700Bold' },
    section: { backgroundColor: colors.card, marginHorizontal: 12, marginTop: 14, borderRadius: colors.radius, padding: 16 },
    sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    sectionTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', color: colors.foreground },
    sectionHint: { fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginBottom: 12, lineHeight: 16 },
    label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground, marginBottom: 4, marginTop: 12 },
    inp: { height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, paddingHorizontal: 12, color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 14 },
    presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    presetChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
    presetText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
    row2: { flexDirection: 'row', gap: 10 },
    posBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, alignItems: 'center' },
    previewBox: { backgroundColor: colors.muted, borderRadius: 10, padding: 12, marginTop: 14, alignItems: 'center' },
    previewLabel: { fontSize: 10, fontFamily: 'Inter_500Medium', color: colors.mutedForeground, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
    previewVal: { fontSize: 20, fontFamily: 'Inter_700Bold', color: colors.primary },
    submitBtn: { height: 50, borderRadius: colors.radius, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 18, marginHorizontal: 12, marginBottom: 40 },
  });

  if (isLoading) {
    return <View style={[s.container, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={colors.primary} /></View>;
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>
        <Text style={s.title}>Pharmacy Settings</Text>
      </View>

      <KeyboardAwareScrollViewCompat keyboardShouldPersistTaps="handled">
        <View style={s.section}>
          <Text style={s.sectionTitle}>Pharmacy Details</Text>
          <Text style={s.label}>Name</Text>
          <TextInput style={s.inp} value={name} onChangeText={setName} placeholder="My Pharmacy" placeholderTextColor={colors.mutedForeground} />
          <Text style={s.label}>Address</Text>
          <TextInput style={s.inp} value={address} onChangeText={setAddress} placeholder="123 Main St, City" placeholderTextColor={colors.mutedForeground} />
          <Text style={s.label}>Phone</Text>
          <TextInput style={s.inp} value={phone} onChangeText={setPhone} placeholder="+1 555 000 0000" keyboardType="phone-pad" placeholderTextColor={colors.mutedForeground} />
          <Text style={s.label}>Tax rate (%)</Text>
          <TextInput style={s.inp} value={taxRate} onChangeText={setTaxRate} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.mutedForeground} />
          <Text style={[s.sectionHint, { marginTop: 4, marginBottom: 0 }]}>Applied automatically to every sale. Set to 0 to disable.</Text>
        </View>

        <View style={s.section}>
          <View style={s.sectionHead}>
            <Feather name="dollar-sign" size={16} color={colors.primary} />
            <Text style={s.sectionTitle}>Currency</Text>
          </View>
          <Text style={s.sectionHint}>
            Display only — no exchange rate is applied. This just changes how amounts are labeled everywhere (e.g. "200 AFN" or "$200.00"); the numbers themselves never change.
          </Text>

          <Text style={s.label}>Preset</Text>
          <View style={s.presetRow}>
            {CURRENCY_PRESETS.map((p) => {
              const active = currencySymbol === p.symbol && currencyPosition === p.position;
              return (
                <TouchableOpacity
                  key={p.label}
                  style={[s.presetChip, { backgroundColor: active ? colors.primary : colors.background, borderColor: active ? colors.primary : colors.border }]}
                  onPress={() => { setCurrencySymbol(p.symbol); setCurrencyPosition(p.position); }}
                >
                  <Text style={[s.presetText, { color: active ? '#fff' : colors.mutedForeground }]}>{p.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={s.label}>Symbol / code</Text>
          <TextInput style={s.inp} value={currencySymbol} onChangeText={setCurrencySymbol} placeholder="e.g. $ or afg" maxLength={10} placeholderTextColor={colors.mutedForeground} />

          <Text style={s.label}>Position</Text>
          <View style={s.row2}>
            <TouchableOpacity
              style={[s.posBtn, { backgroundColor: currencyPosition === 'prefix' ? colors.secondary : 'transparent', borderColor: currencyPosition === 'prefix' ? colors.primary : colors.border }]}
              onPress={() => setCurrencyPosition('prefix')}
            >
              <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: currencyPosition === 'prefix' ? colors.primary : colors.mutedForeground }}>Before ($200.00)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.posBtn, { backgroundColor: currencyPosition === 'suffix' ? colors.secondary : 'transparent', borderColor: currencyPosition === 'suffix' ? colors.primary : colors.border }]}
              onPress={() => setCurrencyPosition('suffix')}
            >
              <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: currencyPosition === 'suffix' ? colors.primary : colors.mutedForeground }}>After (200.00 afg)</Text>
            </TouchableOpacity>
          </View>

          <View style={s.previewBox}>
            <Text style={s.previewLabel}>Preview</Text>
            <Text style={s.previewVal}>{preview}</Text>
          </View>
        </View>

        <TouchableOpacity style={s.submitBtn} disabled={update.isPending} onPress={save}>
          {update.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Save Settings</Text>}
        </TouchableOpacity>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

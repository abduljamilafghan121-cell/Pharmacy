import { useColors } from '@/hooks/useColors';
import { getErrorMessage } from '@/lib/format';
import { usePharmacySettings, useUpdatePharmacySettings } from '@/hooks/usePharmacySettings';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useAuth } from '@/contexts/AuthContext';
import {
  useListCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  useUpdateProfile,
  useChangePassword,
  getListCategoriesQueryKey,
  type Category,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
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

async function pickLogoImage(): Promise<{ dataUrl: string } | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Permission needed', 'Allow photo library access to set a pharmacy logo.');
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.7,
    base64: true,
  });
  if (result.canceled || !result.assets?.[0]?.base64) return null;
  const asset = result.assets[0];
  if ((asset.fileSize ?? 0) > 2 * 1024 * 1024) {
    Alert.alert('Logo too large', 'Please choose an image under 2 MB.');
    return null;
  }
  const mime = asset.mimeType ?? 'image/jpeg';
  return { dataUrl: `data:${mime};base64,${asset.base64}` };
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { user, updateUser } = useAuth();
  const topInset = insets.top + (Platform.OS === 'web' ? 67 : 0);

  // ── Pharmacy details + logo + currency ──────────────────────────────────
  const { data, isLoading } = usePharmacySettings();
  const update = useUpdatePharmacySettings();

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [taxRate, setTaxRate] = useState('0');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [currencySymbol, setCurrencySymbol] = useState('$');
  const [currencyPosition, setCurrencyPosition] = useState<'prefix' | 'suffix'>('prefix');
  const [initialised, setInitialised] = useState(false);

  useEffect(() => {
    if (data && !initialised) {
      setName(data.name ?? '');
      setAddress(data.address ?? '');
      setPhone(data.phone ?? '');
      setEmail(data.email ?? '');
      setLicenseNumber(data.licenseNumber ?? '');
      setTaxRate(data.taxRatePercent ?? '0');
      setLogoUrl(data.logoUrl ?? null);
      setCurrencySymbol(data.currencySymbol ?? '$');
      setCurrencyPosition(data.currencyPosition ?? 'prefix');
      setInitialised(true);
    }
  }, [data, initialised]);

  const pickLogo = async () => {
    const picked = await pickLogoImage();
    if (picked) setLogoUrl(picked.dataUrl);
  };

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
        email: email.trim() || null,
        licenseNumber: licenseNumber.trim() || null,
        taxRatePercent: taxVal.toFixed(2),
        logoUrl: logoUrl || null,
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

  // ── Profile details ──────────────────────────────────────────────────────
  const [profileName, setProfileName] = useState(user?.name ?? '');
  const [profilePhone, setProfilePhone] = useState(user?.phone ?? '');

  const updateProfile = useUpdateProfile({
    mutation: {
      onSuccess: (updated) => {
        updateUser({ name: updated.name, phone: updated.phone ?? undefined });
        Alert.alert('Saved', 'Profile updated.');
      },
      onError: (e) => Alert.alert("Couldn't update profile", getErrorMessage(e)),
    },
  });

  const saveProfile = () => {
    if (!profileName.trim()) {
      Alert.alert('Name required', 'Please enter your name.');
      return;
    }
    updateProfile.mutate({ data: { name: profileName.trim(), phone: profilePhone.trim() || null } });
  };

  // ── Change password ──────────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const changePassword = useChangePassword({
    mutation: {
      onSuccess: () => {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        Alert.alert('Success', 'Password changed successfully.');
      },
      onError: (e) => Alert.alert("Couldn't change password", getErrorMessage(e)),
    },
  });

  const savePassword = () => {
    if (!currentPassword || !newPassword) {
      Alert.alert('Missing details', 'Enter your current and new password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Passwords do not match', 'New password and confirmation must match.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Password too short', 'New password must be at least 6 characters.');
      return;
    }
    changePassword.mutate({ data: { currentPassword, newPassword } });
  };

  // ── Medicine categories ──────────────────────────────────────────────────
  const { data: categories = [], isLoading: categoriesLoading } = useListCategories();
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatDesc, setEditCatDesc] = useState('');

  const createCategory = useCreateCategory({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
        setNewCatName('');
        setNewCatDesc('');
      },
      onError: (e) => Alert.alert("Couldn't create category", getErrorMessage(e)),
    },
  });
  const updateCategory = useUpdateCategory({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
        setEditingCatId(null);
      },
      onError: (e) => Alert.alert("Couldn't update category", getErrorMessage(e)),
    },
  });
  const deleteCategory = useDeleteCategory({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getListCategoriesQueryKey() }),
      onError: (e) => Alert.alert("Couldn't delete category", getErrorMessage(e)),
    },
  });

  const addCategory = () => {
    if (!newCatName.trim()) return;
    createCategory.mutate({ data: { name: newCatName.trim(), description: newCatDesc.trim() || undefined } });
  };
  const startEditCategory = (cat: Category) => {
    setEditingCatId(cat.id);
    setEditCatName(cat.name);
    setEditCatDesc(cat.description ?? '');
  };
  const saveEditCategory = (id: number) => {
    if (!editCatName.trim()) return;
    updateCategory.mutate({ id, data: { name: editCatName.trim(), description: editCatDesc.trim() || undefined } });
  };
  const confirmDeleteCategory = (cat: Category) => {
    Alert.alert('Delete category', `Delete "${cat.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteCategory.mutate({ id: cat.id }) },
    ]);
  };

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
    inpDisabled: { opacity: 0.6 },
    presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    presetChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
    presetText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
    row2: { flexDirection: 'row', gap: 10 },
    posBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, alignItems: 'center' },
    previewBox: { backgroundColor: colors.muted, borderRadius: 10, padding: 12, marginTop: 14, alignItems: 'center' },
    previewLabel: { fontSize: 10, fontFamily: 'Inter_500Medium', color: colors.mutedForeground, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
    previewVal: { fontSize: 20, fontFamily: 'Inter_700Bold', color: colors.primary },
    saveBtn: { height: 48, borderRadius: colors.radius, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
    saveBtnText: { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 14 },
    submitBtn: { height: 50, borderRadius: colors.radius, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 18, marginHorizontal: 12, marginBottom: 40 },
    // Logo
    logoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4 },
    logoBox: { width: 72, height: 72, borderRadius: 16, backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
    logoActions: { flex: 1, gap: 8 },
    logoBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
    logoBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.foreground },
    logoRemoveText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.destructive },
    // Categories
    catAddRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    catInput: { flex: 1, height: 40, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, paddingHorizontal: 10, color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 13 },
    catAddBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    catRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
    catRowFirst: { borderTopWidth: 0 },
    catName: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.foreground },
    catDesc: { fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 1 },
    catActions: { flexDirection: 'row', gap: 4 },
    catActionBtn: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    catEditRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
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

        {/* Pharmacy Logo */}
        <View style={s.section}>
          <View style={s.sectionHead}>
            <Feather name="image" size={16} color={colors.primary} />
            <Text style={s.sectionTitle}>Pharmacy Logo</Text>
          </View>
          <Text style={s.sectionHint}>Shown on receipts and the pharmacy profile. Square images work best, under 2 MB.</Text>
          <View style={s.logoRow}>
            <View style={s.logoBox}>
              {logoUrl ? (
                <Image source={{ uri: logoUrl }} style={{ width: 72, height: 72 }} resizeMode="cover" />
              ) : (
                <Feather name="image" size={26} color={colors.mutedForeground} />
              )}
            </View>
            <View style={s.logoActions}>
              <TouchableOpacity style={s.logoBtn} onPress={pickLogo}>
                <Feather name="upload" size={14} color={colors.foreground} />
                <Text style={s.logoBtnText}>{logoUrl ? 'Change logo' : 'Upload logo'}</Text>
              </TouchableOpacity>
              {!!logoUrl && (
                <TouchableOpacity style={{ alignItems: 'center' }} onPress={() => setLogoUrl(null)}>
                  <Text style={s.logoRemoveText}>Remove logo</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* Pharmacy Details */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Pharmacy Details</Text>
          <Text style={s.label}>Name</Text>
          <TextInput style={s.inp} value={name} onChangeText={setName} placeholder="My Pharmacy" placeholderTextColor={colors.mutedForeground} />
          <Text style={s.label}>Address</Text>
          <TextInput style={s.inp} value={address} onChangeText={setAddress} placeholder="123 Main St, City" placeholderTextColor={colors.mutedForeground} />
          <Text style={s.label}>Phone</Text>
          <TextInput style={s.inp} value={phone} onChangeText={setPhone} placeholder="+1 555 000 0000" keyboardType="phone-pad" placeholderTextColor={colors.mutedForeground} />
          <Text style={s.label}>Email</Text>
          <TextInput style={s.inp} value={email} onChangeText={setEmail} placeholder="pharmacy@example.com" keyboardType="email-address" autoCapitalize="none" placeholderTextColor={colors.mutedForeground} />
          <Text style={s.label}>License number</Text>
          <TextInput style={s.inp} value={licenseNumber} onChangeText={setLicenseNumber} placeholder="e.g. PH-2024-001" placeholderTextColor={colors.mutedForeground} />
          <Text style={s.label}>Tax rate (%)</Text>
          <TextInput style={s.inp} value={taxRate} onChangeText={setTaxRate} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.mutedForeground} />
          <Text style={[s.sectionHint, { marginTop: 4, marginBottom: 0 }]}>Applied automatically to every sale. Set to 0 to disable.</Text>
        </View>

        {/* Currency */}
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
          {update.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Save Pharmacy Settings</Text>}
        </TouchableOpacity>

        {/* Profile Details */}
        <View style={s.section}>
          <View style={s.sectionHead}>
            <Feather name="user" size={16} color={colors.primary} />
            <Text style={s.sectionTitle}>Profile Details</Text>
          </View>
          <Text style={s.sectionHint}>Your personal account information.</Text>
          <Text style={s.label}>Name</Text>
          <TextInput style={s.inp} value={profileName} onChangeText={setProfileName} placeholder="Your name" placeholderTextColor={colors.mutedForeground} />
          <Text style={s.label}>Phone</Text>
          <TextInput style={s.inp} value={profilePhone} onChangeText={setProfilePhone} placeholder="+1 555 000 0000" keyboardType="phone-pad" placeholderTextColor={colors.mutedForeground} />
          <Text style={s.label}>Email</Text>
          <TextInput style={[s.inp, s.inpDisabled]} value={user?.email ?? ''} editable={false} placeholderTextColor={colors.mutedForeground} />
          <Text style={[s.sectionHint, { marginTop: 4, marginBottom: 0 }]}>Email cannot be changed here.</Text>
          <TouchableOpacity style={s.saveBtn} disabled={updateProfile.isPending} onPress={saveProfile}>
            {updateProfile.isPending ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Save Profile</Text>}
          </TouchableOpacity>
        </View>

        {/* Change Password */}
        <View style={s.section}>
          <View style={s.sectionHead}>
            <Feather name="lock" size={16} color={colors.primary} />
            <Text style={s.sectionTitle}>Change Password</Text>
          </View>
          <Text style={s.sectionHint}>Enter your current password then choose a new one.</Text>
          <Text style={s.label}>Current password</Text>
          <TextInput style={s.inp} value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry placeholder="Your current password" placeholderTextColor={colors.mutedForeground} />
          <Text style={s.label}>New password</Text>
          <TextInput style={s.inp} value={newPassword} onChangeText={setNewPassword} secureTextEntry placeholder="At least 6 characters" placeholderTextColor={colors.mutedForeground} />
          <Text style={s.label}>Confirm new password</Text>
          <TextInput style={s.inp} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry placeholder="Repeat new password" placeholderTextColor={colors.mutedForeground} />
          <TouchableOpacity style={s.saveBtn} disabled={changePassword.isPending} onPress={savePassword}>
            {changePassword.isPending ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Change Password</Text>}
          </TouchableOpacity>
        </View>

        {/* Medicine Categories */}
        <View style={s.section}>
          <View style={s.sectionHead}>
            <Feather name="tag" size={16} color={colors.primary} />
            <Text style={s.sectionTitle}>Medicine Categories</Text>
          </View>
          <Text style={s.sectionHint}>Categories available when adding medicines.</Text>

          <View style={s.catAddRow}>
            <TextInput style={s.catInput} value={newCatName} onChangeText={setNewCatName} placeholder="Category name" placeholderTextColor={colors.mutedForeground} />
            <TextInput style={s.catInput} value={newCatDesc} onChangeText={setNewCatDesc} placeholder="Description (optional)" placeholderTextColor={colors.mutedForeground} />
            <TouchableOpacity style={s.catAddBtn} disabled={createCategory.isPending || !newCatName.trim()} onPress={addCategory}>
              <Feather name="plus" size={18} color="#fff" />
            </TouchableOpacity>
          </View>

          {categoriesLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : categories.length === 0 ? (
            <Text style={{ textAlign: 'center', color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, paddingVertical: 12 }}>No categories yet. Add one above.</Text>
          ) : (
            categories.map((cat, idx) => (
              <View key={cat.id} style={[s.catRow, idx === 0 && s.catRowFirst]}>
                {editingCatId === cat.id ? (
                  <View style={{ flex: 1 }}>
                    <View style={s.catEditRow}>
                      <TextInput style={[s.catInput, { height: 34 }]} value={editCatName} onChangeText={setEditCatName} placeholder="Name" placeholderTextColor={colors.mutedForeground} autoFocus />
                      <TextInput style={[s.catInput, { height: 34 }]} value={editCatDesc} onChangeText={setEditCatDesc} placeholder="Description" placeholderTextColor={colors.mutedForeground} />
                      <TouchableOpacity style={s.catActionBtn} disabled={updateCategory.isPending || !editCatName.trim()} onPress={() => saveEditCategory(cat.id)}>
                        <Feather name="check" size={16} color={colors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity style={s.catActionBtn} onPress={() => setEditingCatId(null)}>
                        <Feather name="x" size={16} color={colors.mutedForeground} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <>
                    <View style={{ flex: 1 }}>
                      <Text style={s.catName}>{cat.name}</Text>
                      {!!cat.description && <Text style={s.catDesc}>{cat.description}</Text>}
                    </View>
                    <View style={s.catActions}>
                      <TouchableOpacity style={s.catActionBtn} onPress={() => startEditCategory(cat)}>
                        <Feather name="edit-2" size={14} color={colors.mutedForeground} />
                      </TouchableOpacity>
                      <TouchableOpacity style={s.catActionBtn} disabled={deleteCategory.isPending} onPress={() => confirmDeleteCategory(cat)}>
                        <Feather name="trash-2" size={14} color={colors.destructive} />
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            ))
          )}
        </View>

        <View style={{ height: 40 }} />
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

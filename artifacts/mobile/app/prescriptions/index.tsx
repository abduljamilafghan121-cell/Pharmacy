import { useColors } from '@/hooks/useColors';
import { getErrorMessage } from '@/lib/format';
import { useApiMutation } from '@/hooks/useApi';
import { useAuth } from '@/contexts/AuthContext';
import {
  useListPrescriptions,
  useVerifyPrescription,
  useRejectPrescription,
  getListPrescriptionsQueryKey,
} from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

const FILTERS = ['all', 'pending', 'verified', 'rejected'] as const;

// The generated Prescription type is stale (lists customerId/customerName,
// imageUrl) — the server actually returns patientId/patientName/doctorName/
// maxRefills/refillsUsed/attachmentUrl (see artifacts/api-server/src/routes/
// prescriptions.ts). Mirrors the `as any` cast web already uses for this.
interface PrescriptionRow {
  id: number;
  patientId: number | null;
  patientName: string | null;
  doctorName: string | null;
  attachmentUrl: string | null;
  status: 'pending' | 'verified' | 'rejected';
  verifiedBy: number | null;
  notes: string | null;
  maxRefills: number;
  refillsUsed: number;
  createdAt: string;
}

async function pickPrescriptionImage(): Promise<{ dataUrl: string } | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Permission needed', 'Allow photo library access to attach a prescription image.');
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.7,
    base64: true,
  });
  if (result.canceled || !result.assets?.[0]?.base64) return null;
  const asset = result.assets[0];
  const mime = asset.mimeType ?? 'image/jpeg';
  return { dataUrl: `data:${mime};base64,${asset.base64}` };
}

function AttachmentThumb({ url, size = 44 }: { url: string; size?: number }) {
  const colors = useColors();
  if (url.startsWith('data:image') || /\.(png|jpe?g|webp|gif)$/i.test(url)) {
    return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: 8 }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: 8, backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' }}>
      <Feather name="file-text" size={size * 0.45} color={colors.mutedForeground} />
    </View>
  );
}

export default function PrescriptionsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const topInset = insets.top + (Platform.OS === 'web' ? 67 : 0);
  const canReview = user?.role === 'admin' || user?.role === 'pharmacist';
  const canCreate = user?.role === 'admin' || user?.role === 'pharmacist' || user?.role === 'cashier';

  const [filter, setFilter] = useState<typeof FILTERS[number]>('all');
  const { data, isLoading, refetch } = useListPrescriptions({});
  const rows = (data ?? []) as unknown as PrescriptionRow[];

  const filtered = useMemo(
    () => rows.filter((p) => filter === 'all' || p.status === filter),
    [rows, filter],
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: getListPrescriptionsQueryKey() });

  const verify = useVerifyPrescription({
    mutation: { onSuccess: invalidate, onError: (e) => Alert.alert('Could not verify', getErrorMessage(e)) },
  });
  const reject = useRejectPrescription({
    mutation: { onSuccess: invalidate, onError: (e) => Alert.alert('Could not reject', getErrorMessage(e)) },
  });
  const attach = useApiMutation<PrescriptionRow, { id: number; attachmentUrl: string }>(
    (vars) => `/api/prescriptions/${vars.id}/attachment`,
    [['prescriptions']],
    'PATCH',
  );
  const create = useApiMutation<PrescriptionRow, { patientName?: string; doctorName?: string; notes?: string; maxRefills: number; attachmentUrl?: string }>(
    '/api/prescriptions',
    [['prescriptions']],
  );

  // Record Prescription form
  const [formOpen, setFormOpen] = useState(false);
  const [patientName, setPatientName] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [rxNotes, setRxNotes] = useState('');
  const [maxRefills, setMaxRefills] = useState('0');
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);

  // Reject dialog
  const [rejectTarget, setRejectTarget] = useState<PrescriptionRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Detail view
  const [detail, setDetail] = useState<PrescriptionRow | null>(null);

  const resetForm = () => { setPatientName(''); setDoctorName(''); setRxNotes(''); setMaxRefills('0'); setAttachmentUrl(null); };

  const pickImage = async (onDone: (dataUrl: string) => void) => {
    setAttaching(true);
    try {
      const picked = await pickPrescriptionImage();
      if (picked) onDone(picked.dataUrl);
    } catch (e) {
      Alert.alert('Could not attach image', getErrorMessage(e));
    } finally {
      setAttaching(false);
    }
  };

  const submitCreate = () => {
    create.mutate(
      {
        patientName: patientName.trim() || undefined,
        doctorName: doctorName.trim() || undefined,
        notes: rxNotes.trim() || undefined,
        maxRefills: Math.max(0, parseInt(maxRefills, 10) || 0),
        ...(attachmentUrl ? { attachmentUrl } : {}),
      },
      {
        onSuccess: () => { setFormOpen(false); resetForm(); },
        onError: (e) => Alert.alert("Couldn't save prescription", getErrorMessage(e)),
      },
    );
  };

  const statusColor = (st: string) => st === 'verified' ? colors.success : st === 'rejected' ? colors.destructive : colors.warning;

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.primary, paddingTop: topInset + 10, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    title: { color: '#fff', fontSize: 20, fontFamily: 'Inter_700Bold' },
    addBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
    filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
    row: { backgroundColor: colors.card, marginHorizontal: 12, marginVertical: 4, borderRadius: colors.radius, padding: 14, flexDirection: 'row' },
    name: { fontSize: 14, fontFamily: 'Inter_700Bold', color: colors.foreground },
    meta: { fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 2 },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, alignSelf: 'flex-start', marginTop: 8 },
    actionsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    actionBtn: { flex: 1, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: insets.bottom + 20, maxHeight: '90%' },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 14 },
    sheetTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.foreground, marginBottom: 4 },
    label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground, marginBottom: 4, marginTop: 12 },
    hint: { fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 4 },
    inp: { height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, paddingHorizontal: 12, color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 14 },
    submitBtn: { height: 50, borderRadius: colors.radius, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
    attachBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, marginTop: 4, gap: 10 },
    attachDash: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: 10, padding: 16, marginTop: 4, alignItems: 'center', gap: 6 },
    detailOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
    detailCard: { backgroundColor: colors.card, borderRadius: 20, padding: 20, maxHeight: '85%' },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <TouchableOpacity onPress={() => router.back()}>
            <Feather name="arrow-left" size={20} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
          <Text style={s.title}>Prescriptions</Text>
        </View>
        {canCreate && (
          <TouchableOpacity style={s.addBtn} onPress={() => setFormOpen(true)}>
            <Feather name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      <View style={s.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[s.filterChip, { backgroundColor: filter === f ? colors.primary : colors.card, borderColor: filter === f ? colors.primary : colors.border }]}
            onPress={() => setFilter(f)}
          >
            <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: filter === f ? '#fff' : colors.foreground, textTransform: 'capitalize' }}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingVertical: 4, paddingBottom: 40 }}
          refreshing={isLoading}
          onRefresh={refetch}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.row} onPress={() => setDetail(item)} activeOpacity={0.8}>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{item.patientName ?? 'Unknown patient'}</Text>
                {item.doctorName ? <Text style={s.meta}>Dr. {item.doctorName}</Text> : null}
                <Text style={s.meta}>RX #{item.id} · {new Date(item.createdAt).toLocaleString()}</Text>
                <View style={[s.badge, { backgroundColor: statusColor(item.status) + '20' }]}>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: statusColor(item.status), textTransform: 'capitalize' }}>{item.status}</Text>
                </View>
                {canReview && item.status === 'pending' && (
                  <View style={s.actionsRow}>
                    <TouchableOpacity
                      style={[s.actionBtn, { backgroundColor: colors.success + '18', opacity: item.attachmentUrl ? 1 : 0.5 }]}
                      disabled={verify.isPending || reject.isPending || !item.attachmentUrl}
                      onPress={(e) => { verify.mutate({ id: item.id, data: { notes: 'Verified by pharmacist' } }); }}
                    >
                      <Text style={{ color: colors.success, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Verify</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.actionBtn, { backgroundColor: colors.destructive + '18' }]}
                      disabled={verify.isPending || reject.isPending}
                      onPress={() => { setRejectTarget(item); setRejectReason(''); }}
                    >
                      <Text style={{ color: colors.destructive, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Reject</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {canReview && item.status === 'pending' && !item.attachmentUrl && (
                  <Text style={[s.hint, { color: colors.warning, marginTop: 8 }]}>⚠ Attach the prescription image before verifying</Text>
                )}
              </View>
              {item.attachmentUrl ? (
                <AttachmentThumb url={item.attachmentUrl} />
              ) : (
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              )}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60 }}>
              <Feather name="file-text" size={48} color={colors.border} />
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', marginTop: 12 }}>No prescriptions here</Text>
            </View>
          }
        />
      )}

      {/* Record Prescription */}
      <Modal visible={formOpen} transparent animationType="slide" onRequestClose={() => setFormOpen(false)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <KeyboardAwareScrollViewCompat keyboardShouldPersistTaps="handled">
              <Text style={s.sheetTitle}>Record Prescription</Text>
              <Text style={s.label}>Patient Name</Text>
              <TextInput style={s.inp} value={patientName} onChangeText={setPatientName} placeholder="Patient full name" placeholderTextColor={colors.mutedForeground} />
              <Text style={s.label}>Prescribing Doctor</Text>
              <TextInput style={s.inp} value={doctorName} onChangeText={setDoctorName} placeholder="Dr. Name" placeholderTextColor={colors.mutedForeground} />
              <Text style={s.label}>Prescription Notes</Text>
              <TextInput style={[s.inp, { height: 70, paddingTop: 10 }]} value={rxNotes} onChangeText={setRxNotes} multiline placeholder="Medicines, dosage, instructions…" placeholderTextColor={colors.mutedForeground} />
              <Text style={s.label}>Allowed Refills</Text>
              <TextInput style={s.inp} value={maxRefills} onChangeText={setMaxRefills} keyboardType="number-pad" placeholderTextColor={colors.mutedForeground} />
              <Text style={s.hint}>
                {(parseInt(maxRefills, 10) || 0) === 0 ? 'Dispense once only — no refills' : `Can be filled ${(parseInt(maxRefills, 10) || 0) + 1} times total (original + ${maxRefills} refill${maxRefills !== '1' ? 's' : ''})`}
              </Text>

              <Text style={s.label}>Prescription Image</Text>
              {attachmentUrl ? (
                <View style={s.attachBox}>
                  <AttachmentThumb url={attachmentUrl} size={48} />
                  <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground }}>Image attached</Text>
                  <TouchableOpacity onPress={() => setAttachmentUrl(null)}>
                    <Text style={{ color: colors.destructive, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={s.attachDash} onPress={() => pickImage(setAttachmentUrl)} disabled={attaching}>
                  {attaching ? <ActivityIndicator color={colors.primary} /> : (
                    <>
                      <Feather name="image" size={20} color={colors.mutedForeground} />
                      <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: colors.mutedForeground }}>Upload prescription image</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
              <Text style={s.hint}>Required for verification — a pharmacist must see the original before approving it.</Text>

              <TouchableOpacity style={s.submitBtn} disabled={create.isPending} onPress={submitCreate}>
                {create.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Save</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setFormOpen(false); resetForm(); }} style={{ alignItems: 'center', paddingVertical: 14 }}>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }}>Cancel</Text>
              </TouchableOpacity>
            </KeyboardAwareScrollViewCompat>
          </View>
        </View>
      </Modal>

      {/* Reject dialog */}
      <Modal visible={!!rejectTarget} transparent animationType="fade" onRequestClose={() => setRejectTarget(null)}>
        <View style={s.detailOverlay}>
          <View style={s.detailCard}>
            <Text style={s.sheetTitle}>Reject Prescription</Text>
            <Text style={s.label}>Reason for rejection *</Text>
            <TextInput style={[s.inp, { height: 70, paddingTop: 10 }]} value={rejectReason} onChangeText={setRejectReason} multiline placeholder="e.g. Illegible, expired, missing signature…" placeholderTextColor={colors.mutedForeground} />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={[s.submitBtn, { flex: 1, marginTop: 0, backgroundColor: colors.muted }]} onPress={() => setRejectTarget(null)}>
                <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.submitBtn, { flex: 1, marginTop: 0, backgroundColor: colors.destructive, opacity: rejectReason.trim() ? 1 : 0.5 }]}
                disabled={!rejectReason.trim() || reject.isPending}
                onPress={() => rejectTarget && reject.mutate({ id: rejectTarget.id, data: { notes: rejectReason.trim() } }, { onSuccess: () => { setRejectTarget(null); setRejectReason(''); } })}
              >
                {reject.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold' }}>Confirm Rejection</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Detail view */}
      <Modal visible={!!detail} transparent animationType="fade" onRequestClose={() => setDetail(null)}>
        <View style={s.detailOverlay}>
          <View style={s.detailCard}>
            {detail && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View>
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground }}>RX #{detail.id}</Text>
                    <Text style={s.sheetTitle}>{detail.patientName ?? 'Unknown patient'}</Text>
                  </View>
                  <View style={[s.badge, { marginTop: 0, backgroundColor: statusColor(detail.status) + '20' }]}>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: statusColor(detail.status), textTransform: 'capitalize' }}>{detail.status}</Text>
                  </View>
                </View>
                {detail.doctorName ? <Text style={[s.meta, { marginTop: 10 }]}>Dr. {detail.doctorName}</Text> : null}
                <Text style={s.meta}>Recorded {new Date(detail.createdAt).toLocaleString()}</Text>
                <Text style={[s.meta, { marginTop: 6 }]}>Refills: {detail.refillsUsed ?? 0} / {detail.maxRefills}</Text>
                {detail.notes ? (
                  <View style={{ backgroundColor: colors.muted, borderRadius: 10, padding: 10, marginTop: 10 }}>
                    <Text style={s.hint}>Notes:</Text>
                    <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.foreground, marginTop: 2 }}>{detail.notes}</Text>
                  </View>
                ) : null}
                {detail.attachmentUrl ? (
                  detail.attachmentUrl.startsWith('data:image') || /\.(png|jpe?g|webp|gif)$/i.test(detail.attachmentUrl) ? (
                    <Image source={{ uri: detail.attachmentUrl }} style={{ width: '100%', height: 220, borderRadius: 10, marginTop: 12 }} resizeMode="contain" />
                  ) : (
                    <View style={[s.attachBox, { marginTop: 12 }]}>
                      <Feather name="file-text" size={20} color={colors.mutedForeground} />
                      <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: colors.mutedForeground }}>Attached document</Text>
                    </View>
                  )
                ) : detail.status === 'pending' ? (
                  <TouchableOpacity
                    style={[s.attachDash, { marginTop: 12 }]}
                    disabled={attaching}
                    onPress={() => pickImage((dataUrl) => attach.mutate({ id: detail.id, attachmentUrl: dataUrl }, { onSuccess: (row) => setDetail(row) }))}
                  >
                    {attaching ? <ActivityIndicator color={colors.primary} /> : (
                      <>
                        <Feather name="paperclip" size={18} color={colors.warning} />
                        <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: colors.warning }}>Attach image (required to verify)</Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : null}

                {canReview && detail.status === 'pending' && (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                    <TouchableOpacity
                      style={[s.actionBtn, { backgroundColor: colors.success, opacity: detail.attachmentUrl ? 1 : 0.5 }]}
                      disabled={!detail.attachmentUrl || verify.isPending}
                      onPress={() => verify.mutate({ id: detail.id, data: { notes: 'Verified by pharmacist' } }, { onSuccess: () => setDetail(null) })}
                    >
                      <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Verify</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.actionBtn, { backgroundColor: colors.destructive }]}
                      onPress={() => { setRejectTarget(detail); setRejectReason(''); setDetail(null); }}
                    >
                      <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Reject</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <TouchableOpacity onPress={() => setDetail(null)} style={{ alignItems: 'center', paddingVertical: 14 }}>
                  <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }}>Close</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

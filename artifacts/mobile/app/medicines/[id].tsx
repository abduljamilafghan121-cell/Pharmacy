import { useColors } from '@/hooks/useColors';
import { formatCurrency, getErrorMessage } from '@/lib/format';
import { useMedicineBatches, useWriteOffBatch, type MedicineBatch } from '@/hooks/useMedicineBatches';
import { useAuth } from '@/contexts/AuthContext';
import { useDeleteMedicine, useGetMedicine, useUpdateMedicine, getListMedicinesQueryKey } from '@workspace/api-client-react';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  const colors = useColors();
  if (!value) return null;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: colors.mutedForeground }}>{label}</Text>
      <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.foreground, maxWidth: '55%', textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

function BatchRow({ batch, rank, colors, onWriteOff }: { batch: MedicineBatch; rank: number; colors: ReturnType<typeof useColors>; onWriteOff?: (batch: MedicineBatch) => void }) {
  const writtenOff = !!batch.writeOffAt;
  const days = batch.expiryDate ? Math.round((new Date(batch.expiryDate).getTime() - Date.now()) / 86400000) : null;
  const urgency = writtenOff ? colors.mutedForeground : days === null ? colors.mutedForeground : days <= 60 ? colors.destructive : days <= 150 ? colors.warning : colors.success;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View style={{
        width: 20, height: 20, borderRadius: 10, marginRight: 10,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: writtenOff ? colors.muted : rank === 1 ? colors.accent : colors.muted,
      }}>
        <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: writtenOff ? colors.mutedForeground : rank === 1 ? '#fff' : colors.mutedForeground }}>{rank}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: colors.foreground }}>{batch.batchNumber ?? `Batch #${batch.id}`}</Text>
        <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 1 }}>
          {batch.expiryDate ? `exp ${batch.expiryDate}` : 'no expiry set'} · {batch.quantity} units{batch.costPrice ? ` · ${formatCurrency(batch.costPrice)}/u` : ''}
        </Text>
      </View>
      {writtenOff ? (
        <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: colors.mutedForeground }}>WRITTEN OFF</Text>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {days !== null && <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: urgency }}>{days}d</Text>}
          {onWriteOff && (
            <TouchableOpacity onPress={() => onWriteOff(batch)} hitSlop={8}>
              <Feather name="x-circle" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

export default function MedicineDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: med, isLoading } = useGetMedicine(Number(id), {});
  const { data: batches, isLoading: batchesLoading } = useMedicineBatches(Number(id));
  const { user } = useAuth();
  const canWriteOff = user?.role === 'admin' || user?.role === 'pharmacist';
  const updateMed = useUpdateMedicine({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListMedicinesQueryKey() }); setEditing(false); } } });
  const deleteMed = useDeleteMedicine({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListMedicinesQueryKey() }); router.back(); } } });
  const writeOffBatch = useWriteOffBatch();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', price: '', quantity: '', manufacturer: '', description: '' });
  const [writeOffTarget, setWriteOffTarget] = useState<MedicineBatch | null>(null);
  const [writeOffReason, setWriteOffReason] = useState('');

  useEffect(() => {
    if (med) setForm({ name: med.name, price: med.price, quantity: String(med.quantity), manufacturer: med.manufacturer ?? '', description: med.description ?? '' });
  }, [med]);

  const stockColor = med ? (med.quantity <= 0 ? colors.destructive : med.quantity <= 10 ? '#EF4444' : med.quantity <= 30 ? '#F59E0B' : colors.success) : colors.muted;

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    heroCard: { backgroundColor: colors.primary, paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 0), paddingBottom: 28, paddingHorizontal: 20 },
    heroName: { color: '#fff', fontSize: 22, fontFamily: 'Inter_700Bold', marginTop: 16 },
    heroGeneric: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 4 },
    statsRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
    statChip: { flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: 12, alignItems: 'center' },
    statVal: { color: '#fff', fontSize: 18, fontFamily: 'Inter_700Bold' },
    statLbl: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontFamily: 'Inter_500Medium', marginTop: 2 },
    section: { backgroundColor: colors.card, marginHorizontal: 12, marginTop: 16, borderRadius: colors.radius, padding: 16 },
    sectionTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.foreground, marginBottom: 12 },
    label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground, marginBottom: 4, marginTop: 12 },
    inp: { height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, paddingHorizontal: 12, color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 14 },
    editBtn: { position: 'absolute', top: insets.top + (Platform.OS === 'web' ? 67 : 0) + 4, right: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    saveBtn: { margin: 12, height: 50, borderRadius: colors.radius, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    deleteBtn: { marginHorizontal: 12, marginBottom: 40, height: 48, borderRadius: colors.radius, borderWidth: 1.5, borderColor: colors.destructive, alignItems: 'center', justifyContent: 'center' },
  });

  if (isLoading || !med) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}><ActivityIndicator color={colors.primary} /></View>;

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={s.heroCard}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 4 }}>
          <Feather name="arrow-left" size={20} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>
        <Text style={s.heroName}>{med.name}</Text>
        {med.genericName ? <Text style={s.heroGeneric}>{med.genericName}</Text> : null}
        <View style={s.statsRow}>
          <View style={s.statChip}><Text style={s.statVal}>{med.quantity}</Text><Text style={s.statLbl}>In Stock</Text></View>
          <View style={s.statChip}><Text style={s.statVal}>{formatCurrency(med.price)}</Text><Text style={s.statLbl}>Unit Price</Text></View>
          <View style={[s.statChip, { backgroundColor: stockColor + '40' }]}><Text style={[s.statVal, { color: stockColor === colors.success ? '#fff' : stockColor }]}>{med.quantity <= 0 ? 'Out' : med.quantity <= 10 ? 'Critical' : 'OK'}</Text><Text style={s.statLbl}>Status</Text></View>
        </View>
      </View>
      <TouchableOpacity style={s.editBtn} onPress={() => setEditing(e => !e)}>
        <Feather name={editing ? 'x' : 'edit-2'} size={15} color="#fff" />
      </TouchableOpacity>

      {editing ? (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Edit Details</Text>
          <Text style={s.label}>Name</Text>
          <TextInput style={s.inp} value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} placeholderTextColor={colors.mutedForeground} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Text style={s.label}>Price ($)</Text><TextInput style={s.inp} value={form.price} onChangeText={v => setForm(f => ({ ...f, price: v }))} keyboardType="numeric" placeholderTextColor={colors.mutedForeground} /></View>
            <View style={{ flex: 1 }}><Text style={s.label}>Quantity</Text><TextInput style={s.inp} value={form.quantity} onChangeText={v => setForm(f => ({ ...f, quantity: v }))} keyboardType="numeric" placeholderTextColor={colors.mutedForeground} /></View>
          </View>
          <Text style={s.label}>Manufacturer</Text>
          <TextInput style={s.inp} value={form.manufacturer} onChangeText={v => setForm(f => ({ ...f, manufacturer: v }))} placeholderTextColor={colors.mutedForeground} />
          <Text style={s.label}>Description</Text>
          <TextInput style={[s.inp, { height: 70, paddingTop: 10 }]} value={form.description} onChangeText={v => setForm(f => ({ ...f, description: v }))} multiline placeholderTextColor={colors.mutedForeground} />
        </View>
      ) : (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Details</Text>
          <InfoRow label="Category" value={med.categoryName} />
          <InfoRow label="Manufacturer" value={med.manufacturer} />
          <InfoRow label="Prescription Required" value={med.prescriptionRequired ? 'Yes' : 'No'} />
          <InfoRow label="Description" value={med.description} />
        </View>
      )}

      {!editing && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Batches · sells oldest lot first (FEFO)</Text>
          {batchesLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />
          ) : !batches?.length ? (
            <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground }}>
              No batches received yet for this medicine. Batches are created when a purchase order is received.
            </Text>
          ) : (
            [...batches]
              .sort((a, b) => {
                if (!!a.writeOffAt !== !!b.writeOffAt) return a.writeOffAt ? 1 : -1;
                if (!a.expiryDate) return 1;
                if (!b.expiryDate) return -1;
                return a.expiryDate.localeCompare(b.expiryDate);
              })
              .map((b, i) => (
                <BatchRow
                  key={b.id}
                  batch={b}
                  rank={i + 1}
                  colors={colors}
                  onWriteOff={canWriteOff ? (batch) => { setWriteOffTarget(batch); setWriteOffReason(''); } : undefined}
                />
              ))
          )}
        </View>
      )}

      {editing && (
        <TouchableOpacity style={s.saveBtn} onPress={() => updateMed.mutate({ id: med.id, data: { name: form.name, price: form.price, quantity: parseInt(form.quantity) || 0, manufacturer: form.manufacturer || undefined, description: form.description || undefined } })} disabled={updateMed.isPending}>
          {updateMed.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Save Changes</Text>}
        </TouchableOpacity>
      )}

      <TouchableOpacity style={s.deleteBtn} onPress={() => Alert.alert('Delete Medicine', `Delete ${med.name}? This cannot be undone.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteMed.mutate({ id: med.id }) }])}>
        <Text style={{ color: colors.destructive, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>Delete Medicine</Text>
      </TouchableOpacity>

      <Modal visible={!!writeOffTarget} transparent animationType="slide" onRequestClose={() => setWriteOffTarget(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: insets.bottom + 20 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 14 }} />
            <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.foreground }}>Write off batch</Text>
            <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 4 }}>
              {writeOffTarget?.batchNumber ?? `Batch #${writeOffTarget?.id}`} · {writeOffTarget?.quantity} units will be removed from sellable stock.
            </Text>
            <Text style={s.label}>Reason *</Text>
            <TextInput
              style={[s.inp, { height: 70, paddingTop: 10 }]}
              value={writeOffReason}
              onChangeText={setWriteOffReason}
              multiline
              placeholder="e.g. Expired, damaged in storage, recalled…"
              placeholderTextColor={colors.mutedForeground}
            />
            <TouchableOpacity
              style={[s.saveBtn, { backgroundColor: colors.destructive, margin: 0, marginTop: 16 }]}
              disabled={writeOffBatch.isPending || !writeOffReason.trim()}
              onPress={() => {
                if (!writeOffTarget) return;
                writeOffBatch.mutate(
                  { medicineId: Number(id), batchId: writeOffTarget.id, reason: writeOffReason.trim() },
                  {
                    onSuccess: () => { setWriteOffTarget(null); qc.invalidateQueries({ queryKey: getListMedicinesQueryKey() }); },
                    onError: (e) => Alert.alert('Could not write off batch', getErrorMessage(e)),
                  },
                );
              }}
            >
              {writeOffBatch.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Write Off Batch</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setWriteOffTarget(null)} style={{ alignItems: 'center', paddingVertical: 14 }}>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

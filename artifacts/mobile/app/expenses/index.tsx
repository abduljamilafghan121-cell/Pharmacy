import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, getErrorMessage } from '@/lib/format';
import {
  useListExpenses,
  useCreateExpense,
  useVoidExpense,
  getListExpensesQueryKey,
  type ExpenseCategory,
  type ExpenseMethod,
  type ExpenseInputCategory,
  type ExpenseInputMethod,
} from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  rent: 'Rent',
  utilities: 'Utilities',
  salaries: 'Salaries',
  supplies: 'Supplies',
  maintenance: 'Maintenance',
  marketing: 'Marketing',
  transport: 'Transport',
  insurance: 'Insurance',
  miscellaneous: 'Miscellaneous',
};

const CATEGORY_ORDER: ExpenseCategory[] = Object.keys(CATEGORY_LABELS) as ExpenseCategory[];

const METHOD_LABELS: Record<ExpenseMethod, string> = {
  cash: 'Cash',
  bank: 'Bank',
  cheque: 'Cheque',
  transfer: 'Transfer',
  credit: 'Credit',
};

type RangePreset = 'all' | 'today' | '7d' | 'month' | 'custom';

const RANGE_LABELS: Record<Exclude<RangePreset, 'custom'>, string> = {
  all: 'All time',
  today: 'Today',
  '7d': '7 days',
  month: 'This month',
};

const localISO = (d: Date): string => {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

function rangeForPreset(preset: RangePreset, customFrom: string, customTo: string): { from?: string; to?: string } {
  const now = new Date();
  if (preset === 'today') return { from: localISO(now), to: localISO(now) };
  if (preset === '7d') {
    const from = new Date(now);
    from.setDate(now.getDate() - 6);
    return { from: localISO(from), to: localISO(now) };
  }
  if (preset === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: localISO(from), to: localISO(now) };
  }
  if (preset === 'custom') {
    if (!customFrom || !customTo) return {};
    return { from: customFrom, to: customTo };
  }
  return {};
}

export default function ExpensesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();

  const [rangePreset, setRangePreset] = useState<RangePreset>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const range = rangeForPreset(rangePreset, customFrom, customTo);
  const rangeActive = !!range.from && !!range.to;

  const { data, isLoading, refetch } = useListExpenses(rangeActive ? { from: range.from, to: range.to } : undefined);
  const entries = data?.entries ?? [];
  const summary = data?.summary;

  const [addOpen, setAddOpen] = useState(false);
  const [catFilter, setCatFilter] = useState<'all' | ExpenseCategory>('all');
  const [voidTarget, setVoidTarget] = useState<{ id: number; amount: string; category: string } | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);
  const canVoid = user?.role === 'admin';

  const voidExpense = useVoidExpense({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListExpensesQueryKey() });
        setVoidTarget(null);
        setVoidReason('');
      },
    },
  });

  const confirmVoid = async () => {
    if (!voidTarget) return;
    setVoiding(true);
    try {
      await voidExpense.mutateAsync({ id: voidTarget.id, data: { reason: voidReason.trim() } });
      Alert.alert('Expense voided', `Expense of ${formatCurrency(voidTarget.amount)} was voided and excluded from totals.`);
    } catch (e) {
      Alert.alert('Could not void expense', getErrorMessage(e));
    } finally {
      setVoiding(false);
    }
  };

  const filteredEntries = entries.filter((e) => (catFilter === 'all' ? true : e.category === catFilter));

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.primary, paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 0) + 8, paddingBottom: 22, paddingHorizontal: 20 },
    headerRow: { flexDirection: 'row', alignItems: 'center' },
    title: { color: '#fff', fontSize: 20, fontFamily: 'Inter_700Bold', marginLeft: 12, marginTop: 10 },
    sub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 4, marginLeft: 12 },
    statsRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
    statChip: { flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: 10, alignItems: 'center' },
    statVal: { color: '#fff', fontSize: 15, fontFamily: 'Inter_700Bold' },
    statLbl: { color: 'rgba(255,255,255,0.65)', fontSize: 9, fontFamily: 'Inter_500Medium', marginTop: 2 },
    section: { backgroundColor: colors.card, marginHorizontal: 12, marginTop: 14, borderRadius: colors.radius, padding: 14 },
    sectionTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.foreground, marginBottom: 10 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
    chipText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
    entryRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start' },
    badgeText: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.3 },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: insets.bottom + 20, maxHeight: '88%' },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 20 },
    label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground, marginBottom: 4, marginTop: 10 },
    inp: { height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, paddingHorizontal: 12, color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 14 },
    payBtn: { height: 50, borderRadius: colors.radius, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
    methodRow: { flexDirection: 'row', gap: 8 },
    methodBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, alignItems: 'center' },
    methodText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', textTransform: 'capitalize' },
    empty: { alignItems: 'center', marginTop: 40 },
  });

  const AddExpense = () => {
    const [category, setCategory] = useState<ExpenseInputCategory>('miscellaneous');
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [method, setMethod] = useState<ExpenseInputMethod>('cash');
    const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [note, setNote] = useState('');
    const createExpense = useCreateExpense({
      mutation: {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListExpensesQueryKey() });
          setAddOpen(false);
        },
      },
    });

    const canSubmit = description.trim().length > 0 && Number(amount) > 0;
    const submit = () => {
      if (!canSubmit) {
        Alert.alert('Incomplete', 'Add a description and a valid amount.');
        return;
      }
      createExpense.mutate({
        data: {
          category,
          description: description.trim(),
          amount: amount.trim(),
          method,
          expenseDate: date || null,
          note: note.trim() || null,
        },
      });
    };

    return (
      <Modal visible transparent animationType="slide" onRequestClose={() => setAddOpen(false)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <KeyboardAwareScrollViewCompat keyboardShouldPersistTaps="handled">
              <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.foreground, marginBottom: 4 }}>Record Expense</Text>
              <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginBottom: 8 }}>
                Rent, utilities, salaries and other business costs.
              </Text>

              <Text style={s.label}>Category *</Text>
              <View style={s.chipRow}>
                {CATEGORY_ORDER.map((c) => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setCategory(c)}
                    style={[
                      s.chip,
                      { backgroundColor: category === c ? colors.primary : colors.secondary, borderColor: category === c ? colors.primary : colors.border },
                    ]}
                  >
                    <Text style={[s.chipText, { color: category === c ? colors.primaryForeground ?? '#fff' : colors.mutedForeground }]}>
                      {CATEGORY_LABELS[c]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.label}>Description *</Text>
              <TextInput style={s.inp} value={description} onChangeText={setDescription} placeholder="e.g. Monthly shop rent" placeholderTextColor={colors.mutedForeground} />

              <Text style={s.label}>Amount *</Text>
              <TextInput style={s.inp} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.mutedForeground} />

              <Text style={s.label}>Payment method</Text>
              <View style={s.methodRow}>
                {(Object.keys(METHOD_LABELS) as ExpenseMethod[]).map((m) => (
                  <TouchableOpacity
                    key={m}
                    onPress={() => setMethod(m)}
                    style={[s.methodBtn, { borderColor: method === m ? colors.primary : colors.border, backgroundColor: method === m ? colors.secondary : 'transparent' }]}
                  >
                    <Text style={[s.methodText, { color: method === m ? colors.primary : colors.mutedForeground }]}>{METHOD_LABELS[m]}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.label}>Expense date (YYYY-MM-DD)</Text>
              <TextInput style={s.inp} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.mutedForeground} />

              <Text style={s.label}>Note (optional)</Text>
              <TextInput style={s.inp} value={note} onChangeText={setNote} placeholder="Receipt no., reference…" placeholderTextColor={colors.mutedForeground} />

              <TouchableOpacity style={s.payBtn} onPress={submit} disabled={createExpense.isPending}>
                {createExpense.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Record Expense</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setAddOpen(false)} style={{ alignItems: 'center', paddingVertical: 12 }}>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 13 }}>Cancel</Text>
              </TouchableOpacity>
            </KeyboardAwareScrollViewCompat>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={s.header}>
          <TouchableOpacity style={s.headerRow} onPress={() => router.back()}>
            <Feather name="arrow-left" size={20} color="rgba(255,255,255,0.8)" />
            <Text style={s.title}>Expenses</Text>
          </TouchableOpacity>
          {summary && (
            <>
              <Text style={s.sub}>Business spending — {formatCurrency(summary.thisMonth)} this month</Text>
              <View style={s.statsRow}>
                <View style={s.statChip}><Text style={s.statVal}>{formatCurrency(summary.total)}</Text><Text style={s.statLbl}>{rangeActive ? 'IN RANGE' : 'ALL TIME'}</Text></View>
                <View style={s.statChip}><Text style={s.statVal}>{formatCurrency(summary.thisMonth)}</Text><Text style={s.statLbl}>THIS MONTH</Text></View>
                <View style={s.statChip}><Text style={s.statVal}>{entries.filter((e) => !e.voided).length}</Text><Text style={s.statLbl}>ENTRIES</Text></View>
              </View>
            </>
          )}
        </View>

        <View style={{ marginHorizontal: 12, marginTop: 14, height: 48, borderRadius: colors.radius, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <TouchableOpacity style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }} onPress={() => setAddOpen(true)}>
            <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>+ Record Expense</Text>
          </TouchableOpacity>
        </View>

        {(summary || entries.length > 0) && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Date range</Text>
            <View style={s.chipRow}>
              {(Object.keys(RANGE_LABELS) as (keyof typeof RANGE_LABELS)[]).map((k) => (
                <TouchableOpacity
                  key={k}
                  onPress={() => setRangePreset(k)}
                  style={[s.chip, { backgroundColor: rangePreset === k ? colors.primary : colors.secondary, borderColor: rangePreset === k ? colors.primary : colors.border }]}
                >
                  <Text style={[s.chipText, { color: rangePreset === k ? (colors.primaryForeground ?? '#fff') : colors.mutedForeground }]}>
                    {RANGE_LABELS[k]}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={() => setRangePreset('custom')}
                style={[s.chip, { backgroundColor: rangePreset === 'custom' ? colors.primary : colors.secondary, borderColor: rangePreset === 'custom' ? colors.primary : colors.border }]}
              >
                <Text style={[s.chipText, { color: rangePreset === 'custom' ? (colors.primaryForeground ?? '#fff') : colors.mutedForeground }]}>Custom</Text>
              </TouchableOpacity>
            </View>
            {rangePreset === 'custom' && (
              <View>
                <Text style={s.label}>From (YYYY-MM-DD)</Text>
                <TextInput style={s.inp} value={customFrom} onChangeText={setCustomFrom} placeholder="2026-09-01" placeholderTextColor={colors.mutedForeground} />
                <Text style={s.label}>To (YYYY-MM-DD)</Text>
                <TextInput style={s.inp} value={customTo} onChangeText={setCustomTo} placeholder="2026-09-07" placeholderTextColor={colors.mutedForeground} />
              </View>
            )}
          </View>
        )}

        {(summary || entries.length > 0) && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Spending by category</Text>
            <View style={s.chipRow}>
              <TouchableOpacity
                onPress={() => setCatFilter('all')}
                style={[s.chip, { backgroundColor: catFilter === 'all' ? colors.primary : colors.secondary, borderColor: catFilter === 'all' ? colors.primary : colors.border }]}
              >
                <Text style={[s.chipText, { color: catFilter === 'all' ? (colors.primaryForeground ?? '#fff') : colors.mutedForeground }]}>All</Text>
              </TouchableOpacity>
              {CATEGORY_ORDER.map((c) => {
                const value = parseFloat(summary?.byCategory[c] ?? '0');
                if (value <= 0) return null;
                return (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setCatFilter(catFilter === c ? 'all' : c)}
                    style={[s.chip, { backgroundColor: catFilter === c ? colors.primary : colors.secondary, borderColor: catFilter === c ? colors.primary : colors.border }]}
                  >
                    <Text style={[s.chipText, { color: catFilter === c ? (colors.primaryForeground ?? '#fff') : colors.mutedForeground }]}>
                      {CATEGORY_LABELS[c]} · {formatCurrency(summary!.byCategory[c])}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        <View style={s.section}>
          <Text style={s.sectionTitle}>
            {rangeActive
              ? `Expenses · ${range.from} → ${range.to}`
              : catFilter === 'all'
                ? 'All expenses'
                : CATEGORY_LABELS[catFilter]}
          </Text>
          {isLoading ? (
            <ActivityIndicator style={{ marginVertical: 24 }} color={colors.primary} />
          ) : filteredEntries.length === 0 ? (
            <View style={s.empty}>
              <Feather name="credit-card" size={48} color={colors.border} />
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', marginTop: 12 }}>
                {entries.length === 0
                  ? rangeActive
                    ? 'No expenses in this date range'
                    : 'No expenses recorded yet'
                  : 'No expenses in this category'}
              </Text>
            </View>
          ) : (
            filteredEntries.map((e, i) => (
              <View key={e.id} style={[s.entryRow, i === filteredEntries.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <View style={[s.badge, { backgroundColor: e.voided ? colors.border : colors.secondary, alignSelf: 'flex-start', marginBottom: 4 }]}>
                      <Text style={[s.badgeText, { color: e.voided ? colors.mutedForeground : colors.primary, textDecorationLine: e.voided ? 'line-through' : 'none' }]}>
                        {CATEGORY_LABELS[e.category]?.toUpperCase() ?? e.category}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: e.voided ? colors.mutedForeground : colors.foreground, textDecorationLine: e.voided ? 'line-through' : 'none' }}>
                      {e.description}
                    </Text>
                    <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 2 }}>
                      {new Date(e.expenseDate).toLocaleDateString()} · {METHOD_LABELS[e.method] ?? e.method}
                      {e.recordedByName ? ` · ${e.recordedByName}` : ''}
                    </Text>
                    {e.voided && (
                      <Text style={{ fontSize: 10, fontFamily: 'Inter_500Medium', color: colors.destructive, marginTop: 2 }}>
                        Voided{e.voidReason ? ` — ${e.voidReason}` : ''}
                      </Text>
                    )}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: e.voided ? colors.mutedForeground : colors.destructive, textDecorationLine: e.voided ? 'line-through' : 'none' }}>
                      {formatCurrency(e.amount)}
                    </Text>
                    {canVoid && !e.voided && (
                      <TouchableOpacity
                        onPress={() => { setVoidTarget({ id: e.id, amount: e.amount, category: CATEGORY_LABELS[e.category] }); setVoidReason(''); }}
                        style={{ marginTop: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: colors.destructive }}
                      >
                        <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: colors.destructive }}>Void</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <TouchableOpacity
        activeOpacity={1}
        onPress={() => setAddOpen(true)}
        style={{ position: 'absolute', right: 16, bottom: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }}
      >
        <Feather name="plus" size={26} color="#fff" />
      </TouchableOpacity>

      {addOpen && <AddExpense />}

      <Modal visible={!!voidTarget} transparent animationType="slide" onRequestClose={() => setVoidTarget(null)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <KeyboardAwareScrollViewCompat keyboardShouldPersistTaps="handled">
              <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.foreground, marginBottom: 4 }}>Void Expense</Text>
              <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginBottom: 12 }}>
                You're about to void a {voidTarget?.category} expense of {formatCurrency(voidTarget?.amount ?? '0')}. It will be excluded from the totals.
              </Text>
              <Text style={s.label}>Void reason *</Text>
              <TextInput style={s.inp} value={voidReason} onChangeText={setVoidReason} placeholder="Why is this expense being voided?" placeholderTextColor={colors.mutedForeground} />
              <TouchableOpacity style={[s.payBtn, { backgroundColor: colors.destructive }]} onPress={confirmVoid} disabled={voiding || voidReason.trim().length === 0}>
                {voiding ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Void Expense</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setVoidTarget(null)} style={{ alignItems: 'center', paddingVertical: 12 }}>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 13 }}>Cancel</Text>
              </TouchableOpacity>
            </KeyboardAwareScrollViewCompat>
          </View>
        </View>
      </Modal>
    </View>
  );
}
import { useColors } from '@/hooks/useColors';
import { getErrorMessage } from '@/lib/format';
import { customFetch } from '@workspace/api-client-react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ForgotPasswordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sentMessage, setSentMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const send = async () => {
    if (!email.trim()) {
      setError('Enter your account email address first.');
      return;
    }
    setSending(true);
    setError('');
    try {
      const res = await customFetch<{ message: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      });
      setDone(true);
      setSentMessage(res?.message ?? 'A password reset link has been sent. It expires in 1 hour.');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.primary },
    top: {
      flex: 0.42,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 0),
      paddingHorizontal: 24,
    },
    backBtn: {
      position: 'absolute',
      top: insets.top + (Platform.OS === 'web' ? 67 : 0) + 8,
      left: 16,
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: 'rgba(255,255,255,0.15)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconWrap: {
      width: 72, height: 72,
      borderRadius: 22,
      backgroundColor: 'rgba(255,255,255,0.2)',
      alignItems: 'center', justifyContent: 'center',
      marginBottom: 14,
    },
    appName: { color: '#FFFFFF', fontSize: 24, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
    tagline: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 4 },
    card: {
      flex: 0.58,
      backgroundColor: colors.card,
      borderTopLeftRadius: 32,
      borderTopRightRadius: 32,
      paddingHorizontal: 28,
      paddingTop: 32,
      paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0),
    },
    heading: { fontSize: 22, fontFamily: 'Inter_700Bold', color: colors.foreground, marginBottom: 6 },
    sub: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginBottom: 28 },
    label: { color: colors.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold', marginBottom: 8 },
    inputWrap: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.input,
      borderRadius: colors.radius,
      borderWidth: 1, borderColor: colors.border,
      paddingHorizontal: 14, marginBottom: 16,
    },
    input: {
      flex: 1, height: 48,
      color: colors.foreground,
      fontFamily: 'Inter_400Regular', fontSize: 15,
    },
    error: {
      color: colors.destructive, fontSize: 13,
      fontFamily: 'Inter_400Regular',
      marginBottom: 12, textAlign: 'center',
    },
    btn: {
      height: 52, borderRadius: colors.radius,
      backgroundColor: colors.primary,
      alignItems: 'center', justifyContent: 'center',
      marginTop: 4,
    },
    btnText: { color: colors.primaryForeground, fontSize: 16, fontFamily: 'Inter_600SemiBold' },
    doneWrap: { alignItems: 'center', paddingVertical: 8 },
    doneIcon: {
      width: 64, height: 64, borderRadius: 32,
      backgroundColor: '#ECFDF5',
      alignItems: 'center', justifyContent: 'center',
      marginBottom: 16,
    },
    doneTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', color: colors.foreground, marginBottom: 8 },
    doneText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, textAlign: 'center', lineHeight: 19 },
    linkBack: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      marginTop: 22, paddingVertical: 10,
    },
    linkBackText: { color: colors.primary, fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  });

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.top}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={styles.iconWrap}>
          <Image source={require('../assets/images/icon.png')} style={{ width: 46, height: 46, borderRadius: 10 }} />
        </View>
        <Text style={styles.appName}>PharmaCore</Text>
        <Text style={styles.tagline}>Smart Pharmacy. Better Care.</Text>
      </View>

      <ScrollView style={styles.card} keyboardShouldPersistTaps="handled">
        {done ? (
          <View style={styles.doneWrap}>
            <View style={styles.doneIcon}>
              <Ionicons name="checkmark" size={32} color="#10B981" />
            </View>
            <Text style={styles.doneTitle}>Check your email</Text>
            <Text style={styles.doneText}>
              {sentMessage}
              {'\n'}
              {`A reset link was sent to ${email.trim()}. Open the email and paste the link or token into the reset screen.`}
            </Text>
            <Pressable style={({ pressed }) => [styles.btn, { width: '100%', marginTop: 24, opacity: pressed ? 0.85 : 1 }]} onPress={() => router.replace('/login' as any)}>
              <Text style={styles.btnText}>Back to login</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={styles.heading}>Forgot password</Text>
            <Text style={styles.sub}>Enter your account email and we'll send you a reset link. It expires in 1 hour.</Text>

            <Text style={styles.label}>Email</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="mail-outline" size={18} color={colors.mutedForeground} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
              />
            </View>

            {!!error && <Text style={styles.error}>{error}</Text>}

            <Pressable
              style={({ pressed }) => [styles.btn, { opacity: pressed ? 0.85 : 1 }]}
              onPress={send}
              disabled={sending}
            >
              {sending
                ? <ActivityIndicator color={colors.primaryForeground} />
                : <Text style={styles.btnText}>Send reset link</Text>}
            </Pressable>

            <TouchableOpacity style={styles.linkBack} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={15} color={colors.primary} />
              <Text style={styles.linkBackText}>Back to login</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
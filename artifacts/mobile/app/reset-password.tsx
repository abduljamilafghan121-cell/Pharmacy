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

/** Accepts either the raw token ("123.abc…") or a full reset link
 * (e.g. "https://app/reset-password?token=123.abc…") pasted from the email. */
function extractToken(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.includes('token=')) {
    const m = trimmed.match(/[?&]token=([^&]+)/);
    if (m) return decodeURIComponent(m[1]);
  }
  return trimmed;
}

export default function ResetPasswordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [tokenInput, setTokenInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const reset = async () => {
    const token = extractToken(tokenInput);
    if (!token) {
      setError('Paste the reset link or token from the email.');
      return;
    }
    if (!newPassword) {
      setError('Enter a new password.');
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setResetting(true);
    setError('');
    try {
      await customFetch('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
      });
      setDone(true);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setResetting(false);
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
    sub: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginBottom: 24, lineHeight: 19 },
    label: { color: colors.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold', marginBottom: 8 },
    inputWrap: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.input,
      borderRadius: colors.radius,
      borderWidth: 1, borderColor: colors.border,
      paddingHorizontal: 14, marginBottom: 14,
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
      marginTop: 20, paddingVertical: 10,
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
            <Text style={styles.doneTitle}>Password reset</Text>
            <Text style={styles.doneText}>You can now log in with your new password.</Text>
            <Pressable
              style={({ pressed }) => [styles.btn, { width: '100%', marginTop: 24, opacity: pressed ? 0.85 : 1 }]}
              onPress={() => router.replace('/login' as any)}
            >
              <Text style={styles.btnText}>Go to login</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={styles.heading}>Reset password</Text>
            <Text style={styles.sub}>Open the reset email, then paste the reset link or token below and choose a new password.</Text>

            <Text style={styles.label}>Reset link or token</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="key-outline" size={18} color={colors.mutedForeground} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.input}
                value={tokenInput}
                onChangeText={setTokenInput}
                placeholder="Paste the link or token from the email"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <Text style={styles.label}>New password</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.mutedForeground} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.input}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Min. 6 characters"
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry={!showPw}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowPw(v => !v)} hitSlop={8}>
                <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Confirm new password</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.mutedForeground} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Repeat your password"
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry={!showPw}
                autoCapitalize="none"
              />
            </View>

            {!!error && <Text style={styles.error}>{error}</Text>}

            <Pressable
              style={({ pressed }) => [styles.btn, { opacity: pressed ? 0.85 : 1 }]}
              onPress={reset}
              disabled={resetting}
            >
              {resetting
                ? <ActivityIndicator color={colors.primaryForeground} />
                : <Text style={styles.btnText}>Reset password</Text>}
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
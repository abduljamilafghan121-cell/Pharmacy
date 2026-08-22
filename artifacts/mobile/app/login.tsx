import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';
import { useLoginUser } from '@workspace/api-client-react';
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

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');

  const loginMutation = useLoginUser({
    mutation: {
      onSuccess: async (data) => {
        await login(data.token, data.user);
        router.replace('/(tabs)/' as any);
      },
      onError: (err: any) => {
        setError(err?.response?.data?.error ?? err?.message ?? 'Login failed');
      },
    },
  });

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.primary },
    top: {
      flex: 0.45,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 0),
    },
    iconWrap: {
      width: 80, height: 80,
      borderRadius: 24,
      backgroundColor: 'rgba(255,255,255,0.2)',
      alignItems: 'center', justifyContent: 'center',
      marginBottom: 16,
    },
    appName: { color: '#FFFFFF', fontSize: 26, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
    tagline: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 4 },
    card: {
      flex: 0.55,
      backgroundColor: colors.card,
      borderTopLeftRadius: 32,
      borderTopRightRadius: 32,
      paddingHorizontal: 28,
      paddingTop: 32,
      paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0),
    },
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
    heading: { fontSize: 22, fontFamily: 'Inter_700Bold', color: colors.foreground, marginBottom: 6 },
    sub: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginBottom: 28 },
  });

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.top}>
        <View style={styles.iconWrap}>
          <Image source={require('../assets/images/icon.png')} style={{ width: 52, height: 52, borderRadius: 12 }} />
        </View>
        <Text style={styles.appName}>PharmaCore</Text>
        <Text style={styles.tagline}>Smart Pharmacy. Better Care.</Text>
      </View>

      <ScrollView style={styles.card} keyboardShouldPersistTaps="handled" scrollEnabled={false}>
        <Text style={styles.heading}>Welcome back</Text>
        <Text style={styles.sub}>Sign in to your account to continue</Text>

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

        <Text style={styles.label}>Password</Text>
        <View style={styles.inputWrap}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.mutedForeground} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry={!showPw}
            autoCapitalize="none"
          />
          <TouchableOpacity onPress={() => setShowPw(v => !v)} hitSlop={8}>
            <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {!!error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={({ pressed }) => [styles.btn, { opacity: pressed ? 0.85 : 1 }]}
          onPress={() => {
            setError('');
            loginMutation.mutate({ data: { email: email.trim(), password } });
          }}
          disabled={loginMutation.isPending}
        >
          {loginMutation.isPending
            ? <ActivityIndicator color={colors.primaryForeground} />
            : <Text style={styles.btnText}>Sign In</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

import { setBaseUrl } from '@workspace/api-client-react';
import Constants from 'expo-constants';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { usePharmacySettings } from '@/hooks/usePharmacySettings';
import { setCurrencyDisplay } from '@/lib/format';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Redirect, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

SplashScreen.preventAutoHideAsync();

// Where the app points its API calls, resolved in order:
// 1. EXPO_PUBLIC_DOMAIN — set automatically by `pnpm dev` on Replit, so the
//    in-editor dev workflow keeps working unchanged.
// 2. expo.extra.apiUrl in app.json — set this to your real deployed API
//    domain before running `eas build`. This is the only thing you need to
//    edit for a production build.
const replitDevDomain = process.env.EXPO_PUBLIC_DOMAIN;
const configuredApiUrl = Constants.expoConfig?.extra?.apiUrl as string | undefined;

if (replitDevDomain) {
  setBaseUrl(`https://${replitDevDomain}`);
} else if (configuredApiUrl && !configuredApiUrl.includes('REPLACE-WITH-YOUR-API-DOMAIN')) {
  setBaseUrl(configuredApiUrl);
} else {
  console.warn(
    '[PharmaCore] No API URL configured. Set "extra.apiUrl" in app.json to your deployed API domain before building.',
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

function AuthGate() {
  const { token, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!token) {
    return <Redirect href="/login" />;
  }

  return null;
}

// Pharmacy settings are public (needed pre-login), so this can run
// unconditionally — it keeps formatCurrency() in sync with whatever
// currency label is configured in Settings, everywhere in the app.
function CurrencySync() {
  const { data } = usePharmacySettings();
  useEffect(() => {
    if (data) setCurrencyDisplay(data.currencySymbol, data.currencyPosition);
  }, [data?.currencySymbol, data?.currencyPosition]);
  return null;
}

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="medicines/[id]" options={{ title: 'Medicine Detail' }} />
      <Stack.Screen name="patients/[id]" options={{ title: 'Patient' }} />
      <Stack.Screen name="orders/[id]" options={{ title: 'Order Detail' }} />
      <Stack.Screen name="purchase-orders/index" options={{ title: 'Purchase Orders' }} />
      <Stack.Screen name="purchase-orders/[id]" options={{ title: 'Purchase Order' }} />
      <Stack.Screen name="suppliers/index" options={{ title: 'Suppliers' }} />
      <Stack.Screen name="suppliers/[id]" options={{ title: 'Supplier Ledger' }} />
      <Stack.Screen name="reports/index" options={{ title: 'Reports' }} />
      <Stack.Screen name="users/index" options={{ title: 'Staff Accounts' }} />
      <Stack.Screen name="stocktakes/index" options={{ title: 'Stocktakes' }} />
      <Stack.Screen name="stocktakes/[id]" options={{ title: 'Stocktake' }} />
      <Stack.Screen name="supplier-returns/index" options={{ title: 'Supplier Returns' }} />
      <Stack.Screen name="cash-register/index" options={{ title: 'Cash Register' }} />
      <Stack.Screen name="insurance-claims/index" options={{ title: 'Insurance Claims' }} />
      <Stack.Screen name="pre-authorizations/index" options={{ title: 'Pre-Authorizations' }} />
      <Stack.Screen name="drug-interactions/index" options={{ title: 'Drug Interactions' }} />
      <Stack.Screen name="controlled-substances/index" options={{ title: 'Controlled Substances' }} />
      <Stack.Screen name="audit-log/index" options={{ title: 'Audit Log' }} />
      <Stack.Screen name="prescriptions/index" options={{ title: 'Prescriptions' }} />
      <Stack.Screen name="settings/index" options={{ title: 'Settings' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <AuthProvider>
                <CurrencySync />
                <AuthGate />
                <RootLayoutNav />
              </AuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

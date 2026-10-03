import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { ApiKeyModal } from '@/components/api-key-modal';
import { LoginScreen } from '@/components/login-screen';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { SessionProvider, useSession } from '@/state/session';

SplashScreen.preventAutoHideAsync();

function Gate() {
  const { status, error, needsProvider, refresh } = useSession();

  useEffect(() => {
    if (status === 'loading' || status === 'anon' || status === 'ready') {
      void SplashScreen.hideAsync();
    }
  }, [status]);

  if (status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.center}>
        <ThemedText type="subtitle">Sem conexão com o servidor</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.message}>
          {error}
        </ThemedText>
        <Button label="Tentar de novo" onPress={() => void refresh()} />
      </View>
    );
  }

  if (status === 'anon') return <LoginScreen />;

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      {/* primeira regra do app: sem provider de IA não existe chat */}
      {needsProvider && <ApiKeyModal blocking />}
    </>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <BottomSheetModalProvider>
            <AnimatedSplashOverlay />
            <SessionProvider>
              <Gate />
            </SessionProvider>
          </BottomSheetModalProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  message: {
    textAlign: 'center',
    fontSize: 13,
  },
});

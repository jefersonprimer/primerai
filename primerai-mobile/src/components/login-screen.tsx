import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { GoogleIcon } from '@/components/google-icon';
import { Button } from '@/components/ui/button';
import { ApiError, api } from '@/lib/api';
import { useSession } from '@/state/session';

type Mode = 'login' | 'register';

export function LoginScreen() {
  const { login, loginWithSession, register } = useSession();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signInWithGoogle() {
    setError(null); setBusy(true);
    try {
      const redirectUri = Linking.createURL('auth/callback');
      const webUrl = process.env.EXPO_PUBLIC_WEB_URL ?? 'http://192.168.5.22:3000';
      const authUrl = `${webUrl.replace(/\/+$/, '')}/api/auth/google/start?return_uri=${encodeURIComponent(redirectUri)}`;
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
      if (result.type !== 'success') return;
      const code = new URLSearchParams(new URL(result.url).hash.slice(1)).get('code');
      if (!code) throw new Error('O login Google não retornou um código válido.');
      await loginWithSession(await api.exchangeNativeCode(code));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar com Google.');
    } finally { setBusy(false); }
  }

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') await login(email.trim(), password);
      else await register(email.trim(), password, name.trim() || undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'não foi possível conectar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <ThemedText type="title">PrimerAI</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.subtitle}>
          Entre com a mesma conta do seu PC para o agente reconhecer seus dispositivos.
        </ThemedText>

        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void signInWithGoogle()} style={({ pressed }) => [styles.googleButton, pressed && styles.googleButtonPressed, busy && styles.disabled]}>
          <GoogleIcon />
          <ThemedText style={styles.googleLabel}>{busy ? 'Aguarde…' : 'Continuar com Google'}</ThemedText>
        </Pressable>
        <View style={styles.separator}><View style={styles.separatorLine} /><ThemedText themeColor="textSecondary" type="small">ou com e-mail</ThemedText><View style={styles.separatorLine} /></View>

        <View style={styles.row}>
          {mode === 'register' && (
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Seu nome (opcional)"
              placeholderTextColor="#8b94a5"
              autoCapitalize="words"
              autoComplete="name"
              maxLength={120}
              style={styles.input}
            />
          )}
        </View>

        <View style={styles.row}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="seu@email.com"
            placeholderTextColor="#8b94a5"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            style={styles.input}
          />
        </View>

        <View style={styles.row}>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="senha"
            placeholderTextColor="#8b94a5"
            secureTextEntry
            autoCapitalize="none"
            onSubmitEditing={submit}
            style={styles.input}
          />
        </View>

        {error && <ThemedText style={styles.error}>{error}</ThemedText>}

        <Button onPress={submit} disabled={busy} label={busy ? 'Entrando…' : 'Continuar'} />

        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => {
            setError(null);
            setMode((m) => (m === 'login' ? 'register' : 'login'));
          }}
          style={styles.switch}>
          <ThemedText themeColor="textSecondary" style={styles.switchPrompt}>
            {mode === 'login' ? 'Ainda não tem uma conta?' : 'Já tem uma conta?'}
          </ThemedText>
          <ThemedText type="linkPrimary" style={styles.switchAction}>
            {mode === 'login' ? 'Criar conta' : 'Entrar'}
          </ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safe: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  subtitle: {
    marginBottom: 12,
  },
  googleButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 9999, backgroundColor: '#f4f5f3' },
  googleButtonPressed: { opacity: 0.85 },
  disabled: { opacity: 0.6 },
  googleLabel: { color: '#202320', fontWeight: '500', fontSize: 16 },
  separator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  separatorLine: { height: 1, flex: 1, backgroundColor: '#2a313d' },
  row: {
    flexDirection: 'row',
  },
  input: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a313d',
    backgroundColor: '#161a22',
    color: '#e6e9ef',
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  error: {
    color: '#f85149',
    fontSize: 13,
  },
  switch: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 8,
  },
  switchPrompt: { fontSize: 14 },
  switchAction: { fontWeight: '600' },
});

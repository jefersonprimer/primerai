import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { ApiError, api } from '@/lib/api';
import { useSession } from '@/state/session';

type Mode = 'login' | 'register';

export function LoginScreen() {
  const { login, register } = useSession();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') await login(email.trim(), password);
      else await register(email.trim(), password);
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

        <ThemedText
          type="linkPrimary"
          onPress={() => {
            setError(null);
            setMode((m) => (m === 'login' ? 'register' : 'login'));
          }}
          style={styles.switch}>
          {mode === 'login' ? 'não tenho conta — criar agora' : 'já tenho conta — entrar'}
        </ThemedText>

        <ThemedText themeColor="textSecondary" style={styles.footer}>
          servidor: {api.baseUrl}
        </ThemedText>
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
    textAlign: 'center',
    marginTop: 4,
  },
  footer: {
    textAlign: 'center',
    fontSize: 11,
    marginTop: 20,
  },
});
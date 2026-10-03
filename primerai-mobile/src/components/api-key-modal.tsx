import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { PROVIDER_CATALOG, type AIModel, type ProviderId } from '@primerai/shared';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { ApiError, api } from '@/lib/api';
import { useSession } from '@/state/session';

type Status = 'idle' | 'saving' | 'discovering';

export interface ApiKeyModalProps {
  /** modal travado: primeira abertura, sem como fechar sem configurar */
  blocking?: boolean;
  onClose?: () => void;
}

export function ApiKeyModal({ blocking = true, onClose }: ApiKeyModalProps) {
  const { session, refresh, needsProvider } = useSession();
  const [provider, setProvider] = useState<ProviderId>('openrouter');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState(PROVIDER_CATALOG[0].suggestedModel);
  const [models, setModels] = useState<AIModel[]>([]);
  const [savedProviderId, setSavedProviderId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const entry = PROVIDER_CATALOG.find((p) => p.id === provider)!;
  const visible = blocking || needsProvider || !onClose;

  function pickProvider(next: ProviderId) {
    const picked = PROVIDER_CATALOG.find((p) => p.id === next)!;
    setProvider(next);
    setSavedProviderId(null);
    setModel(picked.suggestedModel);
    setModels([]);
    setError(null);
    setOk(null);
  }

  async function save(): Promise<string> {
    if (!session) throw new ApiError('no_session', 'sem sessão', 0);
    if (savedProviderId) {
      await api.updateProvider(session.accessToken, savedProviderId, {
        apiKey: apiKey.trim(),
        defaultModel: model,
        isDefault: true,
      });
      return savedProviderId;
    }
    const saved = await api.createProvider(session.accessToken, {
      provider,
      apiKey: apiKey.trim(),
      defaultModel: model,
      makeDefault: true,
    });
    setSavedProviderId(saved.id);
    return saved.id;
  }

  async function handleSubmit() {
    setError(null);
    setOk(null);

    if (entry.keyRequired && !apiKey.trim()) {
      setError(`O ${entry.label} precisa de uma API key.`);
      return;
    }

    setStatus('saving');
    try {
      const id = await save();
      const result = await api.testProvider(session!.accessToken, id);

      if (result.ok) {
        setOk(result.message);
        await refresh();
        setTimeout(() => onClose?.(), 700);
      } else {
        // a chave ficou salva: o usuário só precisa corrigir, sem refazer tudo
        setError(`Chave salva, mas a validação falhou: ${result.message}`);
        await refresh();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'não foi possível falar com o servidor');
    } finally {
      setStatus('idle');
    }
  }

  async function handleDiscoverModels() {
    setError(null);
    setStatus('discovering');
    try {
      const canSave = apiKey.trim().length > 0 || !entry.keyRequired;
      if (!canSave) {
        setError('cole a chave antes de descobrir modelos');
        return;
      }

      const id = await save();
      const discovered = await api.listModels(session!.accessToken, id);
      setModels(discovered);

      if (discovered.length === 0) setError('o provider não retornou nenhum modelo');
      else if (!discovered.some((m) => m.id === model)) setModel(discovered[0]!.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'falha ao buscar modelos');
    } finally {
      setStatus('idle');
    }
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={() => onClose?.()}>
      <ThemedView style={styles.backdrop}>
        <SafeAreaView style={styles.safe}>
          <ThemedView style={styles.card}>
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
              <ThemedText type="title">Conectar sua IA</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.subtitle}>
                A chave fica cifrada no servidor e nunca é compartilhada.
              </ThemedText>

              <View style={styles.grid}>
                {PROVIDER_CATALOG.map((p) => {
                  const active = p.id === provider;
                  return (
                    <Pressable
                      key={p.id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      onPress={() => pickProvider(p.id)}
                      style={({ pressed }) => [
                        styles.chip,
                        active && styles.chipActive,
                        { borderLeftColor: p.accent },
                        pressed && styles.chipPressed,
                      ]}
                    >
                      <ThemedText type="smallBold">{p.label}</ThemedText>
                      <ThemedText themeColor="textSecondary" style={styles.chipBlurb}>
                        {p.blurb}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>

              <ThemedText themeColor="textSecondary" style={styles.label}>
                {entry.label}
              </ThemedText>
              <View style={styles.row}>
                <TextInput
                  value={apiKey}
                  onChangeText={setApiKey}
                  placeholder={entry.keyPlaceholder}
                  placeholderTextColor="#8b94a5"
                  secureTextEntry={entry.keyRequired && !showKey}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={entry.keyRequired}
                  style={styles.input}
                />
                {entry.keyRequired && (
                  <Button
                    variant="secondary"
                    onPress={() => setShowKey((v) => !v)}
                    label={showKey ? 'ocultar' : 'ver'}
                  />
                )}
              </View>

              {entry.keyRequired && (
                <ThemedText
                  type="linkPrimary"
                  onPress={() => void WebBrowser.openBrowserAsync(entry.docsUrl)}
                  style={styles.hint}
                >
                  🔗 obter uma chave no {entry.label}
                </ThemedText>
              )}

              <ThemedText themeColor="textSecondary" style={styles.label}>
                Modelo
              </ThemedText>
              <View style={styles.row}>
                <TextInput
                  value={model}
                  onChangeText={setModel}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                />
                <Button
                  variant="secondary"
                  onPress={handleDiscoverModels}
                  disabled={status !== 'idle'}
                  label={status === 'discovering' ? '…' : '↻'}
                />
              </View>

              {models.length > 0 && (
                <ScrollView horizontal style={styles.modelRow} showsHorizontalScrollIndicator={false}>
                  {models.map((m) => {
                    const active = m.id === model;
                    return (
                      <Pressable
                        key={m.id}
                        onPress={() => setModel(m.id)}
                        style={[styles.modelChip, active && styles.modelChipActive]}
                      >
                        <ThemedText type="small" themeColor={active ? 'text' : 'textSecondary'}>
                          {m.label}{m.isFree ? ' · Free' : ''}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}

              {error && <ThemedText style={styles.error}>{error}</ThemedText>}
              {ok && <ThemedText style={styles.success}>{ok}</ThemedText>}

              <Button
                onPress={handleSubmit}
                disabled={status === 'saving'}
                label={status === 'saving' ? 'Validando…' : 'Validar e continuar'}
              />

              {!blocking && (
                <Button variant="ghost" onPress={() => onClose?.()} label="Agora não" />
              )}

              <ThemedText themeColor="textSecondary" style={styles.footnote}>
                {entry.keyRequired ? 'cifrada com AES-256-GCM' : 'roda local, sem chave'}
              </ThemedText>
            </ScrollView>
          </ThemedView>
        </SafeAreaView>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
  },
  safe: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    padding: 16,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a313d',
    backgroundColor: '#161a22',
    padding: 20,
    maxHeight: '90%',
  },
  scroll: {
    gap: 12,
  },
  subtitle: {
    marginTop: -6,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexGrow: 1,
    flexBasis: '45%',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a313d',
    borderLeftWidth: 3,
    backgroundColor: '#1e2430',
    gap: 4,
  },
  chipActive: {
    backgroundColor: '#243050',
  },
  chipPressed: {
    opacity: 0.75,
  },
  chipBlurb: {
    fontSize: 12,
    lineHeight: 16,
  },
  label: {
    fontSize: 13,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a313d',
    backgroundColor: '#0d0f14',
    color: '#e6e9ef',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  hint: {
    fontSize: 13,
  },
  modelRow: {
    marginTop: 4,
  },
  modelChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2a313d',
    marginRight: 6,
  },
  modelChipActive: {
    borderColor: '#6f8cff',
    backgroundColor: '#243050',
  },
  error: {
    color: '#f85149',
    fontSize: 13,
    lineHeight: 18,
  },
  success: {
    color: '#3fb950',
    fontSize: 13,
    lineHeight: 18,
  },
  footnote: {
    fontSize: 11,
    textAlign: 'center',
  },
});

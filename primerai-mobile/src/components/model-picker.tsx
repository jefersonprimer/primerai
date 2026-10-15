import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Check, X } from 'lucide-react-native';
import type { AIModel, AiProvider } from '@primerai/shared';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { api } from '@/lib/api';

export interface ModelPickerProps {
  visible: boolean;
  /** provider cujos modelos serão listados */
  provider: AiProvider | undefined;
  /** modelo em uso, para marcar na lista */
  selected: string | undefined;
  accessToken: string | undefined;
  onClose: () => void;
  onSelect: (model: string) => void;
}

function describe(model: AIModel): string {
  const context = model.contextWindow ? ` · ${Math.round(model.contextWindow / 1000)}k` : '';
  return `${model.label}${model.isFree ? ' · Free' : ''}${context}`;
}

export function ModelPicker({
  visible,
  provider,
  selected,
  accessToken,
  onClose,
  onSelect,
}: ModelPickerProps) {
  /** `null` = ainda não respondeu; assim o loading é derivado e o effect não seta state */
  const [models, setModels] = useState<AIModel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState('');

  const withoutProvider = !provider || !accessToken;
  const loading = !withoutProvider && models === null && error === null;

  useEffect(() => {
    if (!visible || !provider || !accessToken) return;
    let cancelled = false;

    void api
      .listModels(accessToken, provider.id)
      .then((list) => {
        if (!cancelled) setModels(list);
      })
      .catch((err) => {
        // provider sem endpoint de modelos ainda deixa o usuário digitar o id à mão
        if (cancelled) return;
        setModels([]);
        setError(err instanceof Error ? err.message : 'não foi possível listar os modelos');
      });

    return () => {
      cancelled = true;
    };
  }, [visible, provider, accessToken]);

  function reset() {
    setModels(null);
    setError(null);
    setManual('');
  }

  function close() {
    reset();
    onClose();
  }

  function choose(model: string) {
    reset();
    onSelect(model);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTouch} onPress={close} />
        <ThemedView type="backgroundElement" style={styles.card}>
          <View style={styles.head}>
            <View style={styles.titleGroup}>
              <ThemedText type="subtitle">Modelo</ThemedText>
              {provider && (
                <View style={styles.providerBadge}>
                  <ThemedText type="small" style={styles.providerLabel} numberOfLines={1}>
                    {provider.label}
                  </ThemedText>
                </View>
              )}
            </View>
            <Pressable
              onPress={close}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Fechar seleção de modelo"
              style={styles.closeButton}
            >
              <X size={18} color="#c8d2e8" />
            </Pressable>
          </View>
          <ThemedText themeColor="textSecondary" type="small" style={styles.subtitle}>
            Escolha o modelo para esta conversa
          </ThemedText>

          {loading && <ActivityIndicator style={styles.loader} />}

          {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}

          {!provider && (
            <ThemedText themeColor="textSecondary">
              Nenhum provider de IA configurado.
            </ThemedText>
          )}

          {provider && !accessToken && (
            <ThemedText themeColor="textSecondary">
              Entre na sua conta para listar os modelos.
            </ThemedText>
          )}

          {!loading && !error && !withoutProvider && models?.length === 0 && (
            <ThemedText themeColor="textSecondary">
              Nenhum modelo disponível. Digite o id abaixo.
            </ThemedText>
          )}

          {models !== null && models.length > 0 && (
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {models.map((model) => {
                const isSelected = model.id === selected;
                return (
                  <Pressable
                    key={model.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    style={[styles.option, isSelected && styles.optionSelected]}
                    onPress={() => choose(model.id)}>
                    <ThemedText numberOfLines={1} style={styles.optionLabel}>
                      {describe(model)}
                    </ThemedText>
                    {isSelected && <Check size={18} color="#e1e3e8" />}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <View style={styles.manualRow}>
            <TextInput
              value={manual}
              onChangeText={setManual}
              placeholder="ou digite o id do modelo"
              placeholderTextColor="#8b94a5"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={120}
              style={styles.manualInput}
            />
            <Pressable
              disabled={!manual.trim()}
              onPress={() => choose(manual.trim())}
              style={[styles.manualButton, !manual.trim() && styles.manualDisabled]}>
              <ThemedText style={styles.manualLabel}>Usar</ThemedText>
            </Pressable>
          </View>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(8,9,11,0.62)' },
  backdropTouch: { flex: 1 },
  card: {
    maxHeight: '82%',
    marginBottom: 12,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingTop: Spacing.three,
    paddingBottom: 28,
    gap: Spacing.two,
    borderWidth: 1,
    borderColor: '#3b3d42',
    backgroundColor: '#232427',
    shadowColor: '#000000',
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 },
  titleGroup: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  providerBadge: {
    maxWidth: 132,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#303135',
    borderWidth: 1,
    borderColor: '#4a4b50',
  },
  providerLabel: { color: '#d0d1d5' },
  closeButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: '#333438',
  },
  subtitle: { marginTop: -Spacing.one },
  loader: { marginVertical: Spacing.three },
  error: { color: '#f85149' },
  list: { marginTop: Spacing.one, flexShrink: 1 },
  listContent: { gap: 8, paddingBottom: 4 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    minHeight: 52,
    paddingVertical: 10,
    paddingHorizontal: 13,
    borderRadius: 14,
    backgroundColor: '#2b2c30',
    borderWidth: 1,
    borderColor: '#3a3b40',
  },
  optionSelected: { backgroundColor: '#37383d', borderColor: '#777980' },
  optionLabel: { flex: 1 },
  manualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.two,
    padding: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#4a4b50',
    backgroundColor: '#27282b',
  },
  manualInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: '#e6e9ef',
    fontSize: 15,
  },
  manualButton: { backgroundColor: '#dedfe3', paddingHorizontal: 17, paddingVertical: 10, borderRadius: 999 },
  manualDisabled: { opacity: 0.45 },
  manualLabel: { color: '#242529', fontWeight: '700' },
});

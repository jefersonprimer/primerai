import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Check } from 'lucide-react-native';
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
            <ThemedText type="smallBold">Modelo</ThemedText>
            <Pressable onPress={close} hitSlop={10}>
              <ThemedText>✕</ThemedText>
            </Pressable>
          </View>

          {provider && (
            <ThemedText themeColor="textSecondary" type="small">
              {provider.label}
            </ThemedText>
          )}

          {loading && <ActivityIndicator style={styles.loader} />}

          {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}

          {!loading && !error && models?.length === 0 && (
            <ThemedText themeColor="textSecondary">
              {withoutProvider
                ? 'Nenhum provider de IA configurado.'
                : 'Nenhum modelo disponível. Digite o id abaixo.'}
            </ThemedText>
          )}

          {models !== null && models.length > 0 && (
            <ScrollView style={styles.list}>
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
                    {isSelected && <Check size={18} color="#6f8cff" />}
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
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.65)' },
  backdropTouch: { flex: 1 },
  card: {
    maxHeight: '82%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  loader: { marginVertical: Spacing.three },
  error: { color: '#f85149' },
  list: { marginTop: Spacing.one },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: 11,
    paddingHorizontal: 11,
    borderRadius: 10,
  },
  optionSelected: { backgroundColor: '#243050' },
  optionLabel: { flex: 1 },
  manualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.two,
    padding: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#343a47',
    backgroundColor: '#161a22',
  },
  manualInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: '#e6e9ef',
    fontSize: 15,
  },
  manualButton: { backgroundColor: '#6f8cff', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
  manualDisabled: { opacity: 0.45 },
  manualLabel: { color: '#0d0f14', fontWeight: '700' },
});

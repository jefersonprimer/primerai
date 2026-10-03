import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, Trash2 } from 'lucide-react-native';
import type { AiProvider } from '@primerai/shared';

import { ApiKeyModal } from '@/components/api-key-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useSession } from '@/state/session';

export default function SettingsScreen() {
  const { providers, session, logout, refreshProviders, removeProvider } = useSession();
  const [showModal, setShowModal] = useState(false);
  const [providerToDelete, setProviderToDelete] = useState<AiProvider | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function deleteProvider() {
    if (!providerToDelete || !session || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteProvider(session.accessToken, providerToDelete.id);
      removeProvider(providerToDelete.id);
      setProviderToDelete(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Não foi possível remover o provider.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Voltar ao chat" hitSlop={10} style={styles.backButton} onPress={() => router.replace('/')}>
            <ArrowLeft size={20} color="#e6e9ef" />
          </Pressable>
          <ThemedText type="subtitle">Configurações</ThemedText>
        </View>
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled">
          <ThemedText type="subtitle">Conta</ThemedText>
          <ThemedText>{session?.user.email}</ThemedText>

          <ThemedText type="subtitle" style={styles.section}>
            Providers de IA
          </ThemedText>

          {providers.length === 0 ? (
            <ThemedText themeColor="textSecondary">Nenhum configurado ainda.</ThemedText>
          ) : (
            <View style={styles.list}>
              {providers.map((p) => (
                <ThemedView key={p.id} type="backgroundElement" style={styles.card}>
                <View style={styles.cardHead}>
                  <ThemedText type="smallBold">{p.label}</ThemedText>
                  <View style={styles.providerActions}>
                    {p.isDefault && <ThemedText type="small">padrão</ThemedText>}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remover ${p.label}`}
                      hitSlop={8}
                      style={styles.removeButton}
                      onPress={() => { setDeleteError(null); setProviderToDelete(p); }}>
                      <Trash2 size={17} color="#aeb7c8" />
                    </Pressable>
                  </View>
                  </View>
                  <ThemedText themeColor="textSecondary" type="small">
                    {p.provider} · {p.keyHint}
                  </ThemedText>
                  {p.defaultModel && (
                    <ThemedText themeColor="textSecondary" type="small">
                      {p.defaultModel}
                    </ThemedText>
                  )}
                </ThemedView>
              ))}
            </View>
          )}

          <Button label="Adicionar provider" onPress={() => setShowModal(true)} />

          <ThemedText type="subtitle" style={styles.section}>
            Servidor
          </ThemedText>
          <ThemedText themeColor="textSecondary" type="small">
            {api.baseUrl}
          </ThemedText>

          <Button variant="secondary" label="Sair" onPress={() => void logout()} />
        </ScrollView>

        {showModal && (
          <ApiKeyModal blocking={false} onClose={() => { setShowModal(false); void refreshProviders(); }} />
        )}
        <Modal
          visible={Boolean(providerToDelete)}
          transparent
          animationType="fade"
          onRequestClose={() => !deleting && setProviderToDelete(null)}>
          <View style={styles.confirmBackdrop}>
            <ThemedView type="backgroundElement" style={styles.confirmCard}>
              <ThemedText type="smallBold">Remover provider?</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.confirmCopy}>
                O provider “{providerToDelete?.label}” será removido da sua conta.
              </ThemedText>
              {deleteError && <ThemedText style={styles.error}>{deleteError}</ThemedText>}
              <View style={styles.confirmActions}>
                <Pressable disabled={deleting} onPress={() => setProviderToDelete(null)} style={styles.cancelButton}>
                  <ThemedText>Cancelar</ThemedText>
                </Pressable>
                <Pressable disabled={deleting} onPress={() => void deleteProvider()} style={styles.deleteButton}>
                  <ThemedText style={styles.deleteLabel}>{deleting ? 'Removendo…' : 'Remover'}</ThemedText>
                </Pressable>
              </View>
            </ThemedView>
          </View>
        </Modal>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1, padding: 16 },
  content: { flex: 1 },
  contentContainer: { gap: 10, paddingBottom: 20 },
  header: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  backButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  section: { marginTop: 20 },
  list: { gap: 8 },
  card: { padding: 12, borderRadius: 10, gap: 4 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  providerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  removeButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#292d36' },
  confirmBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.65)' },
  confirmCard: { width: '100%', maxWidth: 400, borderRadius: 14, padding: 18, gap: 14 },
  confirmCopy: { lineHeight: 21 },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  cancelButton: { paddingHorizontal: 12, paddingVertical: 10 },
  deleteButton: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 9, backgroundColor: '#b62324' },
  deleteLabel: { color: '#fff', fontWeight: '700' },
  error: { color: '#f85149' },
});

import { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import {
  Brain,
  ChevronLeft,
  Cpu,
  LogOut,
  Plus,
  Server,
  Trash2,
  User,
} from "lucide-react-native";
import type { AiProvider, MemorySettings, MemorySuggestion } from "@primerai/shared";

import { ApiKeyModal } from "@/components/api-key-modal";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { api } from "@/lib/api";
import { useSession } from "@/state/session";

export default function SettingsScreen() {
  const theme = useTheme();
  const { providers, session, logout, refreshProviders, removeProvider } =
    useSession();
  const [showModal, setShowModal] = useState(false);
  const [providerToDelete, setProviderToDelete] = useState<AiProvider | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [memories, setMemories] = useState<
    { key: string; value: string; category?: string; origin?: string; createdAt: string }[]
  >([]);
  const [memoryKey, setMemoryKey] = useState("");
  const [memoryValue, setMemoryValue] = useState("");
  const [memoryCategory, setMemoryCategory] = useState("context");
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const [memorySettings, setMemorySettings] = useState<MemorySettings>({ useMemoriesInChat: true, automaticSuggestionsEnabled: false });
  const [memorySuggestions, setMemorySuggestions] = useState<MemorySuggestion[]>([]);
  const [notion, setNotion] = useState<{ connected: boolean; workspaceName: string | null } | null>(null);
  const [notionBusy, setNotionBusy] = useState(false);
  const [notionMessage, setNotionMessage] = useState<string | null>(null);
  const [calendar, setCalendar] = useState<{ connected: boolean; calendarId: string | null } | null>(null);
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [calendarMessage, setCalendarMessage] = useState<string | null>(null);

  async function refreshNotion() {
    if (!session) return;
    try { setNotion(await api.notionStatus(session.accessToken)); }
    catch (err) { setNotionMessage(err instanceof Error ? err.message : "Não foi possível consultar o Notion."); }
  }

  async function connectNotion() {
    if (!session || notionBusy) return;
    setNotionBusy(true); setNotionMessage(null);
    try {
      const { authorizationUrl } = await api.notionConnect(session.accessToken);
      await WebBrowser.openBrowserAsync(authorizationUrl);
      await refreshNotion();
    } catch (err) { setNotionMessage(err instanceof Error ? err.message : "Não foi possível iniciar a conexão com o Notion."); }
    finally { setNotionBusy(false); }
  }

  async function disconnectNotion() {
    if (!session || notionBusy) return;
    setNotionBusy(true); setNotionMessage(null);
    try { await api.notionDisconnect(session.accessToken); setNotion({ connected: false, workspaceName: null }); }
    catch (err) { setNotionMessage(err instanceof Error ? err.message : "Não foi possível desconectar o Notion."); }
    finally { setNotionBusy(false); }
  }

  async function refreshCalendar() {
    if (!session) return;
    try { setCalendar(await api.calendarStatus(session.accessToken)); }
    catch (err) { setCalendarMessage(err instanceof Error ? err.message : "Não foi possível consultar o Google Calendar."); }
  }

  async function connectCalendar() {
    if (!session || calendarBusy) return;
    setCalendarBusy(true); setCalendarMessage(null);
    try {
      const { authorizationUrl } = await api.calendarConnect(session.accessToken);
      await WebBrowser.openBrowserAsync(authorizationUrl);
      await refreshCalendar();
    } catch (err) { setCalendarMessage(err instanceof Error ? err.message : "Não foi possível iniciar a conexão com o Google Calendar."); }
    finally { setCalendarBusy(false); }
  }

  async function disconnectCalendar() {
    if (!session || calendarBusy) return;
    setCalendarBusy(true); setCalendarMessage(null);
    try { await api.calendarDisconnect(session.accessToken); setCalendar({ connected: false, calendarId: null }); }
    catch (err) { setCalendarMessage(err instanceof Error ? err.message : "Não foi possível desconectar o Google Calendar."); }
    finally { setCalendarBusy(false); }
  }

  async function refreshMemories() {
    if (!session) return;
    try {
      setMemories(await api.listMemories(session.accessToken));
      const [settings, suggestions] = await Promise.all([api.getMemorySettings(session.accessToken), api.listMemorySuggestions(session.accessToken)]);
      setMemorySettings(settings);
      setMemorySuggestions(suggestions);
    } catch (err) {
      setMemoryError(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar a memória.",
      );
    }
  }

  useEffect(() => {
    const token = session?.accessToken;
    if (!token) return;
    let cancelled = false;
    void Promise.all([api.listMemories(token), api.getMemorySettings(token), api.listMemorySuggestions(token)])
      .then(([items, settings, suggestions]) => {
        if (cancelled) return;
        setMemories(items); setMemorySettings(settings); setMemorySuggestions(suggestions);
      })
      .catch((err) => { if (!cancelled) setMemoryError(err instanceof Error ? err.message : "Não foi possível carregar a memória."); });
    return () => { cancelled = true; };
  }, [session?.accessToken]);

  useEffect(() => {
    const token = session?.accessToken;
    if (!token) return;
    let cancelled = false;
    void api.calendarStatus(token).then((status) => { if (!cancelled) setCalendar(status); })
      .catch((err) => { if (!cancelled) setCalendarMessage(err instanceof Error ? err.message : "Não foi possível consultar o Google Calendar."); });
    return () => { cancelled = true; };
  }, [session?.accessToken]);

  useEffect(() => {
    const token = session?.accessToken;
    if (!token) return;
    let cancelled = false;
    void api.notionStatus(token).then((status) => { if (!cancelled) setNotion(status); })
      .catch((err) => { if (!cancelled) setNotionMessage(err instanceof Error ? err.message : "Não foi possível consultar o Notion."); });
    return () => { cancelled = true; };
  }, [session?.accessToken]);

  async function saveMemory() {
    if (!session || !memoryKey.trim() || !memoryValue.trim()) return;
    setMemoryError(null);
    try {
      await api.saveMemory(session.accessToken, memoryKey, memoryValue, memoryCategory);
      setMemoryKey("");
      setMemoryValue("");
      setMemoryCategory("context");
      await refreshMemories();
    } catch (err) {
      setMemoryError(
        err instanceof Error
          ? err.message
          : "Não foi possível salvar a memória.",
      );
    }
  }

  async function deleteMemory(key: string) {
    if (!session) return;
    try {
      await api.deleteMemory(session.accessToken, key);
      await refreshMemories();
    } catch (err) {
      setMemoryError(
        err instanceof Error
          ? err.message
          : "Não foi possível apagar a memória.",
      );
    }
  }

  async function updateMemorySetting(patch: Partial<MemorySettings>) {
    if (!session) return;
    try { setMemorySettings(await api.updateMemorySettings(session.accessToken, patch)); }
    catch (err) { setMemoryError(err instanceof Error ? err.message : "Não foi possível atualizar as preferências da memória."); }
  }

  async function acceptMemorySuggestion(suggestion: MemorySuggestion) {
    if (!session) return;
    try {
      await api.acceptMemorySuggestion(session.accessToken, suggestion.id);
      setMemorySuggestions((items) => items.filter((item) => item.id !== suggestion.id));
      await refreshMemories();
    } catch (err) { setMemoryError(err instanceof Error ? err.message : "Não foi possível salvar a sugestão."); }
  }

  async function dismissMemorySuggestion(id: string) {
    if (!session) return;
    try { await api.dismissMemorySuggestion(session.accessToken, id); setMemorySuggestions((items) => items.filter((item) => item.id !== id)); }
    catch (err) { setMemoryError(err instanceof Error ? err.message : "Não foi possível descartar a sugestão."); }
  }

  function clearAllMemories() {
    if (!session) return;
    Alert.alert("Apagar todas as memórias?", "Isso remove o perfil salvo. As conversas não serão apagadas.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Apagar tudo", style: "destructive", onPress: () => { void api.clearMemories(session.accessToken).then(() => { setMemories([]); }).catch((err) => setMemoryError(err instanceof Error ? err.message : "Não foi possível apagar as memórias.")); } },
    ]);
  }

  async function deleteProvider() {
    if (!providerToDelete || !session || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteProvider(session.accessToken, providerToDelete.id);
      removeProvider(providerToDelete.id);
      setProviderToDelete(null);
    } catch (err) {
      setDeleteError(
        err instanceof Error
          ? err.message
          : "Não foi possível remover o provider.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Voltar ao chat"
            hitSlop={10}
            style={({ pressed }) => [
              styles.backButton,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.backgroundSelected,
              },
              pressed && styles.pressed,
            ]}
            onPress={() => router.replace("/")}
          >
            <ChevronLeft size={22} color={theme.text} />
          </Pressable>
          <ThemedText type="subtitle" style={styles.headerTitle}>
            Configurações
          </ThemedText>
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Seção Conta */}
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeader}>
              <User size={18} color={theme.textSecondary} />
              <ThemedText style={styles.sectionTitle}>Conta</ThemedText>
            </View>

            <ThemedView type="backgroundElement" style={styles.card}>
              <View style={styles.accountRow}>
                <View
                  style={[
                    styles.avatarBadge,
                    { backgroundColor: theme.backgroundSelected },
                  ]}
                >
                  <User size={20} color={theme.text} />
                </View>
                <View style={styles.accountDetails}>
                  <ThemedText type="smallBold">
                    {session?.user.email ?? "Não conectado"}
                  </ThemedText>
                  <ThemedText themeColor="textSecondary" type="small">
                    Sessão ativa
                  </ThemedText>
                </View>
              </View>
            </ThemedView>
          </View>

          {/* Seção Google Calendar */}
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitle}>Google Calendar</ThemedText>
            </View>
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText themeColor="textSecondary" type="small">
                {calendar?.connected
                  ? "Conectado. Peça à IA para agendar reuniões, consultas e compromissos."
                  : "Conecte sua agenda para permitir que a IA crie eventos quando você pedir."}
              </ThemedText>
              {calendarMessage && <ThemedText style={styles.error}>{calendarMessage}</ThemedText>}
              <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
                <Button label={calendarBusy ? "Aguarde…" : calendar?.connected ? "Desconectar" : "Conectar Google Calendar"} disabled={calendarBusy || !session} onPress={() => void (calendar?.connected ? disconnectCalendar() : connectCalendar())} />
                <Button variant="secondary" label="Atualizar status" disabled={calendarBusy} onPress={() => void refreshCalendar()} />
              </View>
            </ThemedView>
          </View>

          {/* Seção Notion */}
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitle}>Notion</ThemedText>
            </View>
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText themeColor="textSecondary" type="small">
                {notion?.connected
                  ? `Conectado${notion.workspaceName ? ` a ${notion.workspaceName}` : ""}. A IA pode criar notas no seu espaço.`
                  : "Conecte seu espaço para pedir à IA que crie notas no Notion."}
              </ThemedText>
              {notionMessage && <ThemedText style={styles.error}>{notionMessage}</ThemedText>}
              <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
                <Button label={notionBusy ? "Aguarde…" : notion?.connected ? "Desconectar" : "Conectar Notion"} disabled={notionBusy || !session} onPress={() => void (notion?.connected ? disconnectNotion() : connectNotion())} />
                <Button variant="secondary" label="Atualizar status" disabled={notionBusy} onPress={() => void refreshNotion()} />
              </View>
            </ThemedView>
          </View>

          {/* Seção Providers de IA */}
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeader}>
              <Cpu size={18} color={theme.textSecondary} />
              <ThemedText style={styles.sectionTitle}>
                Providers de IA
              </ThemedText>
            </View>

            {providers.length === 0 ? (
              <ThemedView type="backgroundElement" style={styles.emptyCard}>
                <ThemedText themeColor="textSecondary" type="small">
                  Nenhum provider configurado ainda.
                </ThemedText>
              </ThemedView>
            ) : (
              <View style={styles.list}>
                {providers.map((p) => (
                  <ThemedView
                    key={p.id}
                    type="backgroundElement"
                    style={styles.card}
                  >
                    <View style={styles.cardHead}>
                      <ThemedText type="smallBold">{p.label}</ThemedText>
                      <View style={styles.providerActions}>
                        {p.isDefault && (
                          <View
                            style={[
                              styles.defaultBadge,
                              { backgroundColor: theme.backgroundSelected },
                            ]}
                          >
                            <ThemedText
                              type="small"
                              themeColor="textSecondary"
                              style={styles.defaultBadgeText}
                            >
                              padrão
                            </ThemedText>
                          </View>
                        )}
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Remover ${p.label}`}
                          hitSlop={8}
                          style={({ pressed }) => [
                            styles.removeButton,
                            { backgroundColor: theme.backgroundSelected },
                            pressed && styles.pressed,
                          ]}
                          onPress={() => {
                            setDeleteError(null);
                            setProviderToDelete(p);
                          }}
                        >
                          <Trash2 size={16} color={theme.textSecondary} />
                        </Pressable>
                      </View>
                    </View>
                    <ThemedText themeColor="textSecondary" type="small">
                      {p.provider} · {p.keyHint}
                    </ThemedText>
                    {p.defaultModel && (
                      <ThemedText themeColor="textSecondary" type="small">
                        Modelo: {p.defaultModel}
                      </ThemedText>
                    )}
                  </ThemedView>
                ))}
              </View>
            )}

            <Button
              label="Adicionar provider"
              onPress={() => setShowModal(true)}
            />
          </View>

          {/* Seção Memória da IA */}
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeader}>
              <Brain size={18} color={theme.textSecondary} />
              <ThemedText style={styles.sectionTitle}>
                Memória da IA
              </ThemedText>
            </View>

            <ThemedText
              themeColor="textSecondary"
              type="small"
              style={styles.sectionDesc}
            >
              Preferências e contexto ajudam em novos chats. Sugestões automáticas só são salvas depois da sua aprovação. Evite guardar senhas ou dados sensíveis.
            </ThemedText>

            <Pressable onPress={() => void updateMemorySetting({ useMemoriesInChat: !memorySettings.useMemoriesInChat })} style={[styles.card, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}>
              <ThemedText>Usar memórias nos chats</ThemedText><ThemedText type="smallBold">{memorySettings.useMemoriesInChat ? "Ativado" : "Desativado"}</ThemedText>
            </Pressable>
            <Pressable onPress={() => void updateMemorySetting({ automaticSuggestionsEnabled: !memorySettings.automaticSuggestionsEnabled })} style={[styles.card, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}>
              <ThemedText>Sugerir novas memórias</ThemedText><ThemedText type="smallBold">{memorySettings.automaticSuggestionsEnabled ? "Ativado" : "Desativado"}</ThemedText>
            </Pressable>

            {memorySuggestions.length > 0 && <ThemedText type="smallBold">Sugestões para revisar</ThemedText>}
            {memorySuggestions.map((suggestion) => <ThemedView key={suggestion.id} type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">{suggestion.category} · {suggestion.key}</ThemedText>
              <ThemedText themeColor="textSecondary">{suggestion.value}</ThemedText>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <Pressable onPress={() => void acceptMemorySuggestion(suggestion)}><ThemedText type="smallBold">Guardar</ThemedText></Pressable>
                <Pressable onPress={() => void dismissMemorySuggestion(suggestion.id)}><ThemedText themeColor="textSecondary" type="small">Agora não</ThemedText></Pressable>
              </View>
            </ThemedView>)}

            {memoryError && (
              <ThemedText style={styles.error}>{memoryError}</ThemedText>
            )}

            {memories.map((memory) => (
              <ThemedView
                key={memory.key}
                type="backgroundElement"
                style={styles.card}
              >
                <View style={styles.cardHead}>
                  <Pressable onPress={() => { setMemoryKey(memory.key); setMemoryValue(memory.value); setMemoryCategory(memory.category || "context"); }}>
                    <ThemedText type="smallBold">{memory.category || "context"} · {memory.key}</ThemedText>
                    <ThemedText themeColor="textSecondary" type="small">{memory.origin === "accepted_suggestion" ? "Sugestão aprovada" : memory.origin === "explicit" ? "Pedido explícito" : "Adicionada manualmente"}</ThemedText>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Apagar memória ${memory.key}`}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.removeButton,
                      { backgroundColor: theme.backgroundSelected },
                      pressed && styles.pressed,
                    ]}
                    onPress={() => void deleteMemory(memory.key)}
                  >
                    <Trash2 size={16} color={theme.textSecondary} />
                  </Pressable>
                </View>
                <ThemedText themeColor="textSecondary">
                  {memory.value}
                </ThemedText>
              </ThemedView>
            ))}
            {memories.length > 0 && <Pressable onPress={clearAllMemories} style={{ alignSelf: "flex-start", paddingVertical: 8 }}><ThemedText style={styles.error}>Apagar todas as memórias</ThemedText></Pressable>}

            <View style={styles.formGroup}>
              <ThemedText themeColor="textSecondary" type="small">Categoria: {memoryCategory}</ThemedText>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {["preference", "writing_style", "project", "workflow", "person", "goal", "context", "history"].map((category) => (
                  <Pressable key={category} onPress={() => setMemoryCategory(category)} style={{ padding: 8, borderRadius: 8, backgroundColor: memoryCategory === category ? theme.backgroundSelected : theme.backgroundElement }}>
                    <ThemedText type="small">{category}</ThemedText>
                  </Pressable>
                ))}
              </View>
              <TextInput
                accessibilityLabel="O que a IA deve lembrar"
                placeholder="O que lembrar (ex.: idioma)"
                placeholderTextColor={theme.textSecondary}
                value={memoryKey}
                onChangeText={setMemoryKey}
                maxLength={120}
                style={[
                  styles.memoryInput,
                  {
                    color: theme.text,
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.backgroundSelected,
                  },
                ]}
              />
              <TextInput
                accessibilityLabel="Detalhe da memória"
                placeholder="Detalhe"
                placeholderTextColor={theme.textSecondary}
                value={memoryValue}
                onChangeText={setMemoryValue}
                maxLength={2000}
                multiline
                style={[
                  styles.memoryInput,
                  styles.memoryMultiline,
                  {
                    color: theme.text,
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.backgroundSelected,
                  },
                ]}
              />
              <Button
                label="Salvar memória"
                onPress={() => void saveMemory()}
              />
            </View>
          </View>

          {/* Seção Servidor */}
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeader}>
              <Server size={18} color={theme.textSecondary} />
              <ThemedText style={styles.sectionTitle}>Servidor</ThemedText>
            </View>

            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText themeColor="textSecondary" type="small">
                {api.baseUrl}
              </ThemedText>
            </ThemedView>
          </View>

          {/* Logout */}
          <View style={styles.logoutContainer}>
            <Button
              variant="secondary"
              label="Sair da conta"
              onPress={() => void logout()}
            />
          </View>
        </ScrollView>

        {showModal && (
          <ApiKeyModal
            blocking={false}
            onClose={() => {
              setShowModal(false);
              void refreshProviders();
            }}
          />
        )}

        <Modal
          visible={Boolean(providerToDelete)}
          transparent
          animationType="fade"
          onRequestClose={() => !deleting && setProviderToDelete(null)}
        >
          <View style={styles.confirmBackdrop}>
            <ThemedView type="backgroundElement" style={styles.confirmCard}>
              <ThemedText type="smallBold">Remover provider?</ThemedText>
              <ThemedText
                themeColor="textSecondary"
                style={styles.confirmCopy}
              >
                O provider “{providerToDelete?.label}” será removido da sua
                conta.
              </ThemedText>
              {deleteError && (
                <ThemedText style={styles.error}>{deleteError}</ThemedText>
              )}
              <View style={styles.confirmActions}>
                <Pressable
                  disabled={deleting}
                  onPress={() => setProviderToDelete(null)}
                  style={styles.cancelButton}
                >
                  <ThemedText>Cancelar</ThemedText>
                </Pressable>
                <Pressable
                  disabled={deleting}
                  onPress={() => void deleteProvider()}
                  style={styles.deleteButton}
                >
                  <ThemedText style={styles.deleteLabel}>
                    {deleting ? "Removendo…" : "Remover"}
                  </ThemedText>
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
  container: {
    flex: 1,
  },
  safe: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  header: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "500",
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.96 }],
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    gap: 24,
    paddingBottom: 40,
  },
  sectionBlock: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "400",
    lineHeight: 22,
  },
  sectionDesc: {
    lineHeight: 20,
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatarBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  accountDetails: {
    gap: 2,
  },
  list: {
    gap: 10,
  },
  card: {
    padding: 14,
    borderRadius: 12,
    gap: 6,
  },
  emptyCard: {
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cardHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  providerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  defaultBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  defaultBadgeText: {
    fontSize: 12,
  },
  removeButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  formGroup: {
    gap: 10,
    marginTop: 4,
  },
  memoryInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  memoryMultiline: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  logoutContainer: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(150, 150, 150, 0.2)",
  },
  confirmBackdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
  },
  confirmCard: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 16,
    padding: 20,
    gap: 14,
  },
  confirmCopy: {
    lineHeight: 21,
  },
  confirmActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 4,
  },
  cancelButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  deleteButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#b62324",
  },
  deleteLabel: {
    color: "#ffffff",
    fontWeight: "600",
  },
  error: {
    color: "#f85149",
    fontSize: 14,
  },
});

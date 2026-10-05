import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { Search, X } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Conversation } from "@primerai/shared";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { MaxContentWidth, Spacing } from "@/constants/theme";
import { api } from "@/lib/api";
import { useSession } from "@/state/session";

export default function ConversationSearchScreen() {
  const { session } = useSession();
  const [query, setQuery] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.accessToken) return;
    let cancelled = false;
    void api
      .listConversations(session.accessToken)
      .then((list) => {
        if (!cancelled) setConversations(list);
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof Error
              ? err.message
              : "Não foi possível carregar as conversas.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.accessToken]);

  const results = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return conversations;
    return conversations.filter((conversation) =>
      `${conversation.title} ${conversation.model}`
        .toLocaleLowerCase()
        .includes(normalizedQuery),
    );
  }, [conversations, query]);

  function openConversation(conversation: Conversation) {
    router.replace({
      pathname: "/",
      params: { conversationId: conversation.id },
    });
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={styles.keyboardArea}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 50 : 0}
        >
          {error ? (
            <ThemedText style={styles.error}>{error}</ThemedText>
          ) : loading ? (
            <ActivityIndicator style={styles.loader} />
          ) : (
            <ScrollView
              style={styles.resultsScroll}
              contentContainerStyle={styles.results}
              keyboardShouldPersistTaps="handled"
            >
              {results.map((conversation) => (
                <Pressable
                  key={conversation.id}
                  accessibilityRole="button"
                  style={styles.result}
                  onPress={() => openConversation(conversation)}
                >
                  <View style={styles.resultCopy}>
                    <ThemedText numberOfLines={1}>
                      {conversation.title || "Nova conversa"}
                    </ThemedText>
                    <ThemedText
                      themeColor="textSecondary"
                      type="small"
                      numberOfLines={1}
                    >
                      {conversation.model}
                    </ThemedText>
                  </View>
                </Pressable>
              ))}
              {results.length === 0 && (
                <ThemedText themeColor="textSecondary" style={styles.empty}>
                  {conversations.length
                    ? "Nenhuma conversa encontrada."
                    : "Suas conversas aparecerão aqui."}
                </ThemedText>
              )}
            </ScrollView>
          )}

          <View style={styles.searchHeader}>
            <ThemedView type="backgroundElement" style={styles.searchField}>
              <Search size={19} color="#8b94a5" />
              <TextInput
                autoFocus
                value={query}
                onChangeText={setQuery}
                placeholder="Buscar conversas"
                placeholderTextColor="#8b94a5"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                style={styles.input}
              />
            </ThemedView>
            <ThemedView type="backgroundElement" style={styles.closeButton}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Fechar busca"
                style={styles.closeButtonTouch}
                onPress={() => router.back()}
              >
                <X size={24} color="#c8d2e8" />
              </Pressable>
            </ThemedView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: {
    flex: 1,
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  keyboardArea: { flex: 1 },
  searchHeader: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: Spacing.two,
  },
  searchField: {
    flex: 1,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(226,234,255,0.30)",
  },
  input: {
    flex: 1,
    minWidth: 0,
    color: "#e6e9ef",
    fontSize: 16,
    fontWeight: "400",
    paddingVertical: 8,
  },
  closeButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(226,234,255,0.30)",
  },
  closeButtonTouch: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  resultsScroll: { flex: 1 },
  results: { flexGrow: 1, gap: 4, paddingBottom: 24 },
  result: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  resultIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "#202633",
  },
  resultCopy: { flex: 1, minWidth: 0, gap: 2 },
  empty: { paddingTop: 18, textAlign: "center" },
  loader: { marginTop: 32 },
  error: { color: "#f85149", paddingTop: 12 },
});

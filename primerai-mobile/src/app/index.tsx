import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Share,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as SecureStore from "expo-secure-store";
import { File } from "expo-file-system";
import { Image } from "expo-image";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import {
  ArrowUp,
  Camera,
  ChevronDown,
  ChevronLeft,
  Copy,
  FileText,
  HatGlasses,
  Image as ImageIcon,
  Laptop,
  Menu,
  MoreVertical,
  Pin,
  Plus,
  Search,
  Share2,
  SquarePen,
  TextSelect,
  Trash2,
  X,
} from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetModalProvider,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import type { ChatMessage, Conversation } from "@primerai/shared";

import { ModelPicker } from "@/components/model-picker";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { api, type RemoteDevice } from "@/lib/api";
import { useSession } from "@/state/session";

/** o input cresce com o texto até este teto, em px */
const COMPOSER_MAX_HEIGHT = 160;
let anonymousMessageSequence = 0;
type Attachment = {
  name: string;
  text?: string;
  image?: { mimeType: string; data: string };
};

function nextAnonymousMessageId() {
  anonymousMessageSequence += 1;
  return `anonymous-${anonymousMessageSequence}`;
}

function pinnedConversationStorageKey(
  userId: string,
  platform: typeof Platform.OS,
) {
  return platform === "web"
    ? `primerai:pinned-conversations:${userId}`
    : `primerai_pinned_conversations_${userId}`;
}

export default function AgentScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { providers, session } = useSession();
  const { conversationId: requestedConversationId } = useLocalSearchParams<{
    conversationId?: string;
  }>();
  const accessToken = session?.accessToken;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [visibleConversationCount, setVisibleConversationCount] = useState(10);
  const [activeId, setActiveId] = useState<string | null>(
    requestedConversationId ?? null,
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [anonymous, setAnonymous] = useState(false);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [draftHeight, setDraftHeight] = useState(0);
  const [pendingModel, setPendingModel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [taskDevicePickerOpen, setTaskDevicePickerOpen] = useState(false);
  const [pcTaskMode, setPcTaskMode] = useState(false);
  const [onlineTaskDevices, setOnlineTaskDevices] = useState<RemoteDevice[]>(
    [],
  );
  const [taskBusy, setTaskBusy] = useState(false);
  const [taskNotice, setTaskNotice] = useState<string | null>(null);
  const [attachmentMenuPosition, setAttachmentMenuPosition] = useState<{
    left: number;
    bottom: number;
  } | null>(null);
  const plusButtonRef = useRef<View>(null);
  const previousActiveIdRef = useRef<string | null>(null);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);
  const [renameTarget, setRenameTarget] = useState<Conversation | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renaming, setRenaming] = useState(false);
  const renameInputRef = useRef<TextInput>(null);
  const [messageActionsTarget, setMessageActionsTarget] =
    useState<ChatMessage | null>(null);
  const [messageActionsPosition, setMessageActionsPosition] = useState<{
    top: number;
    right: number;
  } | null>(null);
  const messageRefs = useRef<Record<string, View | null>>({});
  const [selectionScreenMessage, setSelectionScreenMessage] =
    useState<ChatMessage | null>(null);
  const [conversationActionsTarget, setConversationActionsTarget] =
    useState<Conversation | null>(null);
  const [conversationActionsPosition, setConversationActionsPosition] =
    useState<{ top: number; right: number } | null>(null);
  const conversationMenuButtonRef = useRef<View>(null);
  const historyActionsSheetRef = useRef<BottomSheetModal>(null);
  const historyActionsSnapPoints = useMemo(() => [270], []);
  const openDrawerGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX(24)
        .failOffsetY([-18, 18])
        .onEnd((event) => {
          if (event.translationX > 80 || event.velocityX > 600) {
            runOnJS(setDrawerOpen)(true);
          }
        }),
    [],
  );
  const closeDrawerGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX(-24)
        .failOffsetY([-18, 18])
        .onEnd((event) => {
          if (event.translationX < -80 || event.velocityX < -600) {
            runOnJS(setDrawerOpen)(false);
          }
        }),
    [],
  );
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [pinnedIdsLoaded, setPinnedIdsLoaded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const key = pinnedConversationStorageKey(
      session?.user.id ?? "guest",
      Platform.OS,
    );
    const stored =
      Platform.OS === "web"
        ? Promise.resolve(globalThis.localStorage?.getItem(key) ?? null)
        : SecureStore.getItemAsync(key);
    void stored
      .then((value) => {
        if (!cancelled && value) {
          try {
            setPinnedIds(JSON.parse(value) as string[]);
          } catch {
            /* ignora dados locais inválidos */
          }
        }
      })
      .finally(() => {
        if (!cancelled) setPinnedIdsLoaded(true);
      });
    return () => {
      cancelled = true;
      setPinnedIdsLoaded(false);
    };
  }, [session?.user.id]);

  useEffect(() => {
    if (!pinnedIdsLoaded) return;
    const key = pinnedConversationStorageKey(
      session?.user.id ?? "guest",
      Platform.OS,
    );
    const value = JSON.stringify(pinnedIds);
    if (Platform.OS === "web") globalThis.localStorage?.setItem(key, value);
    else void SecureStore.setItemAsync(key, value);
  }, [pinnedIds, pinnedIdsLoaded, session?.user.id]);

  useEffect(() => {
    let cancelled = false;
    if (!accessToken) return;
    void api
      .listConversations(accessToken)
      .then((list) => {
        if (cancelled) return;
        setConversations(list);
        setActiveId((current) =>
          current && list.some((item) => item.id === current) ? current : null,
        );
        setError(null);
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof Error
              ? err.message
              : "não foi possível carregar o histórico",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!activeId || !accessToken) return;
    let cancelled = false;
    void api
      .listMessages(accessToken, activeId)
      .then((list) => {
        if (!cancelled) setMessages(list);
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof Error
              ? err.message
              : "não foi possível carregar a conversa",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [activeId, accessToken]);

  async function newConversation() {
    setError(null);
    try {
      const conversation = await api.createConversation(
        session!.accessToken,
        pendingModel ?? undefined,
      );
      setConversations((current) => [conversation, ...current]);
      setActiveId(conversation.id);
      setAnonymous(false);
      setMessages([]);
      setPendingModel(null);
      setDrawerOpen(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "não foi possível iniciar uma conversa",
      );
    }
  }

  function newAnonymousConversation() {
    previousActiveIdRef.current = activeId;
    setActiveId(null);
    setMessages([]);
    setAnonymous(true);
    setPendingModel(null);
    setDraft("");
    setError(null);
  }

  function leaveAnonymousConversation() {
    setAnonymous(false);
    setActiveId(previousActiveIdRef.current);
    previousActiveIdRef.current = null;
    setMessages([]);
    setPendingModel(null);
    setDraft("");
    setError(null);
  }

  async function chooseModel(model: string) {
    setModelPickerOpen(false);
    if (!active) {
      setPendingModel(model);
      return;
    }
    if (model === active.model) return;
    setError(null);
    try {
      const updated = await api.updateConversationModel(
        session!.accessToken,
        active.id,
        model,
      );
      setConversations((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "não foi possível trocar o modelo",
      );
    }
  }

  async function chooseConversation(conversation: Conversation) {
    setActiveId(conversation.id);
    setAnonymous(false);
    setMessages([]);
    setError(null);
    setDrawerOpen(false);
  }

  async function send() {
    const typedContent = draft.trim();
    const content = [
      typedContent,
      ...attachments
        .filter((a) => a.text)
        .map((a) => `Arquivo ${a.name}:\n${a.text}`),
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 19_500);
    if (!content || (!activeId && !anonymous) || busy) return;
    const images = attachments.flatMap((a) => (a.image ? [a.image] : []));
    if (
      images.length &&
      !supportsVision(
        active?.model ?? pendingModel ?? modelProvider?.defaultModel ?? "",
      )
    ) {
      setError(
        `O modelo ${modelLabel} não oferece suporte a imagens. Troque para um modelo com visão para enviar fotos.`,
      );
      return;
    }
    setDraft("");
    setAttachments([]);
    setBusy(true);
    setError(null);
    try {
      if (anonymous) {
        const turns = [
          ...messages.map(({ role, content: messageContent }) => ({
            role,
            content: messageContent,
          })),
          { role: "user" as const, content, images },
        ];
        const result = await api.sendAnonymousMessage(
          session!.accessToken,
          pendingModel ?? modelProvider?.defaultModel ?? undefined,
          turns,
        );
        const now = new Date().toISOString();
        const localId = nextAnonymousMessageId();
        setMessages((current) => [
          ...current,
          {
            id: `${localId}-user`,
            conversationId: "anonymous",
            role: "user",
            content,
            createdAt: now,
          },
          {
            id: `${localId}-assistant`,
            conversationId: "anonymous",
            role: "assistant",
            content: result.answer,
            createdAt: now,
          },
        ]);
        setPendingModel(result.model);
        return;
      }
      const saved = await api.sendMessage(
        session!.accessToken,
        activeId!,
        content,
        images,
      );
      setMessages((current) => [...current, ...saved]);
      setConversations(await api.listConversations(session!.accessToken));
    } catch (err) {
      setDraft(typedContent);
      setAttachments(attachments);
      setError(
        err instanceof Error
          ? err.message
          : "não foi possível enviar a mensagem",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyMessage(message: ChatMessage) {
    await Clipboard.setStringAsync(message.content);
    setMessageActionsTarget(null);
  }

  async function shareMessage(message: ChatMessage) {
    await Share.share({ message: message.content });
  }

  function editMessage(message: ChatMessage) {
    setDraft(message.content);
    setAttachments([]);
    setMessageActionsTarget(null);
  }

  async function deleteConversation() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await api.deleteConversation(session!.accessToken, deleteTarget.id);
      const remaining = conversations.filter(
        (item) => item.id !== deleteTarget.id,
      );
      setConversations(remaining);
      setPinnedIds((current) => current.filter((id) => id !== deleteTarget.id));
      if (activeId === deleteTarget.id) {
        setActiveId(remaining[0]?.id ?? null);
        setMessages([]);
      }
      setDeleteTarget(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "não foi possível apagar a conversa",
      );
    } finally {
      setDeleting(false);
    }
  }

  function dismissConversationActions() {
    historyActionsSheetRef.current?.dismiss();
    setConversationActionsTarget(null);
    setConversationActionsPosition(null);
  }

  function requestConversationRename() {
    if (!conversationActionsTarget) return;
    setRenameTarget(conversationActionsTarget);
    setRenameDraft(conversationActionsTarget.title);
    dismissConversationActions();
  }

  async function renameConversation() {
    const title = renameDraft.trim();
    if (!renameTarget || !title || renaming) return;
    setRenaming(true);
    setError(null);
    try {
      const updated = await api.updateConversationTitle(
        session!.accessToken,
        renameTarget.id,
        title,
      );
      setConversations((current) =>
        current.map((item) => item.id === updated.id ? updated : item),
      );
      setRenameTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "não foi possível renomear a conversa");
    } finally {
      setRenaming(false);
    }
  }

  function toggleConversationPin() {
    if (!conversationActionsTarget) return;
    const id = conversationActionsTarget.id;
    setPinnedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [id, ...current],
    );
    dismissConversationActions();
  }

  function requestConversationDelete() {
    if (!conversationActionsTarget) return;
    setDeleteTarget(conversationActionsTarget);
    dismissConversationActions();
  }

  function openHistoryConversationActions(conversation: Conversation) {
    setConversationActionsPosition(null);
    setConversationActionsTarget(conversation);
    requestAnimationFrame(() => historyActionsSheetRef.current?.present());
  }

  const active = conversations.find(
    (conversation) => conversation.id === activeId,
  );
  const displayedConversations = [...conversations]
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
    .slice(0, visibleConversationCount)
    .sort((a, b) => {
      const aPinnedIndex = pinnedIds.indexOf(a.id);
      const bPinnedIndex = pinnedIds.indexOf(b.id);
      if (aPinnedIndex === -1) return bPinnedIndex === -1 ? 0 : 1;
      if (bPinnedIndex === -1) return -1;
      return aPinnedIndex - bPinnedIndex;
    });
  const modelProvider =
    providers.find((provider) => provider.id === active?.providerId) ??
    providers.find((provider) => provider.isDefault) ??
    providers[0];
  const modelLabel = active?.model ?? pendingModel ?? "Modelo";

  function supportsVision(model: string) {
    return /gpt-4|gpt-5|gemini|claude|llava|qwen.*vl|pixtral|vision/i.test(
      model,
    );
  }

  async function chooseAttachment(kind: "camera" | "photos" | "file") {
    setAttachmentMenuOpen(false);
    setError(null);
    try {
      if (kind === "camera" || kind === "photos") {
        const result =
          kind === "camera"
            ? await ImagePicker.launchCameraAsync({
                mediaTypes: ["images"],
                quality: 0.8,
                base64: true,
              })
            : await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ["images"],
                quality: 0.8,
                base64: true,
                allowsMultipleSelection: true,
                selectionLimit: 4,
              });
        if (result.canceled) return;
        const chosen = result.assets.slice(
          0,
          Math.max(0, 4 - attachments.filter((a) => a.image).length),
        );
        if (chosen.some((asset) => !asset.base64))
          throw new Error("Não foi possível carregar uma das imagens.");
        if (chosen.some((asset) => asset.base64!.length > 4_000_000))
          throw new Error(
            "A imagem é muito grande. Escolha uma imagem menor que 3 MB.",
          );
        setAttachments((current) => [
          ...current,
          ...chosen.map((asset) => ({
            name: asset.fileName ?? "foto",
            image: {
              mimeType: asset.mimeType ?? "image/jpeg",
              data: asset.base64!,
            },
          })),
        ]);
        return;
      }
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/*", "application/json", "application/pdf"],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const picked = await Promise.all(
        result.assets.map(async (asset) => {
          const ext = asset.name.split(".").pop()?.toLowerCase();
          if (asset.mimeType === "application/pdf" || ext === "pdf")
            throw new Error(
              "PDF ainda não pode ser lido neste chat. Anexe arquivos de texto, CSV ou JSON.",
            );
          if (
            !/^(text\/|application\/(json|xml))/.test(asset.mimeType ?? "") &&
            !/\.(txt|md|csv|json|xml)$/i.test(asset.name)
          )
            throw new Error(`Formato não suportado: ${asset.name}`);
          if ((asset.size ?? 0) > 250_000)
            throw new Error(`${asset.name} ultrapassa o limite de 250 KB.`);
          return {
            name: asset.name,
            text: (await new File(asset.uri).text()).slice(0, 16_000),
          };
        }),
      );
      setAttachments((current) => [...current, ...picked]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Não foi possível abrir o anexo.",
      );
    }
  }

  async function requestPcTask() {
    setAttachmentMenuOpen(false);
    setError(null);
    setTaskNotice(null);
    const prompt = draft.trim();
    if (!prompt) {
      setError("Descreva o que você quer que o PC faça.");
      return;
    }
    if (prompt.length > 8_000) {
      setError("As tarefas do PC aceitam até 8.000 caracteres.");
      return;
    }
    try {
      const devices = (await api.listDevices(session!.accessToken)).filter(
        (device) => device.kind === "desktop" && device.status === "online",
      );
      if (!devices.length)
        throw new Error(
          "Nenhum PC está online. Abra o PrimerAI Desktop e tente novamente.",
        );
      if (devices.length > 1) {
        setOnlineTaskDevices(devices);
        setTaskDevicePickerOpen(true);
        return;
      }
      await dispatchPcTask(devices[0]!);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "não foi possível enviar a tarefa ao PC",
      );
    }
  }

  async function dispatchPcTask(device: RemoteDevice) {
    if (taskBusy || !draft.trim()) return;
    setTaskBusy(true);
    setError(null);
    try {
      await api.createTask(session!.accessToken, device.id, draft.trim());
      setDraft("");
      setPcTaskMode(false);
      setTaskNotice(`Tarefa enviada para ${device.name}. Acompanhe em Remote.`);
      setTaskDevicePickerOpen(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "não foi possível enviar a tarefa ao PC",
      );
    } finally {
      setTaskBusy(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <View style={[styles.header, { top: insets.top }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Abrir histórico"
            style={({ pressed }) => [
              styles.headerIconButtonPremium,
              pressed && styles.headerIconButtonPremiumPressed,
            ]}
            onPress={() => setDrawerOpen(true)}
          >
            <Menu size={24} color="#f2f5ff" />
          </Pressable>
          {!active || anonymous ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                anonymous
                  ? "Sair da conversa anônima"
                  : "Criar conversa anônima"
              }
              style={({ pressed }) => [
                styles.headerIconButtonPremium,
                pressed && styles.headerIconButtonPremiumPressed,
              ]}
              onPress={
                anonymous
                  ? leaveAnonymousConversation
                  : newAnonymousConversation
              }
            >
              {anonymous ? (
                <X size={24} color="#f2f5ff" />
              ) : (
                <HatGlasses size={24} color="#f2f5ff" />
              )}
            </Pressable>
          ) : null}
          {active && !anonymous ? (
            <View style={styles.headerActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Nova conversa"
                style={({ pressed }) => [
                  styles.headerActionButton,
                  pressed && styles.headerActionButtonPressed,
                ]}
                onPress={() => void newConversation()}
              >
                <SquarePen size={24} color="#f2f5ff" />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Opções da conversa"
                ref={conversationMenuButtonRef}
                style={({ pressed }) => [
                  styles.headerActionButton,
                  pressed && styles.headerActionButtonPressed,
                ]}
                onPress={() =>
                  conversationMenuButtonRef.current?.measureInWindow(
                    (x, y, width, height) => {
                      setConversationActionsPosition({
                        top: insets.top + 56 + 16,
                        right: Math.max(
                          8,
                          Dimensions.get("window").width - x - width,
                        ),
                      });
                      setConversationActionsTarget(active);
                    },
                  )
                }
              >
                <MoreVertical size={24} color="#f2f5ff" />
              </Pressable>
            </View>
          ) : null}
        </View>

        {error && <ThemedText style={styles.error}>{error}</ThemedText>}

        <KeyboardAvoidingView
          style={styles.chatArea}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
        >
          <ScrollView
            contentContainerStyle={styles.messageList}
            keyboardShouldPersistTaps="handled"
          >
            {loading ? (
              <ActivityIndicator />
            ) : messages.length === 0 ? (
              <View style={styles.welcome}>
                <ThemedText type="title">O que vamos fazer?</ThemedText>
                <ThemedText
                  themeColor="textSecondary"
                  style={styles.welcomeCopy}
                >
                  {anonymous
                    ? "Esta conversa não será salva no histórico."
                    : "Envie uma mensagem para conversar com seu modelo de IA. Seus chats ficam salvos no histórico."}
                </ThemedText>
              </View>
            ) : (
              messages.map((message) => (
                <Pressable
                  key={message.id}
                  ref={(node) => {
                    messageRefs.current[message.id] = node;
                  }}
                  onLongPress={() => {
                    if (message.role !== "user") return;
                    messageRefs.current[message.id]?.measureInWindow(
                      (x, y, width, height) => {
                        const menuHeight = 3 * 48 + 12;
                        const below = y + height + 6;
                        setMessageActionsPosition({
                          top:
                            below + menuHeight <=
                            Dimensions.get("window").height
                              ? below
                              : Math.max(8, y - menuHeight - 6),
                          right: Math.max(
                            8,
                            Dimensions.get("window").width - x - width,
                          ),
                        });
                        setMessageActionsTarget(message);
                      },
                    );
                  }}
                  delayLongPress={350}
                  accessibilityRole={
                    message.role === "user" ? "button" : undefined
                  }
                  accessibilityLabel={
                    message.role === "user"
                      ? "Opções da sua mensagem"
                      : undefined
                  }
                  style={[
                    styles.message,
                    message.role === "user"
                      ? styles.userMessage
                      : styles.assistantMessage,
                  ]}
                >
                  <ThemedText type="smallBold">
                    {message.role === "user" ? "Você" : "IA"}
                  </ThemedText>
                  <ThemedText
                    style={styles.messageContent}
                  >
                    {message.content}
                  </ThemedText>
                  {message.role === "assistant" && (
                    <View style={styles.assistantMessageActions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Copiar resposta"
                        hitSlop={8}
                        style={styles.assistantMessageAction}
                        onPress={() => void copyMessage(message)}
                      >
                        <Copy size={18} color="#aeb7c8" />
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Compartilhar resposta"
                        hitSlop={8}
                        style={styles.assistantMessageAction}
                        onPress={() => void shareMessage(message)}
                      >
                        <Share2 size={18} color="#aeb7c8" />
                      </Pressable>
                    </View>
                  )}
                </Pressable>
              ))
            )}
            {busy && (
              <ThemedText themeColor="textSecondary">
                A IA está respondendo…
              </ThemedText>
            )}
          </ScrollView>

          <Modal
            visible={!!messageActionsTarget}
            transparent
            animationType="fade"
            statusBarTranslucent
            onRequestClose={() => setMessageActionsTarget(null)}
          >
            <View style={styles.messageActionsBackdrop}>
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={() => setMessageActionsTarget(null)}
              />
              {messageActionsPosition && (
                <ThemedView
                  type="backgroundElement"
                  style={[styles.messageActionsSheet, messageActionsPosition]}
                >
                  <Pressable
                    accessibilityRole="button"
                    style={styles.messageAction}
                    onPress={() =>
                      messageActionsTarget &&
                      void copyMessage(messageActionsTarget)
                    }
                  >
                    <Copy size={20} color="#e6e9ef" />
                    <ThemedText>Copiar</ThemedText>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.messageAction}
                    onPress={() => {
                      setSelectionScreenMessage(messageActionsTarget);
                      setMessageActionsTarget(null);
                    }}
                  >
                    <TextSelect size={20} color="#e6e9ef" />
                    <ThemedText>Selecionar texto</ThemedText>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.messageAction}
                    onPress={() =>
                      messageActionsTarget && editMessage(messageActionsTarget)
                    }
                  >
                    <SquarePen size={20} color="#e6e9ef" />
                    <ThemedText>Editar mensagem</ThemedText>
                  </Pressable>
                </ThemedView>
              )}
            </View>
          </Modal>

          <Modal
            visible={Boolean(selectionScreenMessage)}
            animationType="slide"
            statusBarTranslucent
            onRequestClose={() => setSelectionScreenMessage(null)}
          >
            <ThemedView style={styles.textSelectionScreen}>
              <View
                style={[
                  styles.textSelectionHeader,
                  { paddingTop: insets.top + 8 },
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Voltar para a conversa"
                  hitSlop={10}
                  style={({ pressed }) => [
                    styles.textSelectionBack,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor: theme.backgroundSelected,
                    },
                    pressed && styles.textSelectionBackPressed,
                  ]}
                  onPress={() => setSelectionScreenMessage(null)}
                >
                  <ChevronLeft size={22} color={theme.text} />
                </Pressable>
                <View style={styles.textSelectionHeading}>
                  <ThemedText
                    numberOfLines={1}
                    style={styles.textSelectionTitle}
                  >
                    Selecionar texto
                  </ThemedText>
                </View>
              </View>
              <ScrollView
                style={styles.textSelectionBody}
                contentContainerStyle={styles.textSelectionBodyContent}
                showsVerticalScrollIndicator={false}
              >
                <ThemedText selectable style={styles.textSelectionCopy}>
                  {selectionScreenMessage?.content}
                </ThemedText>
              </ScrollView>
              <View style={{ height: insets.bottom }} />
            </ThemedView>
          </Modal>

          <ThemedView type="backgroundElement" style={styles.composer}>
            {pcTaskMode && (
              <View style={styles.pcTaskModeRow}>
                <View style={styles.pcTaskModeBadge}>
                  <Laptop size={16} color="#c8d2e8" />
                  <ThemedText type="smallBold">Executar no PC</ThemedText>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Voltar para mensagem do chat"
                  hitSlop={8}
                  onPress={() => {
                    setPcTaskMode(false);
                    setError(null);
                  }}
                >
                  <X size={18} color="#8b94a5" />
                </Pressable>
              </View>
            )}
            {attachments.length > 0 && (
              <View style={styles.attachmentChips}>
                {attachments.map((item, index) => (
                  <View
                    key={`${item.name}-${index}`}
                    style={
                      item.image
                        ? styles.imageAttachment
                        : styles.fileAttachment
                    }
                  >
                    {item.image ? (
                      <Image
                        accessibilityLabel={`Imagem anexada: ${item.name}`}
                        source={{
                          uri: `data:${item.image.mimeType};base64,${item.image.data}`,
                        }}
                        contentFit="cover"
                        style={styles.attachmentPreview}
                      />
                    ) : (
                      <ThemedText
                        type="small"
                        numberOfLines={1}
                        style={styles.attachmentFileName}
                      >
                        {item.name}
                      </ThemedText>
                    )}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remover anexo ${item.name}`}
                      hitSlop={8}
                      onPress={() =>
                        setAttachments((all) =>
                          all.filter((_, i) => i !== index),
                        )
                      }
                      style={styles.removeAttachment}
                    >
                      <X size={13} color="#fff" />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onContentSizeChange={(event) => {
                if (!draft.trim()) {
                  setDraftHeight(0);
                  return;
                }
                setDraftHeight(
                  Math.min(
                    event.nativeEvent.contentSize.height,
                    COMPOSER_MAX_HEIGHT,
                  ),
                );
              }}
              placeholder={
                pcTaskMode
                  ? "Descreva o que você quer que o PC faça…"
                  : activeId || anonymous
                  ? "Escreva sua mensagem…"
                  : "Escreva uma mensagem…"
              }
              placeholderTextColor="#8b94a5"
              editable={!busy && !taskBusy}
              multiline
              maxLength={20_000}
              style={[
                styles.input,
                { height: draft.trim() ? Math.max(draftHeight, 60) : 60 },
              ]}
            />
            <View style={styles.composerBar}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Nova conversa"
                hitSlop={8}
                ref={plusButtonRef}
                style={styles.barButton}
                onPress={() =>
                  plusButtonRef.current?.measureInWindow((x, y) => {
                    setAttachmentMenuPosition({
                      left: x,
                      bottom: Math.max(
                        0,
                        Dimensions.get("window").height - y + 8,
                      ),
                    });
                    setAttachmentMenuOpen(true);
                  })
                }
              >
                <Plus size={20} color="#e6e9ef" />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Modelo: ${modelLabel}`}
                disabled={!modelProvider}
                style={[
                  styles.modelButton,
                  !modelProvider && styles.sendDisabled,
                ]}
                onPress={() => setModelPickerOpen(true)}
              >
                <ThemedText
                  type="small"
                  numberOfLines={1}
                  style={styles.modelLabel}
                >
                  {modelLabel}
                </ThemedText>
                <ChevronDown size={16} color="#8b94a5" />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Enviar mensagem"
                disabled={
                  pcTaskMode
                    ? !draft.trim() || taskBusy
                    : (!activeId && !anonymous) || !draft.trim() || busy
                }
                onPress={() =>
                  pcTaskMode ? void requestPcTask() : void send()
                }
                style={[
                  styles.sendButton,
                  (pcTaskMode
                    ? !draft.trim() || taskBusy
                    : (!activeId && !anonymous) || !draft.trim() || busy) &&
                    styles.sendDisabled,
                ]}
              >
                {pcTaskMode ? (
                  <Laptop size={19} color="#0d0f14" />
                ) : (
                  <ArrowUp size={20} color="#0d0f14" />
                )}
              </Pressable>
            </View>
            {taskNotice && (
              <ThemedText themeColor="textSecondary" type="small">
                {taskNotice}
              </ThemedText>
            )}
          </ThemedView>
        </KeyboardAvoidingView>

        {!drawerOpen && (
          <GestureDetector gesture={openDrawerGesture}>
            <View
              pointerEvents="box-only"
              style={[
                styles.drawerOpenGestureArea,
                { top: insets.top + 56, bottom: insets.bottom },
              ]}
            />
          </GestureDetector>
        )}

        <ModelPicker
          visible={modelPickerOpen}
          provider={modelProvider}
          selected={active?.model}
          accessToken={accessToken}
          onClose={() => setModelPickerOpen(false)}
          onSelect={(model) => void chooseModel(model)}
        />

        <Modal
          visible={attachmentMenuOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setAttachmentMenuOpen(false)}
        >
          <View style={styles.attachmentBackdrop}>
            <Pressable
              style={styles.attachmentBackdropTouch}
              accessibilityRole="button"
              accessibilityLabel="Fechar opções de anexo"
              onPress={() => setAttachmentMenuOpen(false)}
            />
            <ThemedView
              type="backgroundElement"
              style={[
                styles.attachmentSheet,
                attachmentMenuPosition ?? undefined,
              ]}
            >
              <View style={styles.attachmentOptions}>
                <Pressable
                  style={styles.attachmentOption}
                  onPress={() => void chooseAttachment("camera")}
                >
                  <View style={styles.attachmentOptionIcon}>
                    <Camera size={24} color="#c8d2e8" />
                  </View>
                  <ThemedText style={styles.attachmentOptionLabel}>
                    Câmera
                  </ThemedText>
                </Pressable>
                <Pressable
                  style={styles.attachmentOption}
                  onPress={() => void chooseAttachment("photos")}
                >
                  <View style={styles.attachmentOptionIcon}>
                    <ImageIcon size={24} color="#c8d2e8" />
                  </View>
                  <ThemedText style={styles.attachmentOptionLabel}>
                    Fotos
                  </ThemedText>
                </Pressable>
                <Pressable
                  style={styles.attachmentOption}
                  onPress={() => void chooseAttachment("file")}
                >
                  <View style={styles.attachmentOptionIcon}>
                    <FileText size={24} color="#c8d2e8" />
                  </View>
                  <ThemedText style={styles.attachmentOptionLabel}>
                    Arquivos
                  </ThemedText>
                </Pressable>
                <Pressable
                  style={styles.attachmentOption}
                  disabled={taskBusy}
                  onPress={() => {
                    setAttachmentMenuOpen(false);
                    setPcTaskMode(true);
                    setError(null);
                    setTaskNotice(null);
                  }}
                >
                  <View style={styles.attachmentOptionIcon}>
                    <Laptop size={24} color="#c8d2e8" />
                  </View>
                  <ThemedText style={styles.attachmentOptionLabel}>
                    {taskBusy ? "Enviando…" : "Executar no PC"}
                  </ThemedText>
                </Pressable>
              </View>
            </ThemedView>
          </View>
        </Modal>

        <Modal
          visible={taskDevicePickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setTaskDevicePickerOpen(false)}
        >
          <View style={styles.confirmBackdrop}>
            <ThemedView type="backgroundElement" style={styles.confirmCard}>
              <ThemedText type="smallBold">Em qual PC?</ThemedText>
              {onlineTaskDevices.map((device) => (
                <Pressable
                  key={device.id}
                  disabled={taskBusy}
                  style={styles.taskDeviceOption}
                  onPress={() => void dispatchPcTask(device)}
                >
                  <Laptop size={18} color="#c8d2e8" />
                  <View style={{ flex: 1 }}>
                    <ThemedText type="smallBold">{device.name}</ThemedText>
                    <ThemedText themeColor="textSecondary" type="small">
                      {device.platform}
                    </ThemedText>
                  </View>
                </Pressable>
              ))}
              <Pressable
                style={styles.cancelButton}
                onPress={() => setTaskDevicePickerOpen(false)}
              >
                <ThemedText themeColor="textSecondary">Cancelar</ThemedText>
              </Pressable>
            </ThemedView>
          </View>
        </Modal>

        <Modal
          visible={drawerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setDrawerOpen(false)}
        >
          <GestureHandlerRootView style={styles.bottomSheetGestureRoot}>
            <BottomSheetModalProvider>
              <View style={styles.drawerBackdrop}>
                <Pressable
                  style={styles.backdropTouch}
                  onPress={() => setDrawerOpen(false)}
                />
                <GestureDetector gesture={closeDrawerGesture}>
                  <ThemedView
                    type="backgroundElement"
                    style={[
                      styles.drawer,
                      {
                        paddingTop: Math.max(0, insets.top - 12),
                        paddingBottom: Math.max(0, insets.bottom - 12),
                        paddingLeft: Math.max(18, insets.left + 18),
                        paddingRight: Math.max(18, insets.right + 18),
                      },
                    ]}
                  >
                    <View style={styles.drawerHead}>
                      <ThemedText type="small" style={styles.drawerBrand}>
                        PrimerAi
                      </ThemedText>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Fechar histórico"
                        hitSlop={10}
                        onPress={() => setDrawerOpen(false)}
                      >
                        <X size={24} color="#aeb7c8" />
                      </Pressable>
                    </View>
                    <Pressable
                      style={styles.newChatButton}
                      onPress={() => void newConversation()}
                    >
                      <View style={styles.newChatIcon}>
                        <SquarePen size={24} color="#f4f6ff" />
                      </View>
                      <ThemedText>Novo chat</ThemedText>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Buscar conversas"
                      style={styles.searchLink}
                      onPress={() => {
                        setDrawerOpen(false);
                        router.push("/search");
                      }}
                    >
                      <Search size={24} color="#c8d2e8" />
                      <ThemedText>Buscar conversas</ThemedText>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Abrir o Remote"
                      style={styles.remoteLink}
                      onPress={() => {
                        setDrawerOpen(false);
                        router.push("/remote");
                      }}
                    >
                      <Laptop size={24} color="#c8d2e8" />
                      <ThemedText>Remote</ThemedText>
                    </Pressable>
                    <View style={styles.drawerDivider} />
                    <ScrollView
                      style={styles.historyList}
                      contentContainerStyle={styles.historyListContent}
                    >
                      {displayedConversations.map((conversation) => (
                        <View
                          key={conversation.id}
                          style={[
                            styles.historyItem,
                            activeId === conversation.id &&
                              styles.historyActive,
                          ]}
                        >
                          <Pressable
                            style={styles.historySelect}
                            onPress={() =>
                              void chooseConversation(conversation)
                            }
                            onLongPress={() => {
                              openHistoryConversationActions(conversation);
                            }}
                            delayLongPress={450}
                          >
                            <ThemedText numberOfLines={1}>
                              {conversation.title}
                            </ThemedText>
                            <ThemedText
                              themeColor="textSecondary"
                              type="small"
                              numberOfLines={1}
                            >
                              {conversation.model}
                            </ThemedText>
                          </Pressable>
                        </View>
                      ))}
                      {conversations.length > visibleConversationCount && (
                        <Pressable
                          accessibilityRole="button"
                          style={styles.loadMoreConversations}
                          onPress={() =>
                            setVisibleConversationCount((count) => count + 10)
                          }
                        >
                          <ThemedText style={styles.loadMoreConversationsLabel}>
                            Ver mais conversas
                          </ThemedText>
                        </Pressable>
                      )}
                      {conversations.length === 0 && (
                        <ThemedText themeColor="textSecondary">
                          Seu histórico aparecerá aqui.
                        </ThemedText>
                      )}
                    </ScrollView>
                    <View style={styles.accountRow}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Abrir configurações"
                        style={styles.avatar}
                        onPress={() => {
                          setDrawerOpen(false);
                          router.push("/settings");
                        }}
                      >
                        <ThemedText style={styles.avatarLetter}>
                          {session?.user.email
                            ?.trim()
                            .charAt(0)
                            .toUpperCase() || "?"}
                        </ThemedText>
                      </Pressable>
                      <View style={styles.accountCopy}>
                        <ThemedText type="smallBold" numberOfLines={1}>
                          Sua conta
                        </ThemedText>
                        <ThemedText
                          themeColor="textSecondary"
                          type="small"
                          numberOfLines={1}
                        >
                          {session?.user.email ?? ""}
                        </ThemedText>
                      </View>
                    </View>
                  </ThemedView>
                </GestureDetector>
              </View>
              <BottomSheetModal
                ref={historyActionsSheetRef}
                snapPoints={historyActionsSnapPoints}
                enableDynamicSizing={false}
                enablePanDownToClose
                enableHandlePanningGesture
                backdropComponent={(props) => (
                  <BottomSheetBackdrop
                    {...props}
                    appearsOnIndex={0}
                    disappearsOnIndex={-1}
                    opacity={0.48}
                    pressBehavior="close"
                  />
                )}
                backgroundStyle={styles.historyActionsSheetBackground}
                handleIndicatorStyle={styles.historyActionsHandle}
                onDismiss={() => setConversationActionsTarget(null)}
              >
                <BottomSheetView style={styles.historyActionsContent}>
                  <View style={styles.historyActionsHeader}>
                    <ThemedText
                      type="smallBold"
                      numberOfLines={2}
                      ellipsizeMode="tail"
                      style={styles.historyActionsTitle}
                    >
                      {conversationActionsTarget?.title}
                    </ThemedText>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Fechar opções da conversa"
                      hitSlop={8}
                      style={styles.historyActionsClose}
                      onPress={dismissConversationActions}
                    >
                      <X size={22} color="#c8d2e8" />
                    </Pressable>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.conversationAction}
                    onPress={requestConversationRename}
                  >
                    <SquarePen size={24} color="#c8d2e8" />
                    <ThemedText style={styles.conversationActionLabel}>
                      Renomear
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.conversationAction}
                    onPress={toggleConversationPin}
                  >
                    <Pin size={24} color="#c8d2e8" />
                    <ThemedText style={styles.conversationActionLabel}>
                      {pinnedIds.includes(conversationActionsTarget?.id ?? "")
                        ? "Desafixar"
                        : "Fixar"}
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.conversationAction}
                    onPress={requestConversationDelete}
                  >
                    <Trash2 size={24} color="#c8d2e8" />
                    <ThemedText style={styles.conversationActionLabel}>
                      Apagar
                    </ThemedText>
                  </Pressable>
                </BottomSheetView>
              </BottomSheetModal>
            </BottomSheetModalProvider>
          </GestureHandlerRootView>
        </Modal>

        <Modal
          visible={Boolean(
            conversationActionsTarget && conversationActionsPosition,
          )}
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => {
            dismissConversationActions();
          }}
        >
          <View style={styles.conversationActionsBackdrop}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={dismissConversationActions}
            />
            <ThemedView
              type="backgroundElement"
              style={[
                styles.actionsCard,
                styles.actionsPopover,
                conversationActionsPosition ?? undefined,
              ]}
            >
              <ThemedText
                type="smallBold"
                numberOfLines={2}
                ellipsizeMode="tail"
              >
                {conversationActionsTarget?.title}
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                style={styles.conversationAction}
                onPress={toggleConversationPin}
              >
                <Pin size={20} color="#c8d2e8" />
                <ThemedText style={styles.conversationActionLabel}>
                  {pinnedIds.includes(conversationActionsTarget?.id ?? "")
                    ? "Desafixar"
                    : "Fixar"}
                </ThemedText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={styles.conversationAction}
                onPress={requestConversationDelete}
              >
                <Trash2 size={20} color="#c8d2e8" />
                <ThemedText style={styles.conversationActionLabel}>
                  Apagar
                </ThemedText>
              </Pressable>
            </ThemedView>
          </View>
        </Modal>

        <Modal
          visible={Boolean(renameTarget)}
          transparent
          animationType="fade"
          onShow={() => {
            requestAnimationFrame(() => {
              setTimeout(() => renameInputRef.current?.focus(), 100);
            });
          }}
          onRequestClose={() => !renaming && setRenameTarget(null)}
        >
          <View style={styles.confirmBackdrop}>
            <ThemedView type="backgroundElement" style={styles.confirmCard}>
              <ThemedText type="smallBold">Renomear conversa</ThemedText>
              <TextInput
                ref={renameInputRef}
                maxLength={120}
                placeholder="Nome da conversa"
                placeholderTextColor="#8791a5"
                returnKeyType="done"
                value={renameDraft}
                onChangeText={setRenameDraft}
                onSubmitEditing={() => void renameConversation()}
                style={styles.renameInput}
              />
              <View style={styles.confirmActions}>
                <Pressable
                  disabled={renaming}
                  onPress={() => setRenameTarget(null)}
                  style={styles.cancelButton}
                >
                  <ThemedText>Cancelar</ThemedText>
                </Pressable>
                <Pressable
                  disabled={renaming || !renameDraft.trim()}
                  onPress={() => void renameConversation()}
                  style={styles.renameButton}
                >
                  <ThemedText style={styles.deleteLabel}>
                    {renaming ? "Salvando…" : "Salvar"}
                  </ThemedText>
                </Pressable>
              </View>
            </ThemedView>
          </View>
        </Modal>

        <Modal
          visible={Boolean(deleteTarget)}
          transparent
          animationType="fade"
          onRequestClose={() => !deleting && setDeleteTarget(null)}
        >
          <View style={styles.confirmBackdrop}>
            <ThemedView type="backgroundElement" style={styles.confirmCard}>
              <ThemedText type="smallBold">Apagar conversa?</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.confirmCopy}>
                “{deleteTarget?.title}” e todas as mensagens serão apagadas
                permanentemente.
              </ThemedText>
              <View style={styles.confirmActions}>
                <Pressable
                  disabled={deleting}
                  onPress={() => setDeleteTarget(null)}
                  style={styles.cancelButton}
                >
                  <ThemedText>Cancelar</ThemedText>
                </Pressable>
                <Pressable
                  disabled={deleting}
                  onPress={() => void deleteConversation()}
                  style={styles.deleteButton}
                >
                  <ThemedText style={styles.deleteLabel}>
                    {deleting ? "Apagando…" : "Apagar"}
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
  container: { flex: 1 },
  safe: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
    maxWidth: MaxContentWidth,
    width: "100%",
    alignSelf: "center",
  },
  header: {
    position: "absolute",
    left: Spacing.three,
    right: Spacing.three,
    zIndex: 2,
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "transparent",
  },
  headerButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#252b38",
  },
  headerActionButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
  },
  headerActionButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.95 }],
  },
  headerIconButtonPremium: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "rgba(122,138,180,0.22)",
    borderWidth: 1,
    borderColor: "rgba(226,234,255,0.30)",
    shadowColor: "#05070c",
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  headerIconButtonPremiumPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.95 }],
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    padding: 3,
    borderRadius: 999,
    backgroundColor: "rgba(122,138,180,0.22)",
    borderWidth: 1,
    borderColor: "rgba(226,234,255,0.30)",
    shadowColor: "#05070c",
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  chatArea: { flex: 1 },
  drawerOpenGestureArea: {
    position: "absolute",
    left: 0,
    width: 28,
    zIndex: 3,
  },
  messageList: {
    flexGrow: 1,
    justifyContent: "flex-end",
    gap: 12,
    paddingTop: 84,
    paddingBottom: 12,
  },
  welcome: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    gap: 12,
  },
  welcomeCopy: { textAlign: "center", lineHeight: 21 },
  message: { maxWidth: "90%", padding: 12, borderRadius: 14, gap: 5 },
  userMessage: { alignSelf: "flex-end", backgroundColor: "#243050" },
  assistantMessage: { alignSelf: "flex-start", backgroundColor: "#161a22" },
  messageContent: { lineHeight: 21 },
  textSelectionScreen: { flex: 1, backgroundColor: "#0d1017" },
  textSelectionHeader: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  textSelectionBack: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    borderWidth: 1,
  },
  textSelectionBackPressed: { opacity: 0.75, transform: [{ scale: 0.96 }] },
  textSelectionHeading: { flex: 1, gap: 2 },
  textSelectionTitle: { fontSize: 22, fontWeight: "500" },
  textSelectionBody: { flex: 1 },
  textSelectionBodyContent: { padding: 20 },
  textSelectionCopy: { fontSize: 16, lineHeight: 25 },
  assistantMessageActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    marginTop: 5,
  },
  assistantMessageAction: {
    minWidth: 28,
    minHeight: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  messageActionsBackdrop: { flex: 1 },
  messageActionsSheet: {
    position: "absolute",
    minWidth: 200,
    padding: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#343a47",
    gap: 0,
    elevation: 12,
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  messageAction: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 10,
  },
  composer: {
    gap: Spacing.two,
    padding: 10,
    marginBottom: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(226,234,255,0.30)",
  },
  attachmentChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 4,
  },
  imageAttachment: {
    width: 100,
    height: 100,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#252b38",
  },
  attachmentPreview: { width: "100%", height: "100%" },
  fileAttachment: {
    maxWidth: 180,
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingRight: 34,
    borderRadius: 18,
    backgroundColor: "#252b38",
  },
  attachmentFileName: { maxWidth: 140 },
  removeAttachment: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.68)",
  },
  input: {
    minHeight: 60,
    maxHeight: COMPOSER_MAX_HEIGHT,
    paddingHorizontal: 4,
    paddingVertical: 8,
    color: "#e6e9ef",
    fontSize: 16,
    fontWeight: "400",
    textAlignVertical: "top",
  },
  composerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: Spacing.two,
  },
  pcTaskModeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  pcTaskModeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#272d3d",
  },
  barButton: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#272d3d",
  },
  modelButton: {
    height: 38,
    flexShrink: 1,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 4,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "#272d3d",
    maxWidth: "65%",
  },
  modelLabel: { flexShrink: 1 },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: "auto",
    backgroundColor: "#6f8cff",
  },
  sendDisabled: { opacity: 0.45 },
  error: { color: "#f85149", paddingVertical: 6 },
  attachmentBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.18)" },
  attachmentBackdropTouch: StyleSheet.absoluteFill,
  attachmentSheet: {
    position: "absolute",
    width: 270,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#343a47",
    elevation: 12,
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  attachmentOptions: { gap: 2 },
  attachmentOption: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 4,
  },
  attachmentOptionIcon: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  attachmentOptionLabel: { fontSize: 16, fontWeight: "500" },
  taskDeviceOption: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "#202631",
  },
  drawerBackdrop: {
    flex: 1,
    flexDirection: "row-reverse",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  backdropTouch: { flex: 1 },
  drawer: { width: "100%", height: "100%", backgroundColor: "#000000" },
  drawerHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 20,
    paddingHorizontal: 16,
  },
  drawerBrand: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
  newChatButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    marginBottom: 4,
    borderRadius: 12,
  },
  newChatIcon: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  newChatLabel: { color: "#e6e9ef", fontWeight: "500" },
  searchLink: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
    borderRadius: 12,
  },
  remoteLink: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  drawerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#343a47",
    marginTop: 16,
    marginBottom: 4,
  },
  historyList: { flex: 1, paddingTop: 12 },
  historyListContent: { paddingBottom: 24 },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingTop: 14,
    paddingHorizontal: 16,
    marginTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#343a47",
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#343f59",
    borderWidth: 1,
    borderColor: "#566482",
  },
  avatarLetter: { color: "#f0f3fb", fontWeight: "700", fontSize: 16 },
  accountCopy: { flex: 1, minWidth: 0, gap: 2 },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 11,
    borderRadius: 10,
    marginBottom: 5,
  },
  loadMoreConversations: {
    alignItems: "center",
    paddingVertical: 12,
    marginTop: 2,
  },
  loadMoreConversationsLabel: { color: "#aebde0", fontWeight: "600" },
  historySelect: { flex: 1, minWidth: 0, paddingVertical: 11, gap: 4 },
  actionsCard: {
    borderRadius: 14,
    padding: 18,
    gap: 8,
  },
  conversationActionsBackdrop: { flex: 1 },
  actionsPopover: {
    position: "absolute",
    width: 270,
    padding: 10,
    borderWidth: 1,
    borderColor: "#343a47",
    gap: 4,
    elevation: 12,
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    borderRadius: 16,
  },
  historyActionsSheetBackground: {
    backgroundColor: "#161a22",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  historyActionsHandle: { width: 40, backgroundColor: "#657087" },
  historyActionsContent: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 8,
  },
  bottomSheetGestureRoot: { flex: 1 },
  historyActionsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  historyActionsTitle: { flex: 1 },
  historyActionsClose: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  conversationAction: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 8,
  },
  conversationActionLabel: { fontSize: 16, fontWeight: "500" },
  historyActive: { backgroundColor: "#243050" },
  confirmBackdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  confirmCard: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 14,
    padding: 18,
    gap: 14,
  },
  confirmCopy: { lineHeight: 21 },
  confirmActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  cancelButton: { paddingHorizontal: 12, paddingVertical: 10 },
  renameInput: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#343a47",
    borderRadius: 9,
    paddingHorizontal: 12,
    color: "#f0f3fb",
  },
  renameButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 9,
    backgroundColor: "#405a96",
  },
  deleteButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 9,
    backgroundColor: "#b62324",
  },
  deleteLabel: { color: "#fff", fontWeight: "700" },
});

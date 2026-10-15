import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  register as registerGlobalShortcut,
  unregister as unregisterGlobalShortcut,
} from "@tauri-apps/plugin-global-shortcut";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import type {
  ChatMessage,
  Conversation,
  MemorySettings,
  MemorySuggestion,
  ProjectProfile,
} from "@primerai/shared";
import {
  AlertCircle,
  ArrowUp,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  Info,
  Loader2,
  Mic,
  MicOff,
  Plus,
  Share2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  ApiError,
  api,
  getStoredSession,
  storeSession,
  type Session,
} from "./lib/api";
import { ApiKeyModal } from "./components/ApiKeyModal";
import { AuthScreen } from "./components/AuthScreen";
import {
  SettingsModal,
  type SettingsSection,
} from "./components/SettingsModal";
import { Sidebar } from "./components/Sidebar";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { ModelPicker } from "./components/ModelPicker";
import type { AiProvider } from "@primerai/shared";

type Gate =
  | "checking"
  | "anonymous"
  | "connection-error"
  | "needs-key"
  | "ready";
type OrganizeMove = { source: string; fileName: string; category: string };
type DuplicateGroup = { files: string[]; sizeBytes: number };
type ScreenImage = {
  name: string;
  mimeType: "image/jpeg";
  data: string;
  preview: string;
};

type NoticeKind = "info" | "ok" | "error" | "running";

function Notice({
  kind,
  className = "",
  children,
}: {
  kind: NoticeKind;
  className?: string;
  children: React.ReactNode;
}) {
  const Icon =
    kind === "error"
      ? AlertCircle
      : kind === "ok"
        ? CheckCircle2
        : kind === "running"
          ? Loader2
          : Info;
  return (
    <p
      className={`alert alert-notice ${kind} ${className}`}
      role={kind === "error" ? "alert" : "status"}
    >
      <Icon
        size={16}
        aria-hidden="true"
        className={kind === "running" ? "icon-spin" : undefined}
      />
      <span>{children}</span>
    </p>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Na fila";
    case "running":
      return "Executando";
    case "waiting_approval":
      return "Aguardando aprovação";
    case "completed":
    case "done":
      return "Concluído";
    case "error":
    case "failed":
      return "Falhou";
    case "cancelled":
    case "canceled":
      return "Cancelado";
    default:
      return status;
  }
}

function statusClass(status: string): string {
  switch (status) {
    case "running":
      return "running";
    case "waiting_approval":
    case "pending":
      return "pending";
    case "completed":
    case "done":
      return "ok";
    case "error":
    case "failed":
      return "error";
    default:
      return "";
  }
}

function errorMessage(err: unknown): string {
  return err instanceof ApiError
    ? `${err.message} (${api.baseUrl})`
    : "não foi possível conectar no servidor";
}

function pinnedConversationStorageKey(userId: string): string {
  return `primerai:pinned-conversations:${userId}`;
}

const SEARCH_RECENT_LIMIT = 8;
const SEARCH_MATCH_LIMIT = 50;

function App() {
  const [gate, setGate] = useState<Gate>("checking");
  const [showWelcome, setShowWelcome] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<string | null>(
    null,
  );
  const [anonymous, setAnonymous] = useState(false);
  const previousConversationRef = useRef<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [documentAttachment, setDocumentAttachment] = useState<{
    name: string;
    text: string;
  } | null>(null);
  const [screenImage, setScreenImage] = useState<ScreenImage | null>(null);
  const [screenBusy, setScreenBusy] = useState(false);
  const [screenShortcutNotice, setScreenShortcutNotice] = useState(false);
  const documentInput = useRef<HTMLInputElement>(null);
  const draftInput = useRef<HTMLTextAreaElement>(null);
  const [sending, setSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
        recognitionRef.current = null;
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognition =
      (window as unknown as { SpeechRecognition?: any }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: any }).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      window.alert(
        "Reconhecimento de voz não suportado nativamente neste ambiente.\nPara ditar, utilize um navegador compatível com Web Speech API ou envie arquivo de áudio.",
      );
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = "pt-BR";
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let currentTranscript = "";
        for (let i = 0; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        if (currentTranscript.trim()) {
          setDraft(currentTranscript.trim());
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
    }
  }, [isListening]);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  const toggleSpeakMessage = useCallback((msg: ChatMessage) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }
    if (speakingMessageId === msg.id) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(msg.content);
    utterance.lang = "pt-BR";
    utterance.onend = () => setSpeakingMessageId(null);
    utterance.onerror = () => setSpeakingMessageId(null);
    setSpeakingMessageId(msg.id);
    window.speechSynthesis.speak(utterance);
  }, [speakingMessageId]);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>("geral");
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [workspaceItems, setWorkspaceItems] = useState<
    { label: string; path: string; enabled: boolean }[]
  >([]);
  const [showAccount, setShowAccount] = useState(false);
  const [accountAnchor, setAccountAnchor] = useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);
  const [notion, setNotion] = useState<{
    connected: boolean;
    workspaceName: string | null;
  } | null>(null);
  const [notionBusy, setNotionBusy] = useState(false);
  const [notionMessage, setNotionMessage] = useState<string | null>(null);
  const [calendar, setCalendar] = useState<{
    connected: boolean;
    calendarId: string | null;
  } | null>(null);
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [calendarMessage, setCalendarMessage] = useState<string | null>(null);
  const [showAttach, setShowAttach] = useState(false);
  const attachButton = useRef<HTMLButtonElement>(null);
  const [attachPosition, setAttachPosition] = useState<{
    left: number;
    bottom: number;
    width: number;
  } | null>(null);
  const [chatWebSearch, setChatWebSearch] = useState(false);
  const [chatMemoryEnabled, setChatMemoryEnabled] = useState(true);
  const [projects, setProjects] = useState<ProjectProfile[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [showProjectChoices, setShowProjectChoices] = useState(false);
  const [showModels, setShowModels] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [pinnedIdsLoaded, setPinnedIdsLoaded] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Conversation | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  useEffect(() => {
    const key = pinnedConversationStorageKey(session?.user.id ?? "guest");
    setPinnedIdsLoaded(false);
    setPinnedIds([]);
    try {
      const raw = localStorage.getItem(key);
      if (raw) setPinnedIds(JSON.parse(raw) as string[]);
    } catch {
      /* ignora dados locais inválidos */
    }
    setPinnedIdsLoaded(true);
  }, [session?.user.id]);

  useEffect(() => {
    if (!pinnedIdsLoaded) return;
    const key = pinnedConversationStorageKey(session?.user.id ?? "guest");
    localStorage.setItem(key, JSON.stringify(pinnedIds));
  }, [pinnedIds, pinnedIdsLoaded, session?.user.id]);

  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    void registerGlobalShortcut("Alt+Shift+Space", async (event) => {
      if (!active || event.state !== "Pressed") return;
      try {
        const window = getCurrentWindow();
        await window.show();
        await window.unminimize();
        await window.setFocus();
        setScreenShortcutNotice(true);
      } catch (err) {
        setChatError(
          err instanceof Error
            ? err.message
            : "Não foi possível abrir o PrimerAI pelo atalho.",
        );
      }
    }).catch((err: unknown) => {
      if (active)
        setChatError(
          err instanceof Error
            ? `Não foi possível registrar Alt + Shift + Espaço: ${err.message}`
            : "Não foi possível registrar o atalho global.",
        );
    });
    return () => {
      active = false;
      void unregisterGlobalShortcut("Alt+Shift+Space").catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    void api
      .getMemorySettings(session.accessToken)
      .then((settings) => setChatMemoryEnabled(settings.useMemoriesInChat))
      .catch(() => undefined);
  }, [session]);

  async function captureScreen(prompt = "") {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setChatError(
        "A captura de tela não está disponível neste sistema. Atualize o WebView ou escolha uma captura nos arquivos.",
      );
      return;
    }
    setScreenBusy(true);
    setChatError(null);
    setScreenShortcutNotice(false);
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 1 },
        audio: false,
      });
      const video = document.createElement("video");
      video.muted = true;
      video.srcObject = stream;
      await video.play();
      await new Promise<void>((resolve) => {
        if (video.videoWidth > 0) resolve();
        else
          video.addEventListener("loadedmetadata", () => resolve(), {
            once: true,
          });
      });
      const scale = Math.min(
        1,
        1920 / video.videoWidth,
        1920 / video.videoHeight,
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      canvas
        .getContext("2d")
        ?.drawImage(video, 0, 0, canvas.width, canvas.height);
      let quality = 0.82;
      let dataUrl = canvas.toDataURL("image/jpeg", quality);
      while (dataUrl.length > 3_500_000 && quality > 0.45) {
        quality -= 0.1;
        dataUrl = canvas.toDataURL("image/jpeg", quality);
      }
      const data = dataUrl.slice(dataUrl.indexOf(",") + 1);
      if (data.length > 3_800_000)
        throw new Error(
          "A captura ficou grande demais. Selecione uma janela menor ou reduza a resolução da tela.",
        );
      setScreenImage({
        name: `captura-de-tela-${new Date().toISOString().replace(/[:.]/g, "-")}.jpg`,
        mimeType: "image/jpeg",
        data,
        preview: dataUrl,
      });
      setDraft((current) =>
        current.trim()
          ? current
          : prompt.trim() || "Analise o que aparece nesta tela e me ajude.",
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") return;
      setChatError(
        err instanceof Error
          ? err.message
          : "Não foi possível capturar a tela.",
      );
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      setScreenBusy(false);
    }
  }

  const [showRemote, setShowRemote] = useState(false);
  const [remoteTasks, setRemoteTasks] = useState<
    {
      id: string;
      deviceId: string;
      prompt: string;
      status: string;
      progress: number;
      stepLabel: string | null;
      error: string | null;
      createdAt: string;
    }[]
  >([]);
  const [remoteApprovals, setRemoteApprovals] = useState<
    Record<string, { id: string; status: string; impactSummary?: string }>
  >({});
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [pendingModel, setPendingModel] = useState<string | null>(null);
  const [memories, setMemories] = useState<
    { key: string; value: string; category?: string; createdAt: string }[]
  >([]);
  const [memoryKey, setMemoryKey] = useState("");
  const [memoryValue, setMemoryValue] = useState("");
  const [memoryCategory, setMemoryCategory] = useState("context");
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const [memorySettings, setMemorySettings] = useState<MemorySettings>({
    useMemoriesInChat: true,
    automaticSuggestionsEnabled: false,
  });
  const [memorySuggestions, setMemorySuggestions] = useState<
    MemorySuggestion[]
  >([]);
  const [workspaceLabel, setWorkspaceLabel] = useState("");
  const [workspacePath, setWorkspacePath] = useState("");
  const [taskNotice, setTaskNotice] = useState("");
  const [taskNoticeKind, setTaskNoticeKind] = useState<NoticeKind>("info");
  const [organizeReview, setOrganizeReview] = useState<{
    taskId: string;
    approvalId: string;
    directory: string;
    moves: OrganizeMove[];
    duplicates: DuplicateGroup[];
  } | null>(null);
  const [lastOrganization, setLastOrganization] = useState<{
    directory: string;
    moves: OrganizeMove[];
  } | null>(null);
  const [organizeBusy, setOrganizeBusy] = useState(false);
  const taskRunning = useRef(false);
  const taskAwaitingApproval = useRef(false);
  const organizationExecuting = useRef(false);

  const setNotice = useCallback(
    (message: string, kind: NoticeKind = "info") => {
      setTaskNotice(message);
      setTaskNoticeKind(kind);
    },
    [],
  );

  useEffect(() => {
    if (!session) {
      setDeviceId(null);
      return;
    }
    let cancelled = false;
    void api
      .registerDevice(session.accessToken)
      .then(async (device) => {
        if (cancelled) return;
        setDeviceId(device.id);
        const roots = await api.listWorkspaces(session.accessToken, device.id);
        if (!cancelled) setWorkspaceItems(roots);
      })
      .catch((err) =>
        setNotice(
          err instanceof Error
            ? err.message
            : "falha ao registrar este desktop",
          "error",
        ),
      );
    return () => {
      cancelled = true;
    };
  }, [session?.accessToken]);

  useEffect(() => {
    if (!session || !deviceId) return;
    let cancelled = false;
    const runNext = async () => {
      if (taskRunning.current || taskAwaitingApproval.current || cancelled)
        return;
      taskRunning.current = true;
      let claimedTaskId: string | null = null;
      try {
        await api.registerDevice(session.accessToken); // heartbeat, também marca o PC online
        const task = await api.claimTask(session.accessToken, deviceId);
        if (!task) return;
        claimedTaskId = task.id;
        setNotice(`Executando: ${task.prompt}`, "running");
        if (task.input?.kind === "mission_step") {
          await api.updateTask(
            session.accessToken,
            task.id,
            10,
            "Executando etapa da missão com a IA configurada",
          );
          const result = await api.executeMissionStep(
            session.accessToken,
            task.id,
          );
          await api.finishTask(session.accessToken, task.id, {
            output: result.output,
          });
          setNotice("Etapa da missão concluída.", "ok");
          return;
        }
        const organizeWork =
          /\b(organiz|organis|separ|categor|arrum)\w*\b/i.test(task.prompt) &&
          /\b(pasta|arquivo|downloads?|desktop|área de trabalho)\b/i.test(
            task.prompt,
          );
        if (organizeWork) {
          await api.updateTask(
            session.accessToken,
            task.id,
            10,
            "Preparando uma prévia da organização",
          );
          const roots = await api.listWorkspaces(session.accessToken, deviceId);
          const requested = /\b(downloads?|desktop|área de trabalho)\b/i
            .exec(task.prompt)?.[0]
            .toLowerCase();
          const target =
            (requested &&
              roots.find(
                (r) =>
                  r.enabled &&
                  (requested.includes("download")
                    ? /download/i.test(r.label)
                    : /(desktop|área de trabalho)/i.test(r.label)),
              )) ??
            roots.find((r) => r.enabled && /download/i.test(r.label));
          if (!target)
            throw new Error(
              "Autorize a pasta Downloads ou a pasta citada na tarefa em Pastas autorizadas.",
            );
          const allowed = roots.filter((r) => r.enabled).map((r) => r.path);
          const moves = await invoke<OrganizeMove[]>("plan_organize_files", {
            directory: target.path,
            roots: allowed,
          });
          const duplicates = await invoke<DuplicateGroup[]>(
            "find_duplicate_files",
            { directory: target.path, roots: allowed },
          );
          if (!moves.length) {
            const duplicateText = duplicates.length
              ? ` Encontrei ${duplicates.length} grupo(s) de duplicados; nenhum arquivo foi apagado.`
              : "";
            await api.finishTask(session.accessToken, task.id, {
              output: `A pasta ${target.label} já está organizada ou não contém arquivos compatíveis para mover.${duplicateText}`,
            });
            setNotice(
              `Concluído: não há arquivos para organizar em ${target.label}.${duplicateText}`,
              "ok",
            );
            return;
          }
          const approval = await api.createApproval(
            session.accessToken,
            task.id,
            {
              directory: target.path,
              count: moves.length,
              impactSummary: `Mover ${moves.length} arquivo(s) de ${target.label} para pastas por tipo. Nenhum arquivo será apagado ou sobrescrito.`,
            },
          );
          taskAwaitingApproval.current = true;
          setOrganizeReview({
            taskId: task.id,
            approvalId: approval.id,
            directory: target.path,
            moves,
            duplicates,
          });
          setNotice(
            `Prévia pronta: ${moves.length} arquivo(s) serão organizados por tipo. Aprove ou cancele a movimentação.`,
            "info",
          );
          return;
        }
        const pdfWork =
          /\b(pdf|documentos? anexados?)\b/i.test(task.prompt) &&
          /\b(resum|analisa|analise|extrai|compare|comparar)\w*\b/i.test(
            task.prompt,
          ) &&
          !/\b(pesquis|na internet|na web|ranking|top\s*\d+|maiores|melhores)\b/i.test(
            task.prompt,
          );
        if (!pdfWork) {
          await api.updateTask(
            session.accessToken,
            task.id,
            15,
            "Pesquisando na web e reunindo fontes",
          );
          const research = await api.research(session.accessToken, task.prompt);
          const roots = await api.listWorkspaces(session.accessToken, deviceId);
          const desktop = roots.find(
            (r) => r.enabled && /(desktop|área de trabalho)/i.test(r.label),
          );
          if (!desktop)
            throw new Error(
              "Configure a pasta Área de trabalho em Pastas autorizadas.",
            );
          const allowed = roots.filter((r) => r.enabled).map((r) => r.path);
          const targetDir = `${desktop.path.replace(/[\\/]$/, "")}/Trabalho`;
          await invoke("create_directory", { path: targetDir, roots: allowed });
          await api.updateTask(
            session.accessToken,
            task.id,
            90,
            "Salvando o resultado em arquivo de texto",
          );
          const savedPath = await invoke<string>("write_text_file", {
            path: `${targetDir}/Pesquisa.txt`,
            text: research.output,
            roots: allowed,
          });
          await api.finishTask(session.accessToken, task.id, {
            output: `Pesquisa concluída com ${research.sources.length} fontes. Arquivo salvo em ${savedPath}`,
          });
          setNotice(`Concluído: pesquisa salva em ${savedPath}`, "ok");
          return;
        }
        await api.updateTask(
          session.accessToken,
          task.id,
          5,
          "Preparando leitura dos PDFs",
        );
        const roots = await api.listWorkspaces(session.accessToken, deviceId);
        const downloads = roots.find(
          (r) => r.enabled && /download/i.test(r.label),
        );
        const desktop = roots.find(
          (r) => r.enabled && /(desktop|área de trabalho)/i.test(r.label),
        );
        if (!downloads || !desktop)
          throw new Error(
            "Configure as pastas Downloads e Área de trabalho em Pastas autorizadas.",
          );
        const allowed = roots.filter((r) => r.enabled).map((r) => r.path);
        const files = await invoke<string[]>("list_pdf_files", {
          directory: downloads.path,
          roots: allowed,
        });
        if (!files.length)
          throw new Error(
            "Não encontrei PDFs diretamente na pasta Downloads autorizada.",
          );
        if (files.length > 20)
          throw new Error(
            `Encontrei ${files.length} PDFs; o limite por tarefa é 20. Separe os arquivos em grupos menores.`,
          );
        const documents: { name: string; text: string }[] = [];
        for (let index = 0; index < files.length; index++) {
          const path = files[index]!;
          await api.updateTask(
            session.accessToken,
            task.id,
            10 + Math.floor((index / files.length) * 45),
            `Lendo PDF ${index + 1} de ${files.length}`,
          );
          const text = await invoke<string>("extract_pdf_text", {
            path,
            roots: allowed,
          });
          documents.push({ name: path.split(/[\\/]/).pop() ?? path, text });
        }
        if (
          documents.reduce((size, doc) => size + doc.text.length, 0) > 300_000
        )
          throw new Error(
            "O texto extraído excede o limite de 300 mil caracteres. Divida os PDFs em grupos menores.",
          );
        await api.updateTask(
          session.accessToken,
          task.id,
          65,
          "Gerando resumo com a IA configurada",
        );
        const summary = await api.summarize(
          session.accessToken,
          task.prompt,
          documents,
        );
        const targetDir = `${desktop.path.replace(/[\\/]$/, "")}/Trabalho`;
        await api.updateTask(
          session.accessToken,
          task.id,
          82,
          "Criando Trabalho e copiando os PDFs",
        );
        await invoke("create_directory", { path: targetDir, roots: allowed });
        for (let index = 0; index < files.length; index++) {
          await api.updateTask(
            session.accessToken,
            task.id,
            82 + Math.floor((index / files.length) * 7),
            `Copiando PDF ${index + 1} de ${files.length}`,
          );
          await invoke("copy_pdf", {
            source: files[index],
            directory: targetDir,
            roots: allowed,
          });
        }
        await api.updateTask(
          session.accessToken,
          task.id,
          91,
          "Gravando o relatório PDF",
        );
        const reportPath = await invoke<string>("write_report_pdf", {
          path: `${targetDir}/Relatorio.pdf`,
          title: "Relatório dos PDFs",
          text: summary,
          roots: allowed,
        });
        await api.finishTask(session.accessToken, task.id, {
          output: `Copiei ${files.length} PDF(s) para ${targetDir}. Relatório salvo em ${reportPath}`,
        });
        setNotice(`Concluído: PDFs e relatório salvos em ${targetDir}`, "ok");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "falha ao executar tarefa";
        setNotice(message, "error");
        if (claimedTaskId)
          await api
            .finishTask(session.accessToken, claimedTaskId, { error: message })
            .catch(() => {});
      } finally {
        taskRunning.current = false;
      }
    };
    const timer = setInterval(() => void runNext(), 2500);
    void runNext();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [session?.accessToken, deviceId]);

  async function executeOrganize(review: NonNullable<typeof organizeReview>) {
    if (!session || !organizeReview || organizationExecuting.current) return;
    organizationExecuting.current = true;
    setOrganizeBusy(true);
    try {
      const task = await api.getTask(session.accessToken, review.taskId);
      if (task.status !== "running")
        throw new Error(
          "A tarefa foi cancelada antes da organização; nenhum arquivo foi movido.",
        );
      const roots = (await api.listWorkspaces(session.accessToken, deviceId!))
        .filter((r) => r.enabled)
        .map((r) => r.path);
      const completed = await invoke<string[]>("execute_organize_files", {
        directory: review.directory,
        moves: review.moves,
        roots,
      });
      const summary = `Organização concluída: ${completed.length} arquivo(s) movidos para pastas por tipo em ${review.directory}.`;
      await api.finishTask(session.accessToken, review.taskId, {
        output: summary,
      });
      setLastOrganization({ directory: review.directory, moves: review.moves });
      setNotice(summary, "ok");
      setOrganizeReview(null);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Não foi possível concluir a organização.";
      setNotice(message, "error");
      await api
        .finishTask(session.accessToken, review.taskId, { error: message })
        .catch(() => {});
      setOrganizeReview(null);
    } finally {
      taskAwaitingApproval.current = false;
      organizationExecuting.current = false;
      setOrganizeBusy(false);
    }
  }

  async function undoLastOrganization() {
    if (!lastOrganization || !session || organizeBusy) return;
    setOrganizeBusy(true);
    try {
      const roots = (await api.listWorkspaces(session.accessToken, deviceId!))
        .filter((r) => r.enabled)
        .map((r) => r.path);
      const restored = await invoke<number>("undo_organize_files", {
        directory: lastOrganization.directory,
        moves: lastOrganization.moves,
        roots,
      });
      setNotice(
        `Organização desfeita: ${restored} arquivo(s) voltaram para ${lastOrganization.directory}.`,
        "ok",
      );
      setLastOrganization(null);
    } catch (err) {
      setNotice(
        err instanceof Error
          ? err.message
          : "Não foi possível desfazer a organização.",
        "error",
      );
    } finally {
      setOrganizeBusy(false);
    }
  }

  async function resolveOrganize(approve: boolean) {
    if (!session || !organizeReview || organizeBusy) return;
    const review = organizeReview;
    try {
      await api.resolveApproval(
        session.accessToken,
        review.approvalId,
        approve,
      );
      if (!approve) {
        taskAwaitingApproval.current = false;
        setOrganizeReview(null);
        setNotice("Organização cancelada. Nenhum arquivo foi movido.", "info");
        return;
      }
      await executeOrganize(review);
    } catch (err) {
      setNotice(
        err instanceof Error
          ? err.message
          : "Não foi possível decidir a organização.",
        "error",
      );
    }
  }

  useEffect(() => {
    if (!session || !organizeReview || organizeBusy) return;
    let cancelled = false;
    const review = organizeReview;
    const pollApproval = async () => {
      try {
        const approval = await api.getApproval(
          session.accessToken,
          review.taskId,
        );
        if (cancelled || approval.status === "pending") return;
        if (approval.status === "approved") await executeOrganize(review);
        else {
          taskAwaitingApproval.current = false;
          setOrganizeReview(null);
          setNotice(
            approval.status === "denied"
              ? "Organização recusada. Nenhum arquivo foi movido."
              : "A aprovação expirou. Nenhum arquivo foi movido.",
            "info",
          );
        }
      } catch (err) {
        if (!cancelled)
          setNotice(
            err instanceof Error
              ? err.message
              : "Não foi possível consultar a aprovação.",
            "error",
          );
      }
    };
    const timer = setInterval(() => void pollApproval(), 2000);
    void pollApproval();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [session?.accessToken, organizeReview, organizeBusy]);

  async function saveWorkspaces() {
    if (!session || !deviceId) return;
    const next = [
      ...workspaceItems,
      {
        label: workspaceLabel.trim(),
        path: workspacePath.trim(),
        enabled: true,
      },
    ].filter((r) => r.label && r.path);
    await api.saveWorkspaces(session.accessToken, deviceId, next);
    setWorkspaceItems(next);
    setWorkspaceLabel("");
    setWorkspacePath("");
  }

  async function suggestWorkspaces() {
    if (!session || !deviceId) return;
    const found = await invoke<{ label: string; path: string }[]>(
      "suggested_workspaces",
    );
    const next = [
      ...workspaceItems,
      ...found.map((item) => ({ ...item, enabled: true })),
    ].filter(
      (item, index, all) =>
        all.findIndex((other) => other.path === item.path) === index,
    );
    await api.saveWorkspaces(session.accessToken, deviceId, next);
    setWorkspaceItems(next);
  }

  async function removeWorkspace(path: string) {
    if (!session || !deviceId) return;
    const next = workspaceItems.filter((item) => item.path !== path);
    await api.saveWorkspaces(session.accessToken, deviceId, next);
    setWorkspaceItems(next);
  }

  async function loadMemories() {
    if (!session) return;
    setMemoryError(null);
    try {
      const [items, settings, suggestions] = await Promise.all([
        api.listMemories(session.accessToken),
        api.getMemorySettings(session.accessToken),
        api.listMemorySuggestions(session.accessToken),
      ]);
      setMemories(items);
      setMemorySettings(settings);
      setChatMemoryEnabled(settings.useMemoriesInChat);
      setMemorySuggestions(suggestions);
    } catch (err) {
      setMemoryError(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar a memória.",
      );
    }
  }

  async function saveMemory() {
    if (!session || !memoryKey.trim() || !memoryValue.trim()) return;
    setMemoryError(null);
    try {
      await api.saveMemory(
        session.accessToken,
        memoryKey,
        memoryValue,
        memoryCategory,
      );
      setMemoryKey("");
      setMemoryValue("");
      setMemoryCategory("context");
      await loadMemories();
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
      await loadMemories();
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
    try {
      setMemorySettings(
        await api.updateMemorySettings(session.accessToken, patch),
      );
    } catch (err) {
      setMemoryError(
        err instanceof Error
          ? err.message
          : "Não foi possível atualizar as preferências da memória.",
      );
    }
  }

  async function acceptMemorySuggestion(id: string) {
    if (!session) return;
    try {
      await api.acceptMemorySuggestion(session.accessToken, id);
      await loadMemories();
    } catch (err) {
      setMemoryError(
        err instanceof Error
          ? err.message
          : "Não foi possível salvar a sugestão.",
      );
    }
  }

  async function dismissMemorySuggestion(id: string) {
    if (!session) return;
    try {
      await api.dismissMemorySuggestion(session.accessToken, id);
      setMemorySuggestions((items) => items.filter((item) => item.id !== id));
    } catch (err) {
      setMemoryError(
        err instanceof Error
          ? err.message
          : "Não foi possível descartar a sugestão.",
      );
    }
  }

  async function clearAllMemories() {
    if (
      !session ||
      !window.confirm(
        "Apagar todas as memórias e sugestões? As conversas não serão apagadas.",
      )
    )
      return;
    try {
      await api.clearMemories(session.accessToken);
      setMemories([]);
      setMemorySuggestions([]);
    } catch (err) {
      setMemoryError(
        err instanceof Error
          ? err.message
          : "Não foi possível apagar as memórias.",
      );
    }
  }

  const loadProviders = useCallback(async (active: Session) => {
    return api.listProviders(active.accessToken);
  }, []);

  const loadConversations = useCallback(async (active: Session) => {
    const list = await api.listConversations(active.accessToken);
    setConversations(list);
    return list;
  }, []);

  const enterWithSession = useCallback(
    async (active: Session) => {
      setBootError(null);
      const result = await api.me(active.accessToken);
      const validSession = { ...active, user: result.user };
      storeSession(validSession);
      setSession(validSession);

      try {
        const list = await loadProviders(validSession);
        setProviders(list);
        const conversations = await loadConversations(validSession);
        // Abrir direto em um chat vazio; conversas anteriores continuam no histórico.
        if (list.length > 0) {
          const created = await api.createConversation(
            validSession.accessToken,
          );
          setActiveConversation(created.id);
          setConversations([created, ...conversations]);
        } else {
          setActiveConversation(null);
        }
        setGate(list.length === 0 ? "needs-key" : "ready");
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) throw err;
        // A provider-list failure should not log out a user whose session is valid.
        setBootError(errorMessage(err));
        setGate("ready");
      }
    },
    [loadProviders, loadConversations],
  );

  const checkStoredSession = useCallback(async () => {
    setGate("checking");
    setBootError(null);
    const stored = getStoredSession();
    if (!stored) {
      setSession(null);
      setGate("anonymous");
      return;
    }

    try {
      await enterWithSession(stored);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        storeSession(null);
        setSession(null);
        setGate("anonymous");
        return;
      }
      setBootError(errorMessage(err));
      setGate("connection-error");
    }
  }, [enterWithSession]);

  useEffect(() => {
    void checkStoredSession();
  }, [checkStoredSession]);

  useEffect(() => {
    if (!showSettings || !session) return;
    let cancelled = false;
    void api
      .notionStatus(session.accessToken)
      .then((status) => {
        if (!cancelled) setNotion(status);
      })
      .catch((err) => {
        if (!cancelled)
          setNotionMessage(
            err instanceof Error
              ? err.message
              : "Não foi possível consultar o Notion.",
          );
      });
    void api
      .calendarStatus(session.accessToken)
      .then((status) => {
        if (!cancelled) setCalendar(status);
      })
      .catch((err) => {
        if (!cancelled)
          setCalendarMessage(
            err instanceof Error
              ? err.message
              : "Não foi possível consultar o Google Calendar.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [showSettings, session?.accessToken]);

  const onAuthenticated = useCallback(
    async (active: Session) => {
      try {
        await enterWithSession(active);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          storeSession(null);
          setSession(null);
          setGate("anonymous");
        }
        throw err;
      }
    },
    [enterWithSession],
  );

  const onGoogleSignIn = useCallback(async () => {
    const webUrl = (
      import.meta.env.VITE_WEB_URL ?? "http://localhost:3000"
    ).replace(/\/+$/, "");
    const returnUri = isTauri()
      ? "primerai://auth/callback"
      : `${window.location.origin}/`;
    const loginUrl = `${webUrl}/api/auth/google/start?return_uri=${encodeURIComponent(returnUri)}`;
    if (isTauri()) await openUrl(loginUrl);
    else window.location.assign(loginUrl);
  }, []);

  useEffect(() => {
    const handleCode = async (code: string) => {
      try {
        const incoming = await api.exchangeNativeCode(code);
        storeSession(incoming);
        await onAuthenticated(incoming);
      } catch (err) {
        setBootError(
          err instanceof Error
            ? err.message
            : "não foi possível finalizar o login Google",
        );
        setGate("anonymous");
      }
    };
    if (!isTauri()) {
      const code = new URLSearchParams(window.location.hash.slice(1)).get(
        "code",
      );
      if (code) {
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${window.location.search}`,
        );
        void handleCode(code);
      }
      return;
    }
    let unlisten: (() => void) | undefined;
    let disposed = false;
    const handleUrls = async (urls: string[]) => {
      for (const value of urls) {
        try {
          const url = new URL(value);
          if (url.protocol !== "primerai:") continue;
          const code = new URLSearchParams(url.hash.slice(1)).get("code");
          if (!code) continue;
          await handleCode(code);
        } catch (err) {
          setBootError(
            err instanceof Error
              ? err.message
              : "não foi possível finalizar o login Google",
          );
          setGate("anonymous");
        }
      }
    };
    void Promise.all([
      getCurrent().then((urls) => {
        if (urls && !disposed) return handleUrls(urls);
      }),
      onOpenUrl((urls) => {
        void handleUrls(urls);
      }).then((off) => {
        if (disposed) off();
        else unlisten = off;
      }),
    ]).catch((err) =>
      setBootError(
        err instanceof Error
          ? err.message
          : "não foi possível preparar o callback Google",
      ),
    );
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [onAuthenticated]);

  const onProviderSaved = useCallback(async () => {
    if (!session) return;
    try {
      const list = await loadProviders(session);
      const previousDefaultId = providers.find((p) => p.isDefault)?.id;
      const nextDefaultId = list.find((p) => p.isDefault)?.id;
      setProviders(list);
      setGate(list.length === 0 ? "needs-key" : "ready");
      setBootError(null);

      // mudou o provider padrão: a conversa aberta nasceu amarrada ao antigo,
      // então uma conversa ainda vazia é trocada — senão o chat "volta" pro
      // provider antigo mesmo com o novo salvo como padrão
      if (!nextDefaultId || nextDefaultId === previousDefaultId) return;
      if (!activeConversation || messages.length > 0) return;

      try {
        const created = await api.createConversation(session.accessToken);
        setActiveConversation(created.id);
        setConversations((current) => [
          created,
          ...current.filter((c) => c.id !== activeConversation),
        ]);
        setMessages([]);
        void api
          .deleteConversation(session.accessToken, activeConversation)
          .catch(() => undefined);
      } catch {
        // rebind é cosmético: mantém a conversa atual se falhar
      }
    } catch (err) {
      setBootError(errorMessage(err));
    }
  }, [session, loadProviders, providers, activeConversation, messages.length]);

  const removeProvider = useCallback(
    async (id: string) => {
      if (!session) return;
      try {
        await api.deleteProvider(session.accessToken, id);
        await onProviderSaved();
      } catch (err) {
        setBootError(errorMessage(err));
      }
    },
    [session, onProviderSaved],
  );

  useEffect(() => {
    if (!session || !activeConversation) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    void api
      .listMessages(session.accessToken, activeConversation)
      .then((list) => {
        if (!cancelled) setMessages(list);
      })
      .catch((err) => {
        if (!cancelled) setChatError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [session, activeConversation]);

  async function startConversation() {
    if (!session) return;
    setChatError(null);
    try {
      const created = await api.createConversation(session.accessToken);
      setActiveConversation(created.id);
      setConversations((current) => [created, ...current]);
      setMessages([]);
      setAnonymous(false);
      setChatError(null);
    } catch (err) {
      setChatError(errorMessage(err));
    }
  }

  function startAnonymousConversation() {
    previousConversationRef.current = activeConversation;
    setActiveConversation(null);
    setMessages([]);
    setAnonymous(true);
    setPendingModel(null);
    setDraft("");
    setDocumentAttachment(null);
    setScreenImage(null);
    setChatError(null);
    if (draftInput.current) draftInput.current.style.height = "auto";
    draftInput.current?.focus();
  }

  function leaveAnonymousConversation() {
    setAnonymous(false);
    setActiveConversation(previousConversationRef.current);
    previousConversationRef.current = null;
    setMessages([]);
    setPendingModel(null);
    setDraft("");
    setDocumentAttachment(null);
    setScreenImage(null);
    setChatError(null);
    if (draftInput.current) draftInput.current.style.height = "auto";
  }

  const activeChat = conversations.find((c) => c.id === activeConversation);
  const modelProvider =
    providers.find((p) => p.id === activeChat?.providerId) ??
    providers.find((p) => p.isDefault) ??
    providers[0];
  const modelLabel =
    activeChat?.model ??
    pendingModel ??
    (anonymous ? (modelProvider?.defaultModel ?? "Modelo") : "Modelo");

  async function chooseModel(model: string) {
    setShowModels(false);
    if (!session) return;
    if (anonymous) {
      setPendingModel(model);
      return;
    }
    if (!activeConversation) {
      setPendingModel(model);
      try {
        const created = await api.createConversation(
          session.accessToken,
          model,
        );
        setActiveConversation(created.id);
        setConversations((current) => [created, ...current]);
        setMessages([]);
        setPendingModel(null);
      } catch (err) {
        setChatError(errorMessage(err));
      }
      return;
    }
    if (model === activeChat?.model) return;
    try {
      const updated = await api.updateConversationModel(
        session.accessToken,
        activeConversation,
        model,
      );
      setConversations((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (err) {
      setChatError(
        err instanceof Error ? err.message : "não foi possível trocar o modelo",
      );
    }
  }

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    const screenCommand = draft.match(/^\s*\/(?:ver|olhar) minha tela\b\s*/i);
    if (screenCommand) {
      const prompt = draft.slice(screenCommand[0].length).trim();
      setDraft(prompt);
      await captureScreen(prompt);
      return;
    }
    if (
      !session ||
      (!activeConversation && !anonymous) ||
      (!draft.trim() && !documentAttachment && !screenImage) ||
      sending
    )
      return;
    const content = [
      draft.trim(),
      documentAttachment
        ? `Arquivo ${documentAttachment.name}:\n${documentAttachment.text}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 19_500);
    const outgoing =
      content || (screenImage ? "Analise esta captura de tela." : "");
    setDraft("");
    if (draftInput.current) draftInput.current.style.height = "auto";
    setDocumentAttachment(null);
    setSending(true);
    setChatError(null);
    let uploadedAttachmentId: string | null = null;
    try {
      if (anonymous) {
        const images = screenImage
          ? [{ mimeType: screenImage.mimeType, data: screenImage.data }]
          : undefined;
        const turns = [
          ...messages.map(({ role, content: messageContent }) => ({
            role,
            content: messageContent,
          })),
          { role: "user" as const, content: outgoing, images },
        ];
        const result = await api.sendAnonymousMessage(
          session.accessToken,
          pendingModel ?? modelProvider?.defaultModel ?? undefined,
          turns,
        );
        const now = new Date().toISOString();
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            conversationId: "anonymous",
            role: "user",
            content: outgoing,
            parts: [],
            createdAt: now,
          },
          {
            id: crypto.randomUUID(),
            conversationId: "anonymous",
            role: "assistant",
            content: result.answer,
            parts: [],
            createdAt: now,
          },
        ]);
        setPendingModel(result.model);
        setScreenImage(null);
        return;
      }
      const imageAttachment = screenImage
        ? await api.uploadChatImage(session.accessToken, activeConversation!, {
            name: screenImage.name,
            mimeType: screenImage.mimeType,
            data: screenImage.data,
          })
        : null;
      uploadedAttachmentId = imageAttachment?.id ?? null;
      const saved = await api.sendMessage(
        session.accessToken,
        activeConversation!,
        outgoing,
        imageAttachment ? [imageAttachment.id] : [],
        {
          useMemory: chatMemoryEnabled,
          webSearch: chatWebSearch,
          ...(selectedProjectId ? { projectId: selectedProjectId } : {}),
        },
      );
      uploadedAttachmentId = null;
      setMessages((current) => [...current, ...saved]);
      setConversations(await api.listConversations(session.accessToken));
      setScreenImage(null);
    } catch (err) {
      if (uploadedAttachmentId)
        void api
          .deleteAttachment(session.accessToken, uploadedAttachmentId)
          .catch(() => undefined);
      setDraft(outgoing);
      setChatError(
        err instanceof ApiError
          ? err.message
          : "não foi possível enviar a mensagem",
      );
    } finally {
      setSending(false);
    }
  }

  async function copyMessage(message: ChatMessage) {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedId(message.id);
      setTimeout(
        () =>
          setCopiedId((current) => (current === message.id ? null : current)),
        2000,
      );
    } catch {
      setChatError("Não foi possível copiar a resposta.");
    }
  }

  async function shareMessage(message: ChatMessage) {
    try {
      if (navigator.share) {
        await navigator.share({ text: message.content });
      } else {
        await navigator.clipboard.writeText(message.content);
        setCopiedId(message.id);
        setTimeout(
          () =>
            setCopiedId((current) => (current === message.id ? null : current)),
          2000,
        );
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setChatError("Não foi possível compartilhar a resposta.");
    }
  }

  async function chooseDocument(file?: File) {
    if (!file || !session) return;
    setChatError(null);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext === "pdf" || file.type === "application/pdf") {
        if (file.size > 5 * 1024 * 1024)
          throw new Error("O PDF deve ter até 5 MB.");
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 0x8000)
          binary += String.fromCharCode(
            ...bytes.subarray(offset, offset + 0x8000),
          );
        setDocumentAttachment(
          await api.extractPdf(session.accessToken, file.name, btoa(binary)),
        );
      } else {
        if (!/\.(txt|md|csv|json|xml)$/i.test(file.name))
          throw new Error(
            "Formato não suportado. Use PDF, TXT, MD, CSV, JSON ou XML.",
          );
        if (file.size > 250_000)
          throw new Error("O arquivo ultrapassa o limite de 250 KB.");
        setDocumentAttachment({
          name: file.name,
          text: (await file.text()).slice(0, 16_000),
        });
      }
    } catch (err) {
      setChatError(
        err instanceof Error
          ? err.message
          : "Não foi possível ler o documento.",
      );
    }
  }

  async function selectConversation(id: string) {
    setActiveConversation(id);
    setAnonymous(false);
    setMessages([]);
    setChatError(null);
    setPendingModel(null);
  }

  async function deleteConversation(conversation: Conversation) {
    if (!session || deleting) return;
    setDeleting(true);
    setChatError(null);
    try {
      await api.deleteConversation(session.accessToken, conversation.id);
      const remaining = conversations.filter(
        (item) => item.id !== conversation.id,
      );
      setConversations(remaining);
      setPinnedIds((current) =>
        current.filter((id) => id !== conversation.id),
      );
      if (activeConversation === conversation.id) {
        setActiveConversation(remaining[0]?.id ?? null);
        setMessages([]);
      }
    } catch (err) {
      setChatError(
        err instanceof ApiError
          ? err.message
          : "não foi possível apagar a conversa",
      );
    } finally {
      setDeleting(false);
    }
  }

  function toggleConversationPin(conversation: Conversation) {
    setPinnedIds((current) =>
      current.includes(conversation.id)
        ? current.filter((id) => id !== conversation.id)
        : [conversation.id, ...current],
    );
  }

  function requestConversationRename(conversation: Conversation) {
    setRenameTarget(conversation);
    setRenameDraft(conversation.title);
    setRenameError(null);
  }

  function closeRename() {
    if (renaming) return;
    setRenameTarget(null);
    setRenameDraft("");
    setRenameError(null);
  }

  async function renameConversation() {
    const title = renameDraft.trim();
    if (!session || !renameTarget || !title || renaming) return;
    setRenaming(true);
    setRenameError(null);
    try {
      const updated = await api.updateConversationTitle(
        session.accessToken,
        renameTarget.id,
        title,
      );
      setConversations((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setRenameTarget(null);
      setRenameDraft("");
      setRenameError(null);
    } catch (err) {
      setRenameError(
        err instanceof ApiError
          ? err.message
          : "não foi possível renomear a conversa",
      );
    } finally {
      setRenaming(false);
    }
  }

  const displayedConversations = useMemo(() => {
    const byPinned = (a: Conversation, b: Conversation) => {
      const aIndex = pinnedIds.indexOf(a.id);
      const bIndex = pinnedIds.indexOf(b.id);
      if (aIndex === -1) return bIndex === -1 ? 0 : 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    };
    if (!pinnedIds.length) return conversations;
    return [...conversations].sort(byPinned);
  }, [conversations, pinnedIds]);

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return conversations.slice(0, SEARCH_RECENT_LIMIT);
    return conversations
      .filter((item) => item.title.toLowerCase().includes(query))
      .slice(0, SEARCH_MATCH_LIMIT);
  }, [conversations, searchQuery]);

  async function logout() {
    if (session)
      await api.logout(session.accessToken).catch(() => storeSession(null));
    else storeSession(null);
    setSession(null);
    setConversations([]);
    setActiveConversation(null);
    setAnonymous(false);
    setMessages([]);
    setShowSettings(false);
    setShowAccount(false);
    setAccountAnchor(null);
    setBootError(null);
    setGate("anonymous");
  }

  async function connectNotion() {
    if (!session || notionBusy) return;
    setNotionBusy(true);
    setNotionMessage(null);
    try {
      const { authorizationUrl } = await api.notionConnect(session.accessToken);
      if (isTauri()) await openUrl(authorizationUrl);
      else window.open(authorizationUrl, "_blank", "noopener,noreferrer");
      setNotionMessage(
        "Conclua a autorização no navegador e depois atualize o status aqui.",
      );
    } catch (err) {
      setNotionMessage(
        err instanceof Error
          ? err.message
          : "Não foi possível iniciar a conexão.",
      );
    } finally {
      setNotionBusy(false);
    }
  }

  async function refreshNotion() {
    if (!session) return;
    setNotionBusy(true);
    setNotionMessage(null);
    try {
      setNotion(await api.notionStatus(session.accessToken));
    } catch (err) {
      setNotionMessage(
        err instanceof Error
          ? err.message
          : "Não foi possível consultar o Notion.",
      );
    } finally {
      setNotionBusy(false);
    }
  }

  async function disconnectNotion() {
    if (!session || notionBusy) return;
    setNotionBusy(true);
    setNotionMessage(null);
    try {
      await api.notionDisconnect(session.accessToken);
      setNotion({ connected: false, workspaceName: null });
    } catch (err) {
      setNotionMessage(
        err instanceof Error
          ? err.message
          : "Não foi possível desconectar o Notion.",
      );
    } finally {
      setNotionBusy(false);
    }
  }

  async function connectCalendar() {
    if (!session || calendarBusy) return;
    setCalendarBusy(true);
    setCalendarMessage(null);
    try {
      const { authorizationUrl } = await api.calendarConnect(
        session.accessToken,
      );
      if (isTauri()) await openUrl(authorizationUrl);
      else window.open(authorizationUrl, "_blank", "noopener,noreferrer");
      setCalendarMessage(
        "Conclua a autorização no navegador e depois atualize o status aqui.",
      );
    } catch (err) {
      setCalendarMessage(
        err instanceof Error
          ? err.message
          : "Não foi possível iniciar a conexão.",
      );
    } finally {
      setCalendarBusy(false);
    }
  }

  async function refreshCalendar() {
    if (!session) return;
    setCalendarBusy(true);
    setCalendarMessage(null);
    try {
      setCalendar(await api.calendarStatus(session.accessToken));
    } catch (err) {
      setCalendarMessage(
        err instanceof Error
          ? err.message
          : "Não foi possível consultar o Google Calendar.",
      );
    } finally {
      setCalendarBusy(false);
    }
  }

  async function disconnectCalendar() {
    if (!session || calendarBusy) return;
    setCalendarBusy(true);
    setCalendarMessage(null);
    try {
      await api.calendarDisconnect(session.accessToken);
      setCalendar({ connected: false, calendarId: null });
    } catch (err) {
      setCalendarMessage(
        err instanceof Error
          ? err.message
          : "Não foi possível desconectar o Google Calendar.",
      );
    } finally {
      setCalendarBusy(false);
    }
  }

  useEffect(() => {
    if (!session || !showRemote) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const tasks = await api.listTasks(session.accessToken);
        if (cancelled) return;
        setRemoteTasks(tasks);
        setRemoteError(null);
        const pending = tasks.filter((t) => t.status === "waiting_approval");
        const entries = await Promise.all(
          pending.map(async (t) => {
            try {
              return [
                t.id,
                await api.getApproval(session.accessToken, t.id),
              ] as const;
            } catch {
              return null;
            }
          }),
        );
        if (!cancelled)
          setRemoteApprovals(
            Object.fromEntries(
              entries.filter(Boolean) as [
                string,
                { id: string; status: string; impactSummary?: string },
              ][],
            ),
          );
      } catch (err) {
        if (!cancelled)
          setRemoteError(
            err instanceof Error
              ? err.message
              : "não foi possível carregar as tarefas",
          );
      }
    };
    const timer = setInterval(() => void refresh(), 3000);
    void refresh();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [session?.accessToken, showRemote]);

  if (gate === "checking") {
    return (
      <main className="boot">
        <div className="spinner" aria-hidden />
        <p>verificando sessão…</p>
      </main>
    );
  }

  if (gate === "anonymous") {
    if (showWelcome)
      return <WelcomeScreen onEnter={() => setShowWelcome(false)} />;
    return (
      <AuthScreen
        onAuthenticated={onAuthenticated}
        onGoogleSignIn={onGoogleSignIn}
      />
    );
  }

  if (gate === "connection-error") {
    return (
      <main className="boot">
        <h1>Não foi possível verificar a sessão</h1>
        <Notice kind="error">{bootError}</Notice>
        <button className="primary" onClick={() => void checkStoredSession()}>
          Tentar de novo
        </button>
        <button className="ghost" onClick={logout}>
          Ir para o login
        </button>
      </main>
    );
  }

  const showModal = gate === "needs-key" && !showSettings;

  function openAttachMenu() {
    const button = attachButton.current;
    const composer = button?.closest(".chat-composer");
    if (!button || !(composer instanceof HTMLElement)) return;
    const buttonRect = button.getBoundingClientRect();
    const width = 240;
    setAttachPosition({
      left: Math.max(
        12,
        Math.min(buttonRect.left, window.innerWidth - width - 12),
      ),
      bottom: window.innerHeight - buttonRect.top + 8,
      width,
    });
    setShowProjectChoices(false);
    setShowAttach(true);
  }

  return (
    <main className={`chat-shell${sidebarOpen ? "" : " sidebar-closed"}`}>
      <Sidebar
        conversations={displayedConversations}
        activeConversation={activeConversation}
        anonymous={anonymous}
        session={session}
        accountMenuOpen={showAccount}
        onOpenChange={setSidebarOpen}
        onNewChat={() => void startConversation()}
        onToggleAnonymous={() =>
          anonymous
            ? leaveAnonymousConversation()
            : startAnonymousConversation()
        }
        onSearch={() => setShowSearch(true)}
        onRemote={() => setShowRemote(true)}
        onSelectConversation={(id) => void selectConversation(id)}
        onDeleteConversation={(conversation) =>
          void deleteConversation(conversation)
        }
        onTogglePin={toggleConversationPin}
        onRenameConversation={requestConversationRename}
        pinnedIds={pinnedIds}
        onAccountClick={(anchor) => {
          setAccountAnchor(anchor);
          setShowAccount((open) => !open);
        }}
      />

      <section className="chat-main">
        {taskNotice && (
          <Notice kind={taskNoticeKind} className="chat-alert">
            {taskNotice}
          </Notice>
        )}
        {organizeReview && (
          <section
            className="alert info chat-alert organize-review"
            aria-label="Prévia de organização"
          >
            <strong>Revise antes de mover</strong>
            <p>
              {organizeReview.moves.length} arquivo(s) serão movidos. Nenhum
              arquivo será apagado ou sobrescrito.
            </p>
            <ul>
              {organizeReview.moves.slice(0, 12).map((move) => (
                <li key={move.source}>
                  <code>{move.fileName}</code> → {move.category}/
                </li>
              ))}
            </ul>
            {organizeReview.moves.length > 12 && (
              <p>e mais {organizeReview.moves.length - 12} arquivo(s)</p>
            )}
            {organizeReview.duplicates.length > 0 && (
              <p>
                Encontrei {organizeReview.duplicates.length} grupo(s) de
                arquivos duplicados. Eles não serão apagados.
              </p>
            )}
            <div className="organize-actions">
              <button
                className="primary"
                disabled={organizeBusy}
                onClick={() => void resolveOrganize(true)}
              >
                {organizeBusy ? "Aplicando…" : "Aprovar e organizar"}
              </button>
              <button
                className="ghost"
                disabled={organizeBusy}
                onClick={() => void resolveOrganize(false)}
              >
                Cancelar
              </button>
            </div>
          </section>
        )}
        {lastOrganization && !organizeReview && (
          <section className="alert ok chat-alert organize-review">
            <p>
              Organização concluída. Você pode desfazer enquanto os arquivos não
              forem alterados.
            </p>
            <div className="organize-actions">
              <button
                className="ghost"
                disabled={organizeBusy}
                onClick={() => void undoLastOrganization()}
              >
                Desfazer organização
              </button>
            </div>
          </section>
        )}
        {bootError && (
          <Notice kind="error" className="chat-alert">
            {bootError}
          </Notice>
        )}
        <div className="chat-messages" aria-live="polite">
          {messages.length === 0 && (
            <div className="chat-welcome">
              <h1>Como posso ajudar?</h1>
            </div>
          )}
          {messages.map((message) => (
            <article
              key={message.id}
              className={`chat-message ${message.role}`}
            >
              <p>{message.content}</p>
              {message.role === "assistant" && (
                <div className="message-actions">
                  <button
                    type="button"
                    className="message-action"
                    title={
                      copiedId === message.id ? "Copiado!" : "Copiar resposta"
                    }
                    aria-label="Copiar resposta"
                    onClick={() => void copyMessage(message)}
                  >
                    {copiedId === message.id ? (
                      <Check size={16} aria-hidden="true" />
                    ) : (
                      <Copy size={16} aria-hidden="true" />
                    )}
                  </button>
                  <button
                    type="button"
                    className={`message-action ${speakingMessageId === message.id ? "speaking" : ""}`}
                    title={speakingMessageId === message.id ? "Parar áudio" : "Ouvir resposta (Voz)"}
                    aria-label={speakingMessageId === message.id ? "Parar áudio" : "Ouvir resposta"}
                    onClick={() => toggleSpeakMessage(message)}
                  >
                    {speakingMessageId === message.id ? (
                      <VolumeX size={16} aria-hidden="true" color="#ef4444" />
                    ) : (
                      <Volume2 size={16} aria-hidden="true" />
                    )}
                  </button>
                  <button
                    type="button"
                    className="message-action"
                    title="Compartilhar resposta"
                    aria-label="Compartilhar resposta"
                    onClick={() => void shareMessage(message)}
                  >
                    <Share2 size={16} aria-hidden="true" />
                  </button>
                </div>
              )}
            </article>
          ))}
          {sending && (
            <p className="muted assistant-thinking">A IA está respondendo…</p>
          )}
        </div>
        {chatError && (
          <Notice kind="error" className="chat-alert">
            {chatError}
          </Notice>
        )}
        {screenShortcutNotice && (
          <Notice kind="info" className="chat-alert">
            Atalho Alt + Shift + Espaço ativado. Digite “/ver minha tela” para
            escolher o que compartilhar.
          </Notice>
        )}
        <form className="chat-composer" onSubmit={sendMessage}>
          <input
            ref={documentInput}
            type="file"
            accept=".pdf,.txt,.md,.csv,.json,.xml,text/*,application/pdf,application/json"
            hidden
            onChange={(event) => {
              void chooseDocument(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
          {documentAttachment && (
            <div className="document-attachment">
              Documento: {documentAttachment.name}{" "}
              <button
                type="button"
                className="ghost"
                onClick={() => setDocumentAttachment(null)}
              >
                Remover
              </button>
            </div>
          )}
          {screenImage && (
            <div className="screen-capture-attachment">
              <img
                src={screenImage.preview}
                alt="Prévia da captura de tela que será enviada"
              />
              <span>Captura pronta para envio</span>
              <button
                type="button"
                className="ghost"
                aria-label="Remover captura de tela"
                onClick={() => setScreenImage(null)}
              >
                <X size={16} />
              </button>
            </div>
          )}
          <textarea
            ref={draftInput}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              const el = event.target;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
            }}
            placeholder="Escreva sua mensagem… (digite / para comandos)"
            disabled={sending}
            rows={1}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <div className="composer-actions">
            <button
              ref={attachButton}
              className="ghost attach-plus"
              type="button"
              disabled={(!activeConversation && !anonymous) || sending}
              onClick={openAttachMenu}
              aria-label="Adicionar"
            >
              <Plus size={24} aria-hidden="true" />
            </button>
            {draft.trim().startsWith("/") &&
              !/^\s*\/(?:ver|olhar) minha tela\b/i.test(draft) && (
                <button
                  className="ghost screen-command"
                  type="button"
                  disabled={
                    (!activeConversation && !anonymous) || sending || screenBusy
                  }
                  onClick={() => {
                    setDraft("/ver minha tela ");
                    draftInput.current?.focus();
                  }}
                >
                  <Eye size={16} aria-hidden="true" />
                  Ver minha tela
                </button>
              )}
            {screenBusy && (
              <span className="muted screen-command-status">
                Escolha uma tela ou janela…
              </span>
            )}
            <button
              className="ghost model-chip"
              type="button"
              onClick={() => setShowModels(true)}
              title="Trocar modelo"
            >
              {modelLabel}
            </button>
            <button
              className={`ghost mic-button ${isListening ? "listening" : ""}`}
              type="button"
              onClick={toggleListening}
              title={isListening ? "Parar de ouvir" : "Falar mensagem (Microfone)"}
              aria-label={isListening ? "Parar de ouvir" : "Falar mensagem"}
            >
              {isListening ? (
                <MicOff size={20} aria-hidden="true" />
              ) : (
                <Mic size={20} aria-hidden="true" />
              )}
            </button>
            <button
              className="primary send-button"
              type="submit"
              disabled={
                (!activeConversation && !anonymous) ||
                (!draft.trim() && !documentAttachment && !screenImage) ||
                sending
              }
              aria-label={sending ? "Enviando" : "Enviar"}
            >
              {sending ? "…" : <ArrowUp size={24} aria-hidden="true" />}
            </button>
          </div>
        </form>
      </section>

      {showSearch && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowSearch(false);
              setSearchQuery("");
            }
          }}
        >
          <section
            className="settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="search-title"
          >
            <h2 id="search-title">Buscar conversas</h2>
            <input
              className="sidebar-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Digite para buscar…"
              aria-label="Buscar conversas"
              autoFocus
            />
            <div className="workspace-list">
              {searchResults.map((conversation) => (
                <button
                  key={conversation.id}
                  className="model-option"
                  onClick={() => {
                    void selectConversation(conversation.id);
                    setShowSearch(false);
                    setSearchQuery("");
                  }}
                >
                  <span>{conversation.title}</span>
                  <small className="muted">{conversation.model}</small>
                </button>
              ))}
              {searchResults.length === 0 && (
                <p className="muted">Nenhuma conversa encontrada.</p>
              )}
              {!searchQuery.trim() &&
                conversations.length > searchResults.length && (
                  <p className="muted">
                    Mostrando as {searchResults.length} mais recentes — digite
                    para buscar entre todas.
                  </p>
                )}
              {!!searchQuery.trim() &&
                searchResults.length === SEARCH_MATCH_LIMIT && (
                  <p className="muted">
                    Mostrando os primeiros {SEARCH_MATCH_LIMIT} resultados.
                  </p>
                )}
            </div>
            <footer>
              <button
                className="ghost"
                onClick={() => {
                  setShowSearch(false);
                  setSearchQuery("");
                }}
              >
                Fechar
              </button>
            </footer>
          </section>
        </div>
      )}

      {renameTarget && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeRename();
          }}
        >
          <section
            className="settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-title"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void renameConversation();
              }
              if (event.key === "Escape") closeRename();
            }}
          >
            <h2 id="rename-title">Renomear conversa</h2>
            <input
              className="sidebar-search"
              value={renameDraft}
              onChange={(event) => {
                setRenameDraft(event.target.value);
                if (renameError) setRenameError(null);
              }}
              onFocus={(event) => event.currentTarget.select()}
              placeholder="Título da conversa"
              aria-label="Título da conversa"
              maxLength={120}
              autoFocus
            />
            {renameError && (
              <p className="muted" role="alert" style={{ color: "var(--err)" }}>
                {renameError}
              </p>
            )}
            <footer>
              <button
                type="button"
                className="ghost"
                disabled={renaming}
                onClick={closeRename}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="primary"
                disabled={renaming || !renameDraft.trim()}
                onClick={() => void renameConversation()}
              >
                {renaming ? "Salvando…" : "Salvar"}
              </button>
            </footer>
          </section>
        </div>
      )}

      {showRemote && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowRemote(false);
          }}
        >
          <section
            className="settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="remote-title"
          >
            <h2 id="remote-title">Remote</h2>
            {remoteError && <Notice kind="error">{remoteError}</Notice>}
            {remoteTasks.length === 0 && !remoteError && (
              <p className="muted">Nenhuma tarefa recente.</p>
            )}
            <div className="workspace-list">
              {remoteTasks.map((task) => (
                <div key={task.id}>
                  <strong>{task.prompt}</strong>
                  <p className="muted task-meta">
                    <span className={`task-status ${statusClass(task.status)}`}>
                      {statusLabel(task.status)}
                    </span>
                    {task.stepLabel ? ` · ${task.stepLabel}` : ""}
                    {task.progress ? ` · ${task.progress}%` : ""}
                  </p>
                  {task.progress > 0 && task.status === "running" && (
                    <div className="task-progress">
                      <span
                        style={{ width: `${Math.min(task.progress, 100)}%` }}
                      />
                    </div>
                  )}
                  {task.error && <Notice kind="error">{task.error}</Notice>}
                  {remoteApprovals[task.id]?.status === "pending" && (
                    <p className="muted">
                      {remoteApprovals[task.id]?.impactSummary}
                    </p>
                  )}
                  <div className="organize-actions">
                    {remoteApprovals[task.id]?.status === "pending" && (
                      <>
                        <button
                          className="primary"
                          onClick={() =>
                            void api.resolveApproval(
                              session!.accessToken,
                              remoteApprovals[task.id]!.id,
                              true,
                            )
                          }
                        >
                          Aprovar
                        </button>
                        <button
                          className="ghost"
                          onClick={() =>
                            void api.resolveApproval(
                              session!.accessToken,
                              remoteApprovals[task.id]!.id,
                              false,
                            )
                          }
                        >
                          Negar
                        </button>
                      </>
                    )}
                    {(task.status === "pending" ||
                      task.status === "running") && (
                      <button
                        className="ghost"
                        onClick={() =>
                          void api.cancelTask(session!.accessToken, task.id)
                        }
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <footer>
              <button className="ghost" onClick={() => setShowRemote(false)}>
                Fechar
              </button>
            </footer>
          </section>
        </div>
      )}

      <ModelPicker
        visible={showModels}
        provider={modelProvider}
        selected={
          activeChat?.model ??
          pendingModel ??
          (anonymous ? (modelProvider?.defaultModel ?? undefined) : undefined)
        }
        accessToken={session?.accessToken}
        onClose={() => setShowModels(false)}
        onSelect={(model) => void chooseModel(model)}
      />

      {showModal && session && (
        <ApiKeyModal
          session={session}
          providers={providers}
          onSaved={onProviderSaved}
          onClose={() => {
            setShowSettings(false);
            void onProviderSaved();
          }}
        />
      )}

      {showAttach && (
        <div
          className="attach-menu-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowAttach(false);
              setShowProjectChoices(false);
            }
          }}
        >
          <section
            className="settings-dialog account-dialog composer-attach-menu"
            style={
              attachPosition
                ? {
                    left: attachPosition.left,
                    bottom: attachPosition.bottom,
                    width: attachPosition.width,
                  }
                : undefined
            }
            role="dialog"
            aria-modal="true"
            aria-labelledby="attach-title"
          >
            <div className="composer-menu-options">
              <button
                className="composer-menu-option"
                onClick={() => {
                  setShowAttach(false);
                  setShowProjectChoices(false);
                  documentInput.current?.click();
                }}
              >
                <span>Adicionar arquivos</span>
              </button>
              <button
                className="composer-menu-option"
                aria-expanded={showProjectChoices}
                onClick={() => {
                  setShowProjectChoices((visible) => !visible);
                  if (projects.length === 0 && session)
                    void api
                      .listProjects(session.accessToken)
                      .then(setProjects)
                      .catch((err: unknown) =>
                        setChatError(
                          err instanceof Error
                            ? err.message
                            : "Não foi possível carregar os projetos.",
                        ),
                      );
                }}
              >
                <span>
                  {selectedProjectId
                    ? `Projeto: ${projects.find((project) => project.id === selectedProjectId)?.name ?? "Selecionado"}`
                    : "Adicionar ao projeto"}
                </span>
                {selectedProjectId && <Check size={16} aria-hidden="true" />}
              </button>
              {showProjectChoices && (
                <div className="composer-project-list">
                  {projects.length === 0 && (
                    <p className="muted">Nenhum projeto disponível.</p>
                  )}
                  {projects.map((project) => (
                    <button
                      key={project.id}
                      className="composer-menu-option"
                      aria-pressed={selectedProjectId === project.id}
                      onClick={() =>
                        setSelectedProjectId((current) =>
                          current === project.id ? null : project.id,
                        )
                      }
                    >
                      <span>{project.name}</span>
                      {selectedProjectId === project.id && (
                        <Check size={16} aria-hidden="true" />
                      )}
                    </button>
                  ))}
                </div>
              )}
              <div className="composer-menu-divider" />
              <button
                className="composer-menu-option"
                aria-pressed={chatWebSearch}
                onClick={() => setChatWebSearch((enabled) => !enabled)}
              >
                <span>Pesquisa na web</span>
                {chatWebSearch && <Check size={16} aria-hidden="true" />}
              </button>
              <button
                className="composer-menu-option"
                aria-pressed={chatMemoryEnabled}
                onClick={() => setChatMemoryEnabled((enabled) => !enabled)}
              >
                <span>Memória</span>
                {chatMemoryEnabled && <Check size={16} aria-hidden="true" />}
              </button>
            </div>
          </section>
        </div>
      )}

      {showAccount && session && accountAnchor && (
        <>
          <div
            className="popover-backdrop"
            role="presentation"
            onMouseDown={() => setShowAccount(false)}
          />
          <div
            className="account-popover"
            role="menu"
            aria-label="Conta"
            style={{
              left: accountAnchor.left,
              top: accountAnchor.top,
              width: Math.max(accountAnchor.width, 240),
            }}
          >
            <div className="account-header">
              <span className="account-avatar" aria-hidden="true">
                {(
                  session.user.name?.trim()?.[0] ??
                  session.user.email?.[0] ??
                  "?"
                ).toUpperCase()}
              </span>
              <div className="account-popover-user">
                <strong>{session.user.name?.trim() || "Conta"}</strong>
                <span className="muted">{session.user.email}</span>
              </div>
            </div>
            <div className="account-popover-actions">
              <button
                className="ghost account-option"
                role="menuitem"
                onClick={() => {
                  setShowAccount(false);
                  setSettingsSection("geral");
                  setShowSettings(true);
                }}
              >
                Configurações
              </button>
              <button
                className="ghost account-option danger"
                role="menuitem"
                onClick={() => {
                  setShowAccount(false);
                  void logout();
                }}
              >
                Sair
              </button>
            </div>
          </div>
        </>
      )}

      {showSettings && session && (
        <SettingsModal
          session={session}
          section={settingsSection}
          onSectionChange={setSettingsSection}
          onClose={() => setShowSettings(false)}
          onProviderSaved={onProviderSaved}
          onLoadMemories={loadMemories}
          providers={providers}
          onRemoveProvider={removeProvider}
          notion={notion}
          notionBusy={notionBusy}
          notionMessage={notionMessage}
          onConnectNotion={connectNotion}
          onDisconnectNotion={disconnectNotion}
          onRefreshNotion={refreshNotion}
          calendar={calendar}
          calendarBusy={calendarBusy}
          calendarMessage={calendarMessage}
          onConnectCalendar={connectCalendar}
          onDisconnectCalendar={disconnectCalendar}
          onRefreshCalendar={refreshCalendar}
          workspaceItems={workspaceItems}
          workspaceLabel={workspaceLabel}
          workspacePath={workspacePath}
          onWorkspaceLabelChange={setWorkspaceLabel}
          onWorkspacePathChange={setWorkspacePath}
          onRemoveWorkspace={removeWorkspace}
          onSuggestWorkspaces={suggestWorkspaces}
          onSaveWorkspaces={saveWorkspaces}
          memorySettings={memorySettings}
          memorySuggestions={memorySuggestions}
          memories={memories}
          memoryKey={memoryKey}
          memoryValue={memoryValue}
          memoryCategory={memoryCategory}
          memoryError={memoryError}
          onMemoryKeyChange={setMemoryKey}
          onMemoryValueChange={setMemoryValue}
          onMemoryCategoryChange={setMemoryCategory}
          onUpdateMemorySetting={updateMemorySetting}
          onAcceptMemorySuggestion={acceptMemorySuggestion}
          onDismissMemorySuggestion={dismissMemorySuggestion}
          onDeleteMemory={deleteMemory}
          onClearAllMemories={clearAllMemories}
          onSaveMemory={saveMemory}
          onEditMemory={(item) => {
            setMemoryKey(item.key);
            setMemoryValue(item.value);
            setMemoryCategory(item.category || "context");
          }}
        />
      )}

    </main>
  );
}

export default App;

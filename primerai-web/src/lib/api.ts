import { apiUrl } from "./config";

export type User = {
  id: string;
  email: string;
  name: string | null;
};

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: number;
  user: User;
};

export type Conversation = {
  id: string;
  title: string;
  providerId: string;
  model: string;
  createdAt: string;
  updatedAt: string;
};

export type Message = {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  parts: ({ type: "text"; text: string } | { type: "image"; attachmentId: string; mimeType: string; name: string })[];
  createdAt: string;
};

export type ChatAttachment = {
  id: string;
  conversationId: string;
  mimeType: string;
  byteSize: number;
  originalName: string;
  status: "uploading" | "processing" | "ready" | "failed" | "expired";
  createdAt: string;
};

export type Provider = {
  id: string;
  provider: string;
  name: string;
  isDefault: boolean;
  defaultModel?: string;
  keyHint?: string;
};

export type Device = {
  id: string;
  name: string;
  platform: string;
  kind: string;
  status: "online" | "offline";
  lastSeenAt: string | null;
};

export type Memory = { key: string; value: string; category: string; origin: string; projectId: string | null; validUntil: string | null; createdAt: string; updatedAt: string };
export type ProjectProfile = { id: string; name: string; objective: string | null; stack: string[]; decisions: string[]; status: "active" | "paused" | "completed" | "archived"; lastConfirmedAt: string; createdAt: string; updatedAt: string };
export type MemorySettings = { useMemoriesInChat: boolean; automaticSuggestionsEnabled: boolean };
export type MemoryUsage = { memories: Array<{ key: string; category: string }>; projects: Array<{ id: string; name: string }> };

export function getSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("primerai.session");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    localStorage.removeItem("primerai.session");
    return null;
  }
}

export async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const session = getSession();
  if (!session?.accessToken) {
    throw new Error("Não autenticado");
  }

  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${session.accessToken}`);
  if (options.body && typeof options.body === "string" && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`${apiUrl}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    localStorage.removeItem("primerai.session");
    window.location.assign("/entrar");
    throw new Error("Sessão expirada. Faça login novamente.");
  }

  return response;
}

export async function listConversations(): Promise<Conversation[]> {
  const res = await fetchWithAuth("/v1/conversations");
  if (!res.ok) throw new Error("Erro ao carregar conversas.");
  const data = await res.json();
  return data.conversations || [];
}

export async function createConversation(providerId?: string, model?: string): Promise<Conversation> {
  const res = await fetchWithAuth("/v1/conversations", {
    method: "POST",
    body: JSON.stringify({ providerId, model }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Erro ao criar conversa.");
  return data.conversation;
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const res = await fetchWithAuth(`/v1/conversations/${conversationId}/messages`);
  if (!res.ok) throw new Error("Erro ao carregar mensagens.");
  const data = await res.json();
  return data.messages || [];
}

export async function uploadChatImage(conversationId: string, image: { name: string; mimeType: string; data: string }): Promise<ChatAttachment> {
  const res = await fetchWithAuth(`/v1/conversations/${conversationId}/attachments`, {
    method: "POST",
    body: JSON.stringify(image),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Erro ao enviar imagem.");
  return data.attachment;
}

export async function sendMessage(conversationId: string, content: string, attachmentIds: string[] = []): Promise<{ messages: Message[]; memoryUsage: MemoryUsage }> {
  const res = await fetchWithAuth(`/v1/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content, ...(attachmentIds.length ? { parts: attachmentIds.map((attachmentId) => ({ type: "image", attachmentId })) } : {}) }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Erro ao enviar mensagem.");
  return { messages: data.messages || [], memoryUsage: data.memoryUsage || { memories: [], projects: [] } };
}

export async function deleteConversation(conversationId: string): Promise<void> {
  const res = await fetchWithAuth(`/v1/conversations/${conversationId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Erro ao excluir conversa.");
}

export async function listProviders(): Promise<Provider[]> {
  const res = await fetchWithAuth("/v1/providers");
  if (!res.ok) return [];
  const data = await res.json();
  return data.providers || [];
}

export async function listDevices(): Promise<Device[]> {
  const res = await fetchWithAuth("/v1/devices");
  if (!res.ok) return [];
  const data = await res.json();
  return data.devices || [];
}

export async function listMemories(): Promise<Memory[]> {
  const res = await fetchWithAuth("/v1/memories");
  if (!res.ok) throw new Error("Erro ao carregar memórias.");
  return (await res.json()).memories || [];
}

export async function listProjects(): Promise<ProjectProfile[]> {
  const res = await fetchWithAuth("/v1/projects");
  if (!res.ok) throw new Error("Erro ao carregar projetos.");
  return (await res.json()).projects || [];
}

export async function createProject(input: Pick<ProjectProfile, "name"> & Partial<Pick<ProjectProfile, "objective" | "stack" | "decisions" | "status">>): Promise<ProjectProfile> {
  const res = await fetchWithAuth("/v1/projects", { method: "POST", body: JSON.stringify(input) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Não foi possível criar o projeto.");
  return data.project;
}

export async function updateProject(id: string, input: Partial<Pick<ProjectProfile, "name" | "objective" | "stack" | "decisions" | "status">> & { confirm?: boolean }): Promise<ProjectProfile> {
  const res = await fetchWithAuth(`/v1/projects/${id}`, { method: "PATCH", body: JSON.stringify(input) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Não foi possível atualizar o projeto.");
  return data.project;
}

export async function deleteProject(id: string): Promise<void> {
  const res = await fetchWithAuth(`/v1/projects/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Não foi possível excluir o projeto.");
}

export async function getMemorySettings(): Promise<MemorySettings> {
  const res = await fetchWithAuth("/v1/memory-settings");
  if (!res.ok) throw new Error("Erro ao carregar configurações de memória.");
  return (await res.json()).settings;
}

export async function updateMemorySettings(input: Partial<MemorySettings>): Promise<MemorySettings> {
  const res = await fetchWithAuth("/v1/memory-settings", { method: "PATCH", body: JSON.stringify(input) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Não foi possível atualizar a memória.");
  return data.settings;
}

export async function deleteMemory(key: string): Promise<void> {
  const res = await fetchWithAuth(`/v1/memories/${encodeURIComponent(key)}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Não foi possível apagar a memória.");
}

export async function saveMemory(key: string, value: string, category = "context", projectId?: string | null, validUntil?: string | null): Promise<Memory> {
  const res = await fetchWithAuth(`/v1/memories/${encodeURIComponent(key)}`, { method: "PUT", body: JSON.stringify({ value, category, projectId, validUntil }) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Não foi possível salvar a memória.");
  return data.memory;
}

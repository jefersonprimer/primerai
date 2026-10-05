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

export async function sendMessage(conversationId: string, content: string): Promise<Message[]> {
  const res = await fetchWithAuth(`/v1/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Erro ao enviar mensagem.");
  return data.messages;
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

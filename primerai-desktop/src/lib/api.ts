import { routes, type AIModel, type AiProvider, type ChatMessage, type Conversation, type ProviderId } from "@primerai/shared";

const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:8787").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: number;
  user: SessionUser;
}

const SESSION_KEY = "primerai.session";

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function getStoredSession(): Session | null {
  return readSession();
}

export function storeSession(session: Session | null): void {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

async function request<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(err?.code ?? "http_error", err?.message ?? `HTTP ${res.status}`, res.status);
  }

  return body as T;
}

export const api = {
  baseUrl: API_URL,

  health: () => request<{ status: string; version: string }>(routes.health),

  register: async (input: { email: string; password: string }, name?: string): Promise<Session> => {
    const { session } = await request<{ session: Session }>("/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ ...input, name }),
    });
    storeSession(session);
    return session;
  },

  login: async (input: { email: string; password: string }): Promise<Session> => {
    const { session } = await request<{ session: Session }>("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    });
    storeSession(session);
    return session;
  },

  logout: async (token: string): Promise<void> => {
    try {
      await request<void>("/v1/auth/logout", { method: "POST" }, token);
    } finally {
      storeSession(null);
    }
  },

  me: (token: string) =>
    request<{ user: SessionUser; counts: { providers: number; devices: number } }>(
      routes.me,
      {},
      token,
    ),

  listProviders: (token: string) =>
    request<{ providers: AiProvider[] }>(routes.providers, {}, token).then((r) => r.providers),

  createProvider: (
    token: string,
    input: {
      provider: ProviderId;
      apiKey: string;
      baseUrl?: string;
      defaultModel?: string;
      makeDefault?: boolean;
    },
  ) =>
    request<{ provider: AiProvider }>(
      routes.providers,
      { method: "POST", body: JSON.stringify(input) },
      token,
    ).then((r) => r.provider),

  updateProvider: (
    token: string,
    id: string,
    patch: Partial<{ apiKey: string; defaultModel: string | null; isDefault: boolean; label: string }>,
  ) =>
    request<{ provider: AiProvider }>(
      `${routes.provider(id)}`,
      { method: "PATCH", body: JSON.stringify(patch) },
      token,
    ).then((r) => r.provider),

  deleteProvider: (token: string, id: string) =>
    request<void>(`${routes.provider(id)}`, { method: "DELETE" }, token),

  testProvider: (token: string, id: string) =>
    request<{
      result:
        | { ok: true; org: string | null; message: string }
        | { ok: false; code: string; message: string };
    }>(`${routes.providerTest(id)}`, { method: "POST" }, token).then((r) => r.result),

  listModels: (token: string, id: string) =>
    request<{ models: AIModel[] }>(`${routes.providerModels(id)}`, {}, token).then((r) => r.models),

  listConversations: (token: string) =>
    request<{ conversations: Conversation[] }>(routes.conversations, {}, token).then((r) => r.conversations),

  createConversation: (token: string) =>
    request<{ conversation: Conversation }>(routes.conversations, { method: "POST", body: JSON.stringify({}) }, token)
      .then((r) => r.conversation),

  deleteConversation: (token: string, id: string) =>
    request<void>(routes.conversation(id), { method: "DELETE" }, token),

  listMessages: (token: string, id: string) =>
    request<{ messages: ChatMessage[] }>(routes.conversationMessages(id), {}, token).then((r) => r.messages),

  sendMessage: (token: string, id: string, content: string) =>
    request<{ messages: ChatMessage[] }>(routes.conversationMessages(id), {
      method: "POST",
      body: JSON.stringify({ content }),
    }, token).then((r) => r.messages),

  registerDevice: (token: string) => {
    const key = "primerai.desktop.install-id";
    let installId = localStorage.getItem(key);
    if (!installId) { installId = crypto.randomUUID().slice(0, 8); localStorage.setItem(key, installId); }
    const platform = navigator.platform || "desktop";
    return request<{ device: { id: string; name: string; status: string } }>(routes.deviceRegister, {
      method: "POST", body: JSON.stringify({ name: `PrimerAI-${platform}-${installId}`, platform }),
    }, token).then((r) => r.device);
  },

  listDevices: (token: string) => request<{ devices: { id: string; name: string; status: "online" | "offline" }[] }>(routes.devices, {}, token).then((r) => r.devices),
  listWorkspaces: (token: string, id: string) => request<{ workspaces: { label: string; path: string; enabled: boolean }[] }>(routes.deviceWorkspaces(id), {}, token).then((r) => r.workspaces),
  saveWorkspaces: (token: string, id: string, items: { label: string; path: string }[]) => request<void>(routes.deviceWorkspaces(id), {
    method: "PUT", body: JSON.stringify({ items }),
  }, token),
  claimTask: (token: string, id: string) => request<{ task: { id: string; prompt: string } | null }>(routes.deviceClaimTask(id), { method: "POST" }, token).then((r) => r.task),
  listTasks: (token: string) => request<{ tasks: { id: string; deviceId: string; status: string }[] }>(routes.tasks, {}, token).then((r) => r.tasks),
  summarize: (token: string, instruction: string, documents: { name: string; text: string }[]) => request<{ output: string }>("/v1/agent/summarize", {
    method: "POST", body: JSON.stringify({ instruction, documents }),
  }, token).then((r) => r.output),
  research: (token: string, prompt: string) => request<{ output: string; sources: { title: string; url: string }[] }>("/v1/agent/research", {
    method: "POST", body: JSON.stringify({ prompt }),
  }, token),
  finishTask: (token: string, id: string, result: { output?: string; error?: string }) => request<void>(`/v1/tasks/${id}/result`, {
    method: "POST", body: JSON.stringify(result),
  }, token),
  updateTask: (token: string, id: string, progress: number, stepLabel: string) => request<void>(`/v1/tasks/${id}/progress`, {
    method: "PATCH", body: JSON.stringify({ progress, stepLabel }),
  }, token),
};

export type { AIModel, AiProvider };

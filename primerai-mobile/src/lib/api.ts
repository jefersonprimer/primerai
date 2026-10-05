import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { routes, type AIModel, type AiProvider, type ChatMessage, type Conversation, type Memory, type ProviderId } from '@primerai/shared';

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://192.168.5.22:8787').replace(/\/+$/, '');

/**
 * SecureStore não existe no web. No navegador o fallback é localStorage —
 * aceitável porque self-host é o caso comum do MVP, mas num deploy hosted
 * o desktop é quem guarda a chave, não o celular.
 */
const secureStore = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return globalThis.localStorage?.getItem(key) ?? null;
    }
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async remove(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
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

export type RemoteTaskStatus =
  | 'pending'
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface RemoteDevice {
  id: string;
  kind: 'desktop' | 'mobile';
  name: string;
  platform: string;
  status: 'online' | 'offline';
  lastSeenAt: string | null;
}

export interface RemoteTask {
  id: string;
  deviceId: string;
  prompt: string;
  status: RemoteTaskStatus;
  progress: number;
  stepLabel: string | null;
  /** o backend persiste `{ text }` em `routes/tasks.ts`, apesar do TaskSchema declarar string */
  output: { text?: string } | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

const SESSION_KEY = 'primerai.session';

export async function getStoredSession(): Promise<Session | null> {
  const raw = await secureStore.get(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export async function storeSession(session: Session | null): Promise<void> {
  if (session) await secureStore.set(SESSION_KEY, JSON.stringify(session));
  else await secureStore.remove(SESSION_KEY);
}

async function request<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    // erro de rede puro: fetch só lança quando nem chegou no servidor
    throw new ApiError('network_error', `servidor ${API_URL} não respondeu`, 0);
  }

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(err?.code ?? 'http_error', err?.message ?? `HTTP ${res.status}`, res.status);
  }

  return body as T;
}

export const api = {
  baseUrl: API_URL,

  health: () => request<{ status: string; version: string }>(routes.health),

  register: async (input: { email: string; password: string }, name?: string): Promise<Session> => {
    const { session } = await request<{ session: Session }>('/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ ...input, name }),
    });
    await storeSession(session);
    return session;
  },

  login: async (input: { email: string; password: string }): Promise<Session> => {
    const { session } = await request<{ session: Session }>('/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    await storeSession(session);
    return session;
  },

  exchangeNativeCode: (code: string) => request<{ session: Session }>('/v1/auth/native-exchange', {
    method: 'POST', body: JSON.stringify({ code }),
  }).then((r) => r.session),

  logout: async (token: string): Promise<void> => {
    try {
      await request<void>('/v1/auth/logout', { method: 'POST' }, token);
    } finally {
      await storeSession(null);
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
    input: { provider: ProviderId; apiKey: string; baseUrl?: string; defaultModel?: string; makeDefault?: boolean },
  ) =>
    request<{ provider: AiProvider }>(
      routes.providers,
      { method: 'POST', body: JSON.stringify(input) },
      token,
    ).then((r) => r.provider),

  updateProvider: (
    token: string,
    id: string,
    patch: Partial<{ apiKey: string; defaultModel: string | null; isDefault: boolean; label: string }>,
  ) =>
    request<{ provider: AiProvider }>(
      `${routes.provider(id)}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
      token,
    ).then((r) => r.provider),

  deleteProvider: (token: string, id: string) =>
    request<void>(`${routes.provider(id)}`, { method: 'DELETE' }, token),

  testProvider: (token: string, id: string) =>
    request<{
      result:
        | { ok: true; org: string | null; message: string }
        | { ok: false; code: string; message: string };
    }>(`${routes.providerTest(id)}`, { method: 'POST' }, token).then((r) => r.result),

  listModels: (token: string, id: string) =>
    request<{ models: AIModel[] }>(`${routes.providerModels(id)}`, {}, token).then((r) => r.models),

  listConversations: (token: string) =>
    request<{ conversations: Conversation[] }>(routes.conversations, {}, token).then((r) => r.conversations),

  listMemories: (token: string) => request<{ memories: Memory[] }>(routes.memories, {}, token).then((r) => r.memories),
  saveMemory: (token: string, key: string, value: string, category = 'context') => request<{ memory: Memory }>(routes.memory(key), { method: 'PUT', body: JSON.stringify({ value, category }) }, token).then((r) => r.memory),
  deleteMemory: (token: string, key: string) => request<void>(routes.memory(key), { method: 'DELETE' }, token),

  createConversation: (token: string, model?: string) =>
    request<{ conversation: Conversation }>(routes.conversations, {
      method: 'POST',
      body: JSON.stringify(model ? { model } : {}),
    }, token).then((r) => r.conversation),

  updateConversationModel: (token: string, id: string, model: string) =>
    request<{ conversation: Conversation }>(routes.conversation(id), {
      method: 'PATCH',
      body: JSON.stringify({ model }),
    }, token).then((r) => r.conversation),

  updateConversationTitle: (token: string, id: string, title: string) =>
    request<{ conversation: Conversation }>(routes.conversation(id), {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }, token).then((r) => r.conversation),

  deleteConversation: (token: string, id: string) =>
    request<void>(routes.conversation(id), { method: 'DELETE' }, token),

  listMessages: (token: string, id: string) =>
    request<{ messages: ChatMessage[] }>(routes.conversationMessages(id), {}, token).then((r) => r.messages),

  sendMessage: (token: string, id: string, content: string, images?: { mimeType: string; data: string }[]) =>
    request<{ messages: ChatMessage[] }>(routes.conversationMessages(id), {
      method: 'POST',
      body: JSON.stringify({ content, images }),
    }, token).then((r) => r.messages),

  sendAnonymousMessage: (token: string, model: string | undefined, messages: { role: 'user' | 'assistant'; content: string; images?: { mimeType: string; data: string }[] }[]) =>
    request<{ answer: string; model: string }>('/v1/agent/chat', {
      method: 'POST',
      body: JSON.stringify({ model, messages }),
    }, token),

  listDevices: (token: string) =>
    request<{ devices: RemoteDevice[] }>(routes.devices, {}, token).then((r) => r.devices),

  createTask: (token: string, deviceId: string, prompt: string) =>
    request<{ task: RemoteTask }>(routes.tasks, {
      method: 'POST', body: JSON.stringify({ deviceId, prompt }),
    }, token).then((r) => r.task),

  listTasks: (token: string) =>
    request<{ tasks: RemoteTask[] }>(routes.tasks, {}, token).then((r) => r.tasks),

  cancelTask: (token: string, id: string) =>
    request<{ task: RemoteTask }>(`${routes.tasks}/${id}/cancel`, { method: 'POST' }, token).then((r) => r.task),

  deleteTask: (token: string, id: string) =>
    request<void>(`${routes.tasks}/${id}`, { method: 'DELETE' }, token),
};

export type { AIModel, AiProvider };

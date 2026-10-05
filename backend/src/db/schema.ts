import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { RiskLevel, TaskStatus } from "@primerai/shared";

export const providerIdEnum = pgEnum("provider_id", ["openai", "google", "openrouter", "ollama"]);
export const taskStatusEnum = pgEnum("task_status", [
  "pending",
  "running",
  "waiting_approval",
  "completed",
  "failed",
  "cancelled",
]);
export const deviceKindEnum = pgEnum("device_kind", ["desktop", "mobile"]);
export const deviceStatusEnum = pgEnum("device_status", ["online", "offline"]);
export const riskLevelEnum = pgEnum("risk_level", ["safe", "confirm", "blocked"]);
export const approvalStatusEnum = pgEnum("approval_status", [
  "pending",
  "approved",
  "denied",
  "expired",
  "auto",
]);
export const toolCallStatusEnum = pgEnum("tool_call_status", [
  "pending",
  "running",
  "ok",
  "denied",
  "error",
]);
export const chatMessageRoleEnum = pgEnum("chat_message_role", ["user", "assistant"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  googleSub: text("google_sub").unique(),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  ...timestamps,
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const nativeAuthCodes = pgTable(
  "native_auth_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("native_auth_codes_expiry_idx").on(t.expiresAt)],
);

/**
 * A key vive cifrada (AES-256-GCM, master key no env). `key_hint` é só um
 * preview para UI — a key em si nunca sai do backend.
 */
export const aiProviders = pgTable(
  "ai_providers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: providerIdEnum("provider").notNull(),
    label: text("label").notNull(),
    baseUrl: text("base_url").notNull(),
    apiKeyEnc: text("api_key_enc").notNull(),
    keyHint: text("key_hint").notNull(),
    defaultModel: text("default_model"),
    isDefault: boolean("is_default").notNull().default(false),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("ai_providers_user_idx").on(t.userId),
    uniqueIndex("ai_providers_user_default_idx")
      .on(t.userId)
      .where(sql`${t.isDefault} = true`),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    providerId: uuid("provider_id").notNull().references(() => aiProviders.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Nova conversa"),
    model: text("model").notNull(),
    ...timestamps,
  },
  (t) => [index("conversations_user_updated_idx").on(t.userId, t.updatedAt)],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    role: chatMessageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("chat_messages_conversation_created_idx").on(t.conversationId, t.createdAt)],
);

export const devices = pgTable(
  "devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: deviceKindEnum("kind").notNull(),
    name: text("name").notNull(),
    platform: text("platform").notNull(),
    osVersion: text("os_version"),
    agentVersion: text("agent_version"),
    status: deviceStatusEnum("status").notNull().default("offline"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("devices_user_idx").on(t.userId)],
);

export const deviceTokens = pgTable(
  "device_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    scopes: text("scopes").array().notNull().default(sql`ARRAY['agent']::text[]`),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("device_tokens_device_idx").on(t.deviceId)],
);

export const pairings = pgTable(
  "pairings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    code: text("code").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    claimedByDeviceId: uuid("claimed_by_device_id").references(() => devices.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pairings_user_idx").on(t.userId)],
);

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    path: text("path").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("workspaces_user_idx").on(t.userId),
    index("workspaces_device_idx").on(t.deviceId),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    providerId: uuid("provider_id").references(() => aiProviders.id, { onDelete: "set null" }),
    model: text("model"),
    prompt: text("prompt").notNull(),
    status: taskStatusEnum("status").notNull().default("pending"),
    progress: smallint("progress").notNull().default(0),
    stepLabel: text("step_label"),
    input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
    output: jsonb("output").$type<Record<string, unknown> | null>(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("tasks_user_idx").on(t.userId, t.createdAt),
    index("tasks_device_idx").on(t.deviceId),
    index("tasks_status_idx").on(t.status),
  ],
);

export const taskEvents = pgTable(
  "task_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("task_events_seq_idx").on(t.taskId, t.seq)],
);

export const toolCalls = pgTable(
  "tool_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    callId: text("call_id").notNull(),
    tool: text("tool").notNull(),
    args: jsonb("args").$type<Record<string, unknown>>().notNull().default({}),
    result: jsonb("result").$type<Record<string, unknown> | null>(),
    status: toolCallStatusEnum("status").notNull().default("pending"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tool_calls_seq_idx").on(t.taskId, t.seq)],
);

export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    toolCallId: uuid("tool_call_id").references(() => toolCalls.id, { onDelete: "cascade" }),
    tool: text("tool").notNull(),
    args: jsonb("args").$type<Record<string, unknown>>().notNull().default({}),
    risk: riskLevelEnum("risk").$type<RiskLevel>().notNull(),
    impactSummary: text("impact_summary").notNull(),
    status: approvalStatusEnum("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("approvals_task_idx").on(t.taskId), index("approvals_status_idx").on(t.status)],
);

export const artifacts = pgTable(
  "artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    path: text("path").notNull(),
    mime: text("mime").notNull().default("application/octet-stream"),
    sizeBytes: integer("size_bytes").notNull().default(0),
    uploaded: boolean("uploaded").notNull().default(false),
    storageKey: text("storage_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("artifacts_task_idx").on(t.taskId)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    deviceId: uuid("device_id").references(() => devices.id, { onDelete: "set null" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    tool: text("tool").notNull(),
    argsDigest: text("args_digest").notNull(),
    outcome: text("outcome").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_user_idx").on(t.userId, t.createdAt)],
);

/** Preferências e fatos que a IA deve lembrar entre conversas. */
export const memories = pgTable(
  "memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: jsonb("value").$type<unknown>().notNull(),
    category: text("category").notNull().default("context"),
    sourceTaskId: uuid("source_task_id").references(() => tasks.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("memories_user_key_idx").on(t.userId, t.key)],
);

/** Fase futura: automações (cron) */
export const schedules = pgTable(
  "schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    cron: text("cron").notNull(),
    prompt: text("prompt").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("schedules_user_idx").on(t.userId)],
);

export const usersRelations = relations(users, ({ many }) => ({
  providers: many(aiProviders),
  devices: many(devices),
  tasks: many(tasks),
  workspaces: many(workspaces),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  device: one(devices, { fields: [tasks.deviceId], references: [devices.id] }),
  provider: one(aiProviders, { fields: [tasks.providerId], references: [aiProviders.id] }),
  events: many(taskEvents),
  artifacts: many(artifacts),
  approvals: many(approvals),
}));

export const devicesRelations = relations(devices, ({ one, many }) => ({
  user: one(users, { fields: [devices.userId], references: [users.id] }),
  workspaces: many(workspaces),
  tasks: many(tasks),
}));

export type UserRow = typeof users.$inferSelect;
export type AiProviderRow = typeof aiProviders.$inferSelect;
export type DeviceRow = typeof devices.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type WorkspaceRow = typeof workspaces.$inferSelect;
export type ArtifactRow = typeof artifacts.$inferSelect;
export type TaskStatusRow = TaskStatus;

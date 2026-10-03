import { z } from "zod";
import { ApprovalSchema, ToolNameSchema } from "./tools";

export const TASK_STATUSES = [
  "pending",
  "running",
  "waiting_approval",
  "completed",
  "failed",
  "cancelled",
] as const;
export const TaskStatusSchema = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const DEVICE_KINDS = ["desktop", "mobile"] as const;
export const DeviceKindSchema = z.enum(DEVICE_KINDS);
export type DeviceKind = z.infer<typeof DeviceKindSchema>;

export const DeviceSchema = z.object({
  id: z.string().uuid(),
  kind: DeviceKindSchema,
  name: z.string(),
  platform: z.string(),
  osVersion: z.string().nullable(),
  agentVersion: z.string().nullable(),
  status: z.enum(["online", "offline"]),
  lastSeenAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Device = z.infer<typeof DeviceSchema>;

export const WorkspaceSchema = z.object({
  id: z.string().uuid(),
  deviceId: z.string().uuid(),
  label: z.string(),
  path: z.string(),
  enabled: z.boolean(),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

export const ArtifactSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  name: z.string(),
  path: z.string(),
  mime: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  uploaded: z.boolean(),
  createdAt: z.string(),
});
export type Artifact = z.infer<typeof ArtifactSchema>;

export const TaskEventSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  seq: z.number().int(),
  type: z.string(),
  payload: z.unknown(),
  createdAt: z.string(),
});
export type TaskEvent = z.infer<typeof TaskEventSchema>;

export const TaskSchema = z.object({
  id: z.string().uuid(),
  deviceId: z.string().uuid(),
  prompt: z.string(),
  providerId: z.string().uuid().nullable(),
  model: z.string().nullable(),
  status: TaskStatusSchema,
  progress: z.number().int().min(0).max(100),
  stepLabel: z.string().nullable(),
  output: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  artifacts: z.array(ArtifactSchema),
});
export type Task = z.infer<typeof TaskSchema>;

export const CreateTaskSchema = z.object({
  prompt: z.string().min(1).max(8_000),
  deviceId: z.string().uuid(),
  providerId: z.string().uuid().optional(),
  model: z.string().max(120).optional(),
});
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

export const EnvelopeSchema = z.object({
  v: z.literal(1),
  id: z.string(),
  type: z.string(),
  ts: z.string(),
  payload: z.unknown(),
});
export type Envelope = z.infer<typeof EnvelopeSchema>;

export const WS_MESSAGE_TYPES = [
  "device.hello",
  "device.heartbeat",
  "device.status",
  "task.created",
  "task.dispatch",
  "task.status",
  "task.delta",
  "task.tool_call",
  "task.artifact",
  "task.done",
  "approval.request",
  "approval.resolved",
  "task.cancel",
] as const;
export type WsMessageType = (typeof WS_MESSAGE_TYPES)[number];

export const TaskStatusEventSchema = z.object({
  taskId: z.string().uuid(),
  status: TaskStatusSchema,
  progress: z.number().int().min(0).max(100),
  stepLabel: z.string().nullable(),
});
export type TaskStatusEvent = z.infer<typeof TaskStatusEventSchema>;

export const TaskToolCallEventSchema = z.object({
  taskId: z.string().uuid(),
  callId: z.string(),
  tool: ToolNameSchema,
  arguments: z.record(z.string(), z.unknown()),
  status: z.enum(["pending", "running", "ok", "denied", "error"]),
  summary: z.string().nullable(),
});
export type TaskToolCallEvent = z.infer<typeof TaskToolCallEventSchema>;

export const ApprovalRequestEventSchema = z.object({
  approval: ApprovalSchema,
});
export type ApprovalRequestEvent = z.infer<typeof ApprovalRequestEventSchema>;

export const ApprovalDecisionSchema = z.object({
  approvalId: z.string().uuid(),
  decision: z.enum(["approved", "denied"]),
  /** "Permitir sempre": grava regra de auto-approve para tool+glob */
  always: z.boolean().default(false),
});
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;
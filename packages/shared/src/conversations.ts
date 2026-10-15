import { z } from "zod";

export const ConversationSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  providerId: z.string().uuid(),
  model: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Conversation = z.infer<typeof ConversationSchema>;

export const ChatMessageSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  parts: z.array(z.discriminatedUnion("type", [
    z.object({ type: z.literal("text"), text: z.string() }),
    z.object({ type: z.literal("image"), attachmentId: z.string().uuid(), mimeType: z.string(), name: z.string() }),
    z.object({ type: z.literal("audio"), attachmentId: z.string().uuid(), mimeType: z.string(), name: z.string() }),
  ])).default([]),
  createdAt: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const AttachmentMimeTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "audio/mp3",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/webm",
  "audio/m4a",
  "audio/aac",
]);
export type AttachmentMimeType = z.infer<typeof AttachmentMimeTypeSchema>;

export const ChatAttachmentSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  mimeType: z.string(),
  byteSize: z.number().int().nonnegative(),
  originalName: z.string(),
  status: z.enum(["uploading", "processing", "ready", "failed", "expired"]),
  createdAt: z.string(),
});
export type ChatAttachment = z.infer<typeof ChatAttachmentSchema>;

export const UploadAttachmentSchema = z.object({
  mimeType: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(255),
  data: z.string().min(1).max(10_000_000),
});

export const MessagePartSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("image"), attachmentId: z.string().uuid() }),
  z.object({ type: z.literal("audio"), attachmentId: z.string().uuid() }),
]);

export const TransformationTargetSchema = z.enum([
  "summary", "study_guide", "email", "checklist", "flashcards",
]);
export type TransformationTarget = z.infer<typeof TransformationTargetSchema>;
export const TransformationTargetLabels: Record<TransformationTarget, string> = {
  summary: "Resumo",
  study_guide: "Guia de estudo",
  email: "E-mail",
  checklist: "Checklist",
  flashcards: "Flashcards",
};
export const TransformationSchema = z.object({
  target: TransformationTargetSchema,
  source: z.string().trim().min(1).max(100_000),
  instructions: z.string().trim().max(2_000).optional(),
});

export const CreateConversationSchema = z.object({
  providerId: z.string().uuid().optional(),
  model: z.string().max(120).optional(),
});

export const SendMessageSchema = z.object({
  content: z.string().trim().min(1).max(20_000),
  images: z.array(z.object({ mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]), data: z.string().max(4_000_000) })).max(4).optional(),
  audios: z.array(z.object({ mimeType: z.string(), data: z.string().max(10_000_000) })).max(2).optional(),
  parts: z.array(MessagePartSchema).max(4).optional(),
  transformation: TransformationSchema.optional(),
  useMemory: z.boolean().optional(),
  webSearch: z.boolean().optional(),
  projectId: z.string().uuid().optional(),
});

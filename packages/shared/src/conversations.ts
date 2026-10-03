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
  createdAt: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const CreateConversationSchema = z.object({
  providerId: z.string().uuid().optional(),
  model: z.string().max(120).optional(),
});

export const SendMessageSchema = z.object({
  content: z.string().trim().min(1).max(20_000),
  images: z.array(z.object({ mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]), data: z.string().max(4_000_000) })).max(4).optional(),
});

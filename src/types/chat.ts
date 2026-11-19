import type { ModelId } from '../lib/models';

export interface ChatAttachmentMeta {
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export interface PendingAttachment extends ChatAttachmentMeta {
  dataBase64?: string;
  textContent?: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  modelId: ModelId;
  tokens: number;
  latencyMs: number;
  attachmentName?: string;
  attachmentType?: string;
  sources?: GroundingSource[];
  respondedBy?: string;
  createdAtMs: number;
  isStreaming?: boolean;
  isError?: boolean;
}

export interface ChatSession {
  id: string;
  userId: string;
  title: string;
  modelId: ModelId;
  messageCount: number;
  totalTokens: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface UserProfile {
  uid: string;
  displayName: string;
}

export interface UnlimitedGrant {
  id: string;
  email: string;
  grantedBy: string;
  note?: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export type AuthGateReason = 'general' | 'upload' | 'history';

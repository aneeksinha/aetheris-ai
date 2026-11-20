import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  db,
  handleFirestoreError,
  isFirestoreOfflineError,
  OperationType,
} from '../lib/firebase';
import type { UsageRecord } from '../lib/analytics';
import { emailToGrantId, normalizeEmail, type ModelId } from '../lib/models';
import { sanitizeAuthorName, validateReviewInput } from '../lib/reviewsValidation';
import type { ChatMessage, ChatSession, ReviewItem, UnlimitedGrant } from '../types/chat';

export function makeSafeId(prefix: string): string {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/[^a-zA-Z0-9_-]/g, '')
      : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${uuid}`.slice(0, 120);
}

function timestampToMs(val: unknown): number {
  if (!val) return Date.now();
  if (typeof val === 'object' && val !== null && 'toMillis' in val) {
    return (val as { toMillis: () => number }).toMillis();
  }
  return Date.now();
}

export function subscribeUserChats(
  userId: string,
  onUpdate: (chats: ChatSession[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  const path = 'chats';
  const q = query(
    collection(db, path),
    where('userId', '==', userId),
    orderBy('updatedAt', 'desc'),
    limit(50),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: ChatSession[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          userId: String(data.userId || userId),
          title: String(data.title || 'Untitled conversation'),
          modelId: (data.modelId as ModelId) || 'flash-lite',
          messageCount: Number(data.messageCount || 0),
          totalTokens: Number(data.totalTokens || 0),
          createdAtMs: timestampToMs(data.createdAt),
          updatedAtMs: timestampToMs(data.updatedAt),
        };
      });
      onUpdate(items);
    },
    (error) => {
      if (isFirestoreOfflineError(error)) {
        onError(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    },
  );
}

export function subscribeUserUsageLogs(
  userId: string,
  onUpdate: (logs: UsageRecord[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  const path = 'usageLogs';
  const q = query(
    collection(db, path),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(200),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: UsageRecord[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          modelId: String(data.modelId || 'flash-lite'),
          modelLabel: String(data.modelLabel || 'Flash Lite 3.1'),
          promptTokens: Number(data.promptTokens || 0),
          completionTokens: Number(data.completionTokens || 0),
          totalTokens: Number(data.totalTokens || 0),
          latencyMs: Number(data.latencyMs || 0),
          hasAttachment: Boolean(data.hasAttachment),
          status: data.status === 'error' ? 'error' : 'completed',
          createdAtMs: timestampToMs(data.createdAt),
        };
      });
      onUpdate(items);
    },
    (error) => {
      if (isFirestoreOfflineError(error)) {
        onError(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    },
  );
}

export async function loadChatMessages(
  chatId: string,
  userId: string,
): Promise<ChatMessage[]> {
  const path = `chats/${chatId}/messages`;
  try {
    const q = query(
      collection(db, 'chats', chatId, 'messages'),
      where('userId', '==', userId),
      orderBy('createdAt', 'asc'),
      limit(200),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        role: data.role === 'assistant' ? 'assistant' : 'user',
        content: String(data.content || ''),
        modelId: (data.modelId as ModelId) || 'flash-lite',
        tokens: Number(data.tokens || 0),
        latencyMs: Number(data.latencyMs || 0),
        attachmentName: data.attachmentName ? String(data.attachmentName) : undefined,
        attachmentType: data.attachmentType ? String(data.attachmentType) : undefined,
        createdAtMs: timestampToMs(data.createdAt),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function createChatSession(params: {
  chatId: string;
  userId: string;
  title: string;
  modelId: ModelId;
}): Promise<void> {
  const path = `chats/${params.chatId}`;
  const cleanTitle = (params.title.trim() || 'New conversation').slice(0, 160);
  try {
    await setDoc(doc(db, 'chats', params.chatId), {
      userId: params.userId,
      title: cleanTitle,
      modelId: params.modelId.slice(0, 64),
      messageCount: 0,
      totalTokens: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function appendChatMessage(params: {
  chatId: string;
  messageId: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  modelId: ModelId;
  tokens: number;
  latencyMs: number;
  attachmentName?: string;
  attachmentType?: string;
}): Promise<void> {
  const path = `chats/${params.chatId}/messages/${params.messageId}`;
  const safeContent = (params.content || ' ').slice(0, 50000);
  const payload: Record<string, unknown> = {
    chatId: params.chatId,
    userId: params.userId,
    role: params.role,
    content: safeContent,
    modelId: params.modelId.slice(0, 64),
    tokens: Math.max(0, Math.min(1_000_000, Math.round(params.tokens))),
    latencyMs: Math.max(0, Math.min(300_000, Math.round(params.latencyMs))),
    createdAt: serverTimestamp(),
  };

  if (params.attachmentName) {
    payload.attachmentName = params.attachmentName.slice(0, 180);
  }
  if (params.attachmentType) {
    payload.attachmentType = params.attachmentType.slice(0, 80);
  }

  try {
    await setDoc(doc(db, 'chats', params.chatId, 'messages', params.messageId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateChatSummary(params: {
  chatId: string;
  title?: string;
  modelId: ModelId;
  messageCount: number;
  totalTokens: number;
}): Promise<void> {
  const path = `chats/${params.chatId}`;
  const updateData: Record<string, unknown> = {
    modelId: params.modelId.slice(0, 64),
    messageCount: Math.max(0, Math.min(5000, Math.round(params.messageCount))),
    totalTokens: Math.max(0, Math.min(50_000_000, Math.round(params.totalTokens))),
    updatedAt: serverTimestamp(),
  };
  if (params.title) {
    updateData.title = params.title.trim().slice(0, 160) || 'New conversation';
  }
  try {
    await updateDoc(doc(db, 'chats', params.chatId), updateData);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteChatSession(chatId: string, userId: string): Promise<void> {
  const path = `chats/${chatId}`;
  try {
    const msgsQuery = query(
      collection(db, 'chats', chatId, 'messages'),
      where('userId', '==', userId),
    );
    const msgSnap = await getDocs(msgsQuery);
    await Promise.all(msgSnap.docs.map((m) => deleteDoc(m.ref)));
    await deleteDoc(doc(db, 'chats', chatId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function recordUsageLog(params: {
  userId: string;
  modelId: ModelId;
  modelLabel: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  hasAttachment: boolean;
  status: 'completed' | 'error';
}): Promise<void> {
  const logId = makeSafeId('log');
  const path = `usageLogs/${logId}`;
  try {
    await setDoc(doc(db, 'usageLogs', logId), {
      userId: params.userId,
      modelId: params.modelId.slice(0, 64),
      modelLabel: params.modelLabel.slice(0, 80),
      promptTokens: Math.max(0, Math.min(1_000_000, Math.round(params.promptTokens))),
      completionTokens: Math.max(0, Math.min(1_000_000, Math.round(params.completionTokens))),
      totalTokens: Math.max(0, Math.min(2_000_000, Math.round(params.totalTokens))),
      latencyMs: Math.max(0, Math.min(300_000, Math.round(params.latencyMs))),
      hasAttachment: Boolean(params.hasAttachment),
      status: params.status,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeUnlimitedGrants(
  onUpdate: (grants: UnlimitedGrant[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  const path = 'unlimitedGrants';
  const q = query(
    collection(db, path),
    orderBy('updatedAt', 'desc'),
    limit(200),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: UnlimitedGrant[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          email: String(data.email || ''),
          grantedBy: String(data.grantedBy || ''),
          note: data.note ? String(data.note) : undefined,
          createdAtMs: timestampToMs(data.createdAt),
          updatedAtMs: timestampToMs(data.updatedAt),
        };
      });
      onUpdate(items);
    },
    (error) => {
      if (isFirestoreOfflineError(error)) {
        onError(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    },
  );
}

export function subscribeOwnUnlimitedGrant(
  email: string,
  onResult: (granted: boolean) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    onResult(false);
    return () => {};
  }
  const path = 'unlimitedGrants';
  const q = query(
    collection(db, path),
    where('email', '==', normalized),
    limit(1),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      onResult(!snapshot.empty);
    },
    (error) => {
      onResult(false);
      if (onError) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    },
  );
}

export async function grantUnlimitedEmail(params: {
  email: string;
  grantedByUid: string;
  note?: string;
}): Promise<void> {
  const normalized = normalizeEmail(params.email).slice(0, 160);
  const grantId = emailToGrantId(normalized);
  const path = `unlimitedGrants/${grantId}`;
  const ref = doc(db, 'unlimitedGrants', grantId);
  const cleanNote = params.note?.trim().slice(0, 120);

  try {
    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      const updatePayload: Record<string, unknown> = {
        updatedAt: serverTimestamp(),
      };
      if (cleanNote) {
        updatePayload.note = cleanNote;
      }
      await updateDoc(ref, updatePayload);
      return;
    }

    const createPayload: Record<string, unknown> = {
      email: normalized,
      grantedBy: params.grantedByUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (cleanNote) {
      createPayload.note = cleanNote;
    }
    await setDoc(ref, createPayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function revokeUnlimitedEmail(grantId: string): Promise<void> {
  const path = `unlimitedGrants/${grantId}`;
  try {
    await deleteDoc(doc(db, 'unlimitedGrants', grantId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribePublicReviews(
  onUpdate: (reviews: ReviewItem[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  const path = 'reviews';
  const q = query(
    collection(db, path),
    where('visibility', '==', 'public'),
    limit(100),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: ReviewItem[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          authorId: String(data.authorId || ''),
          authorName: sanitizeAuthorName(
            typeof data.authorName === 'string' ? data.authorName : undefined,
          ),
          rating: Math.min(5, Math.max(1, Math.round(Number(data.rating || 5)))),
          comment: String(data.comment || ''),
          createdAtMs: timestampToMs(data.createdAt),
          updatedAtMs: timestampToMs(data.updatedAt),
        };
      });
      items.sort((a, b) => b.createdAtMs - a.createdAtMs);
      onUpdate(items);
    },
    (error) => {
      if (isFirestoreOfflineError(error)) {
        onError(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    },
  );
}

export async function submitReview(params: {
  authorId: string;
  authorName: string;
  rating: number;
  comment: string;
}): Promise<void> {
  const checked = validateReviewInput(params.rating, params.comment);
  if (!checked.valid) {
    throw new Error(checked.error || 'Invalid review input.');
  }

  const reviewId = makeSafeId('rev');
  const path = `reviews/${reviewId}`;
  try {
    await setDoc(doc(db, 'reviews', reviewId), {
      authorId: params.authorId,
      authorName: sanitizeAuthorName(params.authorName),
      rating: checked.rating,
      comment: checked.comment,
      visibility: 'public',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteReview(reviewId: string): Promise<void> {
  const path = `reviews/${reviewId}`;
  try {
    await deleteDoc(doc(db, 'reviews', reviewId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

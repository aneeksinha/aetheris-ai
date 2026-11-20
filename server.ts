import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, type Content, type Part } from '@google/genai';
import { getModelSpec, isOwnerEmail } from './src/lib/models.ts';
import { shouldEnableLiveSearch } from './src/lib/searchIntent.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

let cachedAi: GoogleGenAI | null = null;
let searchQuotaCooldownUntil = 0;
function getAiClient(): GoogleGenAI {
  if (!cachedAi) {
    cachedAi = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedAi;
}

interface FirebaseAppletConfig {
  apiKey?: string;
  projectId?: string;
  firestoreDatabaseId?: string;
}

let cachedFirebaseConfig: FirebaseAppletConfig | null = null;
function getFirebaseConfig(): FirebaseAppletConfig {
  if (cachedFirebaseConfig) return cachedFirebaseConfig;
  try {
    const cfgPath = path.resolve(__dirname, 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      cachedFirebaseConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) as FirebaseAppletConfig;
      return cachedFirebaseConfig;
    }
  } catch {
    // Ignore parse error
  }
  cachedFirebaseConfig = {};
  return cachedFirebaseConfig;
}

interface VerifiedFirebaseUser {
  uid: string;
  email?: string;
  emailVerified: boolean;
  isOwner: boolean;
}

async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseUser | null> {
  const { apiKey } = getFirebaseConfig();
  if (!apiKey || !idToken) return null;
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      users?: Array<{ localId?: string; email?: string; emailVerified?: boolean }>;
    };
    const user = Array.isArray(data.users) ? data.users[0] : undefined;
    if (!user?.localId) return null;
    const emailVerified = Boolean(user.emailVerified);
    return {
      uid: user.localId,
      email: user.email,
      emailVerified,
      isOwner: isOwnerEmail(user.email, emailVerified),
    };
  } catch {
    return null;
  }
}

interface IncomingMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface IncomingAttachment {
  name: string;
  mimeType: string;
  dataBase64?: string;
  textContent?: string;
}

interface IncomingClientContext {
  isoNow?: string;
  timeZone?: string;
  localDateTime?: string;
}

interface GroundingSource {
  title: string;
  uri: string;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '30mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', model: 'gemini-3.1-flash-lite', timestamp: new Date().toISOString() });
  });

  app.post('/api/chat', async (req, res) => {
    const startedAt = Date.now();

    if (!process.env.GEMINI_API_KEY) {
      res.status(500).json({ error: 'Server Gemini API key is not configured.' });
      return;
    }

    const { modelId, messages, attachment, clientContext } = req.body as {
      modelId?: string;
      messages?: IncomingMessage[];
      attachment?: IncomingAttachment;
      clientContext?: IncomingClientContext;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'At least one message is required.' });
      return;
    }

    const spec = getModelSpec(modelId || 'flash-lite');
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const verifiedUser = token ? await verifyFirebaseIdToken(token) : null;

    // Sign-in is required when uploading files/attachments
    if (attachment && !verifiedUser) {
      res.status(401).json({
        error: 'Sign in with Google or email & password is required to analyze uploaded files.',
      });
      return;
    }

    // Keep recent conversation context crisp & complete (up to last 10 turns)
    const recentMessages = messages.slice(-10);
    const lastUserMessageText =
      [...recentMessages].reverse().find((m) => m.role === 'user')?.content || '';
    const useLiveSearch =
      spec.liveSearchEnabled &&
      shouldEnableLiveSearch(lastUserMessageText, Boolean(attachment));

    const contents: Content[] = recentMessages.map((msg, idx) => {
      const parts: Part[] = [];
      const isLastUserMessage = idx === recentMessages.length - 1 && msg.role === 'user';

      if (isLastUserMessage && attachment) {
        if (
          attachment.dataBase64 &&
          (attachment.mimeType.startsWith('image/') || attachment.mimeType === 'application/pdf')
        ) {
          parts.push({
            inlineData: {
              mimeType: attachment.mimeType,
              data: attachment.dataBase64,
            },
          });
        } else if (attachment.textContent) {
          parts.push({
            text: `[Attached file: ${attachment.name} (${attachment.mimeType})]\n\`\`\`\n${attachment.textContent.slice(0, 60000)}\n\`\`\``,
          });
        }
      }

      parts.push({ text: msg.content });

      return {
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts,
      };
    });

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.socket?.setNoDelay?.(true);
    res.flushHeaders?.();
    res.write(': ok\n\n');

    let clientDisconnected = false;
    let activeController: AbortController | null = null;
    res.on('close', () => {
      if (!res.writableEnded) {
        clientDisconnected = true;
        activeController?.abort();
      }
    });

    const writeEvent = (payload: Record<string, unknown>) => {
      if (!clientDisconnected && !res.writableEnded) {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    };

    const formatUpstreamError = (err: unknown): string => {
      let raw = err instanceof Error ? err.message : String(err);
      for (let i = 0; i < 3; i++) {
        try {
          const parsed = JSON.parse(raw) as { error?: { message?: string } | string; message?: string };
          if (typeof parsed?.error === 'object' && parsed.error?.message) {
            raw = parsed.error.message;
          } else if (typeof parsed?.error === 'string') {
            raw = parsed.error;
          } else if (typeof parsed?.message === 'string') {
            raw = parsed.message;
          } else {
            break;
          }
        } catch {
          break;
        }
      }
      return raw.trim() || 'Unable to reach Gemini Flash Lite right now. Please try again.';
    };

    // Inject authoritative real-time local date/time/timezone into every turn
    const serverNow = new Date();
    const safeTz = (clientContext?.timeZone || 'UTC').slice(0, 80);
    const safeLocalTime = (
      clientContext?.localDateTime ||
      serverNow.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'UTC',
        timeZoneName: 'short',
      })
    ).slice(0, 140);

    // Highly-tuned system instruction built per attempt so fallback (search=false) stays consistent
    const buildSystemInstruction = (enableSearch: boolean) =>
      [
        'You are Aetheris powered by Gemini 3.1 Flash Lite—an exceptionally sharp, reliable, fast AI assistant.',
        `Authoritative current local date & time: ${safeLocalTime} (${safeTz}; UTC: ${serverNow.toISOString()}). Use this directly for any "today", date, day-of-week, or current-time question.`,
        'Accuracy rules: Think through edge cases, math, logic, and code correctness carefully before answering; never invent APIs, citations, or URLs; if something cannot be verified, state clearly what is unknown.',
        'Formatting rules: Write in a natural, conversational, clean editorial format—clear paragraphs, concise headings, or simple bullet lists where helpful. Avoid wrapping answers in decorative ASCII boxes, bordered cards, or heavy markdown tables unless explicitly requested; use language-tagged fenced code blocks only for actual code.',
        verifiedUser?.isOwner
          ? 'Session context: Authenticated workspace owner.'
          : '',
        enableSearch
          ? 'Live Web Grounding: Google Search is available. Use Google Search results for current facts, sports outcomes, news, weather, prices, or recent events, and summarize concisely without fabrication.'
          : '',
      ]
        .filter(Boolean)
        .join(' ');

    const buildRequestConfig = (enableSearch: boolean, abortSignal: AbortSignal) => {
      const cfg: {
        systemInstruction: string;
        abortSignal: AbortSignal;
        thinkingConfig: { thinkingLevel: ThinkingLevel };
        tools?: Array<{ googleSearch: Record<string, never> }>;
      } = {
        systemInstruction: buildSystemInstruction(enableSearch),
        abortSignal,
        thinkingConfig: {
          thinkingLevel: enableSearch ? ThinkingLevel.LOW : ThinkingLevel.MINIMAL,
        },
      };
      if (enableSearch) {
        cfg.tools = [{ googleSearch: {} }];
      }
      return cfg;
    };

    const extractSources = (
      chunks: Array<{ web?: { uri?: string; title?: string } }> | undefined,
      sourceMap: Map<string, GroundingSource>,
    ) => {
      if (!Array.isArray(chunks)) return;
      for (const g of chunks) {
        const uri = g?.web?.uri;
        if (uri && !sourceMap.has(uri)) {
          sourceMap.set(uri, {
            uri,
            title: (g.web?.title || uri).slice(0, 120),
          });
        }
      }
    };

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const isNonRetryableError = (err: unknown): boolean => {
      const msg = err instanceof Error ? err.message : String(err);
      return /\b(400|401|403|404)\b|invalid_argument|api key|permission_denied/i.test(msg);
    };

    const runFlashLiteAttempt = async (
      modelName: string,
      enableSearch: boolean,
      timeoutMs: number,
      streaming: boolean,
    ) => {
      const controller = new AbortController();
      activeController = controller;
      let emittedChars = 0;
      let didTimeout = false;
      const timer = setTimeout(() => {
        if (emittedChars === 0) {
          didTimeout = true;
          controller.abort();
        }
      }, timeoutMs);

      const heartbeat = setInterval(() => {
        if (!clientDisconnected && !res.writableEnded) {
          res.write(': ping\n\n');
        }
      }, 4000);

      const sourceMap = new Map<string, GroundingSource>();
      let promptTokens = 0;
      let completionTokens = 0;
      let totalTokens = 0;

      try {
        if (streaming) {
          const stream = await getAiClient().models.generateContentStream({
            model: modelName,
            contents,
            config: buildRequestConfig(enableSearch, controller.signal),
          });

          for await (const chunk of stream) {
            if (clientDisconnected) break;
            if (chunk.text) {
              if (emittedChars === 0) {
                clearTimeout(timer);
                clearInterval(heartbeat);
              }
              emittedChars += chunk.text.length;
              writeEvent({ type: 'chunk', text: chunk.text });
            }
            extractSources(
              chunk.candidates?.[0]?.groundingMetadata?.groundingChunks as
                | Array<{ web?: { uri?: string; title?: string } }>
                | undefined,
              sourceMap,
            );
            if (chunk.usageMetadata) {
              promptTokens = chunk.usageMetadata.promptTokenCount ?? promptTokens;
              completionTokens = chunk.usageMetadata.candidatesTokenCount ?? completionTokens;
              totalTokens =
                chunk.usageMetadata.totalTokenCount ?? promptTokens + completionTokens;
            }
          }
        } else {
          const response = await getAiClient().models.generateContent({
            model: modelName,
            contents,
            config: buildRequestConfig(enableSearch, controller.signal),
          });
          clearTimeout(timer);
          clearInterval(heartbeat);
          if (response.text && !clientDisconnected) {
            emittedChars = response.text.length;
            writeEvent({ type: 'chunk', text: response.text });
          }
          extractSources(
            response.candidates?.[0]?.groundingMetadata?.groundingChunks as
              | Array<{ web?: { uri?: string; title?: string } }>
              | undefined,
            sourceMap,
          );
          if (response.usageMetadata) {
            promptTokens = response.usageMetadata.promptTokenCount ?? 0;
            completionTokens = response.usageMetadata.candidatesTokenCount ?? 0;
            totalTokens =
              response.usageMetadata.totalTokenCount ?? promptTokens + completionTokens;
          }
        }
      } catch (err) {
        if (didTimeout) {
          throw new Error(
            `${modelName} took longer than ${Math.round(timeoutMs / 1000)}s to start responding.`,
          );
        }
        throw err;
      } finally {
        clearTimeout(timer);
        clearInterval(heartbeat);
        if (activeController === controller) {
          activeController = null;
        }
      }

      if (emittedChars === 0 && !clientDisconnected) {
        console.warn(`[chat] Empty response (model=${modelName}, search=${enableSearch}, stream=${streaming})`);
        throw new Error(`${modelName} returned an empty response.`);
      }

      console.log(
        `[chat] Completed (model=${modelName}, search=${enableSearch}, stream=${streaming}, chars=${emittedChars}, sources=${sourceMap.size})`,
      );

      return {
        emittedChars,
        promptTokens,
        completionTokens,
        totalTokens,
        sources: Array.from(sourceMap.values()).slice(0, 5),
      };
    };

    try {
      const searchAllowedNow = useLiveSearch && Date.now() >= searchQuotaCooldownUntil;
      const primaryTimeoutMs = attachment ? 30000 : searchAllowedNow ? 10000 : 18000;
      const attempts: Array<{
        model: string;
        search: boolean;
        timeoutMs: number;
        streaming: boolean;
        delayBeforeMs: number;
      }> = [
        {
          model: 'gemini-3.1-flash-lite',
          search: searchAllowedNow,
          timeoutMs: primaryTimeoutMs,
          streaming: true,
          delayBeforeMs: 0,
        },
        {
          model: 'gemini-3.1-flash-lite',
          search: false,
          timeoutMs: 18000,
          streaming: searchAllowedNow,
          delayBeforeMs: 150,
        },
      ];

      let result: Awaited<ReturnType<typeof runFlashLiteAttempt>> | null = null;
      let lastError: unknown = null;
      let searchActive = false;

      for (const attempt of attempts) {
        if (clientDisconnected) break;
        if (attempt.delayBeforeMs > 0) {
          await sleep(attempt.delayBeforeMs);
          if (clientDisconnected) break;
        }
        try {
          result = await runFlashLiteAttempt(
            attempt.model,
            attempt.search,
            attempt.timeoutMs,
            attempt.streaming,
          );
          searchActive = attempt.search;
          break;
        } catch (err) {
          lastError = err;
          const errMsg = formatUpstreamError(err);
          if (attempt.search && /quota|resource_exhausted|429/i.test(errMsg)) {
            searchQuotaCooldownUntil = Date.now() + 5 * 60 * 1000;
          }
          console.warn(
            `[chat] Attempt failed (model=${attempt.model}, search=${attempt.search}, stream=${attempt.streaming}):`,
            errMsg,
          );
          if (clientDisconnected || isNonRetryableError(err)) break;
        }
      }

      if (!result) {
        throw lastError || new Error('Unable to reach Gemini 3.1 Flash Lite.');
      }

      if (!clientDisconnected) {
        const latencyMs = Math.max(1, Date.now() - startedAt);
        writeEvent({
          type: 'done',
          modelId: spec.id,
          respondedBy: spec.name,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          totalTokens:
            result.totalTokens || result.promptTokens + result.completionTokens,
          latencyMs,
          sources: result.sources,
          searchFallback: useLiveSearch && !searchActive,
        });
        res.end();
      }
    } catch (error) {
      if (!clientDisconnected) {
        writeEvent({ type: 'error', message: formatUpstreamError(error) });
        res.end();
      }
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'API endpoint not found.' });
        return;
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (process.env.GEMINI_API_KEY) {
    getAiClient();
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Aetheris server listening on http://localhost:${PORT}`);
  });
}

startServer();

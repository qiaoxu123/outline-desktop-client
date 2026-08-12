import { ipcMain, net } from "electron";
import { z } from "zod";
import { readAiConfig, writeAiConfig, type AiConfig } from "../../services/storage/ai-config";

function ok<T>(data: T) {
  return { ok: true as const, data };
}

function fail(code: string, message: string, retryable = false) {
  return { ok: false as const, error: { code, message, retryable } };
}

const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

const GetConfigSchema = z.object({}).optional();

const SetConfigSchema = z.object({
  apiKey: z.string().optional(),
  model: z.string().optional(),
  baseUrl: z.string().optional(),
});

const ChatSchema = z.object({
  question: z.string().min(1),
  context: z.string(),
  history: z.array(ChatMessageSchema),
});

export function registerAiHandlers(): void {
  // Return config WITHOUT apiKey (security: never expose the key to renderer)
  ipcMain.handle("ai:getConfig", async () => {
    const config = readAiConfig();
    return ok({ model: config.model, baseUrl: config.baseUrl });
  });

  // Save config (apiKey is optional — omit to keep existing key)
  ipcMain.handle("ai:setConfig", async (_event, payload: unknown) => {
    const parsed = SetConfigSchema.safeParse(payload);
    if (!parsed.success) {
      return fail("VALIDATION", "Invalid AI config");
    }
    const update: Partial<AiConfig> = {};
    if (parsed.data.apiKey !== undefined) update.apiKey = parsed.data.apiKey;
    if (parsed.data.model !== undefined && parsed.data.model.trim())
      update.model = parsed.data.model.trim();
    if (parsed.data.baseUrl !== undefined && parsed.data.baseUrl.trim())
      update.baseUrl = parsed.data.baseUrl.trim();
    writeAiConfig(update);
    return ok(true);
  });

  // Chat with DeepSeek API
  ipcMain.handle("ai:chat", async (_event, payload: unknown) => {
    const parsed = ChatSchema.safeParse(payload);
    if (!parsed.success) {
      return fail("VALIDATION", "question, context, and history are required");
    }

    const config = readAiConfig();
    if (!config.apiKey) {
      return fail("NO_API_KEY", "请先在设置中配置 DeepSeek API Key");
    }

    const { question, context, history } = parsed.data;

    // Build messages array: system prompt + history + current question
    const messages: { role: string; content: string }[] = [
      {
        role: "system",
        content: `You are a helpful AI assistant for a knowledge base app. Answer the user's question based on the provided context. If the context doesn't contain enough information, say so honestly. Use Chinese to respond if the context is in Chinese.

Context:
${context}`,
      },
      ...history,
      { role: "user", content: question },
    ];

    const url = config.baseUrl.replace(/\/+$/, "") + "/chat/completions";

    try {
      const response = await net.fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature: 0.7,
          max_tokens: 4096,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const msg =
          (body as { error?: { message?: string } })?.error?.message ??
          `DeepSeek API error: ${response.status}`;
        return fail("API_ERROR", msg, response.status >= 500);
      }

      const result = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const answer =
        result.choices?.[0]?.message?.content ?? "(no response from model)";
      return ok({ answer });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error";
      return fail("NETWORK", message, true);
    }
  });
}

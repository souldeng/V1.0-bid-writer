import { LlmError, type LlmProvider, type LlmProviderConfig, type LlmStreamEvent, type LlmStreamRequest } from "@/lib/llm/types";

const DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

function normalizeBaseUrl(value?: string): string {
  return (value || DEFAULT_BASE_URL).replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
}

async function* readDoubaoStream(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<LlmStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") { yield { type: "done" }; return; }
        try {
          const text = JSON.parse(payload).choices?.[0]?.delta?.content;
          if (typeof text === "string" && text) yield { type: "text", text };
        } catch {
          // Ignore one malformed provider event and continue with later events.
        }
      }
    }
    yield { type: "done" };
  } catch (error) {
    if (signal?.aborted || (error as Error).name === "AbortError") throw new LlmError("aborted");
    throw new LlmError("stream");
  } finally {
    reader.releaseLock();
  }
}

export const doubaoProvider: LlmProvider = {
  async stream(request: LlmStreamRequest, config: LlmProviderConfig): Promise<AsyncIterable<LlmStreamEvent>> {
    if (request.signal?.aborted) throw new LlmError("aborted");
    const upstream = await fetch(`${normalizeBaseUrl(config.baseUrl)}/chat/completions`, {
      method: "POST",
      signal: request.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, stream: true, max_tokens: 4096, temperature: request.temperature, messages: request.messages }),
    }).catch((error) => {
      if (request.signal?.aborted || (error as Error).name === "AbortError") throw new LlmError("aborted");
      throw new LlmError("request");
    });
    if (!upstream.ok) {
      console.error("Doubao model request failed", upstream.status);
      throw new LlmError("request");
    }
    if (!upstream.body) throw new LlmError("stream");
    return readDoubaoStream(upstream.body, request.signal);
  },
};

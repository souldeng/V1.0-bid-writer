import { doubaoProvider } from "@/lib/llm/providers/doubao";
import { LlmError, type LlmProvider, type LlmProviderConfig, type LlmStreamEvent, type LlmStreamRequest } from "@/lib/llm/types";

const providers: Record<string, LlmProvider> = { doubao: doubaoProvider };

export function getLlmConfig(env: Record<string, string | undefined> = process.env): LlmProviderConfig {
  const provider = (env.LLM_PROVIDER || "doubao").trim().toLowerCase();
  if (!providers[provider]) throw new LlmError("configuration", `不支持的模型服务：${provider}。请检查 LLM_PROVIDER 配置。`);
  const model = (env.LLM_MODEL || env.DOUBAO_MODEL_ID || "").trim();
  const apiKey = (env.LLM_API_KEY || env.DOUBAO_API_KEY || "").trim();
  if (!model || !apiKey) throw new LlmError("configuration");
  return { provider, model, apiKey, baseUrl: env.LLM_BASE_URL || env.DOUBAO_BASE_URL };
}

/** Business code uses this provider-neutral entry point for all text generation. */
export async function streamLlmText(request: LlmStreamRequest): Promise<AsyncIterable<LlmStreamEvent>> {
  const config = getLlmConfig();
  return providers[config.provider].stream(request, config);
}

export { LlmError, type LlmErrorKind, type LlmStreamEvent, type LlmStreamRequest } from "@/lib/llm/types";

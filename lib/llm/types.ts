export type LlmMessage = { role: "system" | "user"; content: string };

export type LlmStreamRequest = {
  messages: LlmMessage[];
  temperature: number;
  signal?: AbortSignal;
};

export type LlmStreamEvent = { type: "text"; text: string } | { type: "done" };

export type LlmErrorKind = "configuration" | "request" | "aborted" | "stream";

export class LlmError extends Error {
  constructor(public readonly kind: LlmErrorKind, message?: string) {
    super(message || defaultMessage(kind));
    this.name = "LlmError";
  }
}

function defaultMessage(kind: LlmErrorKind): string {
  if (kind === "configuration") return "模型服务尚未配置，请检查 .env.local 后重启服务。";
  if (kind === "aborted") return "已停止生成。";
  if (kind === "stream") return "模型返回内容时发生异常，请重试。";
  return "模型服务暂时无法响应，请稍后重试。";
}

export interface LlmProviderConfig {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
}

export interface LlmProvider {
  stream(request: LlmStreamRequest, config: LlmProviderConfig): Promise<AsyncIterable<LlmStreamEvent>>;
}

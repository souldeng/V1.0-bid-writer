import { NextRequest } from "next/server";
import { buildGenerationContext, GenerationContextError } from "@/lib/generation-context";
import { LlmError, streamLlmText } from "@/lib/llm";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { projectId, chapterId, wordTarget = 1500, extra = "", useRag = true, mode = "draft", sourceContent = "" } = await request.json();
    let context;
    try {
      context = await buildGenerationContext({ projectId, chapterId, wordTarget, extra, useRag, mode, sourceContent });
    } catch (error) {
      if (error instanceof GenerationContextError || (error as { name?: string }).name === "GenerationContextError") return Response.json({ error: (error as GenerationContextError).message }, { status: (error as GenerationContextError).status || 400 });
      throw error;
    }
    let modelStream: AsyncIterable<{ type: "text" | "done"; text?: string }>;
    try {
      modelStream = await streamLlmText({
        messages: [{ role: "system", content: context.systemPrompt }, { role: "user", content: context.prompt }],
        temperature: context.temperature,
        signal: request.signal,
      });
    } catch (error) {
      if (error instanceof LlmError) return Response.json({ error: error.message }, { status: error.kind === "configuration" ? 503 : error.kind === "aborted" ? 499 : 502 });
      return Response.json({ error: "模型服务暂时无法响应，请稍后重试。" }, { status: 502 });
    }
    const encoder = new TextEncoder();
    const sources = Array.from(new Set(context.chunks.map((chunk) => chunk.docName)));
    const stream = new ReadableStream({
      async start(controller) {
        try {
          if (sources.length) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ rag: sources })}\n\n`));
          for await (const event of modelStream) {
            if (event.type === "text" && event.text) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: event.text })}\n\n`));
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          if (error instanceof LlmError && error.kind === "aborted") controller.enqueue(encoder.encode(`data: ${JSON.stringify({ aborted: true })}\n\n`));
          else {
            const message = error instanceof LlmError ? error.message : "模型返回内容时发生异常，请重试。";
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
  } catch (error) {
    if ((error as Error).name === "AbortError") return new Response(null, { status: 499 });
    console.error("Generate failed", error);
    return Response.json({ error: "生成服务发生错误，请重试。" }, { status: 500 });
  }
}

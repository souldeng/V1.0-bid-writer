import { buildPolishPrompt, buildPrompt } from "@/lib/chapters";
import { getProject } from "@/lib/data";
import { buildRagContext, retrieveWithScores, type RetrievedChunk } from "@/lib/rag";
import { getProjectOutline } from "@/lib/outline";
import { buildGenerationSystemPrompt } from "@/lib/writing-strategies";
import { getWritingGuidance, type WritingGuidancePoint } from "@/lib/writing-guidance";
import type { OutlineItem, Project } from "@/lib/types";

export type GenerationMode = "draft" | "polish";
export type GenerationContextInput = { projectId: string; chapterId: string; wordTarget?: number; extra?: string; useRag?: boolean; mode?: GenerationMode; sourceContent?: string; topK?: number };

export class GenerationContextError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); this.name = "GenerationContextError"; }
}

export type GenerationContext = {
  project: Project;
  outlineItem: OutlineItem;
  guidance: WritingGuidancePoint[];
  retrievalQuery: string | null;
  chunks: RetrievedChunk[];
  prompt: string;
  systemPrompt: string;
  temperature: number;
  mode: GenerationMode;
};

/** Shared product context builder used by the route and offline evaluator. No provider details are included. */
export async function buildGenerationContext(input: GenerationContextInput): Promise<GenerationContext> {
  const mode = input.mode ?? "draft";
  // Preserve the route's validation semantics: null is invalid rather than silently becoming the default.
  const target = input.wordTarget === undefined ? 1500 : Number(input.wordTarget);
  const extra = String(input.extra ?? "");
  const sourceContent = String(input.sourceContent ?? "");
  const project = await getProject(input.projectId);
  if (!project) throw new GenerationContextError("项目不存在。");
  const outline = getProjectOutline(project);
  const outlineItem = outline.find((item) => item.id === input.chapterId);
  if (!outlineItem) throw new GenerationContextError("目录标题不存在。");
  if (mode !== "draft" && mode !== "polish") throw new GenerationContextError("不支持的生成模式。");
  if (mode === "draft" && (!Number.isInteger(target) || target < 100 || target > 4000)) throw new GenerationContextError("目标字数应为 100—4000 的整数。");
  if (mode === "polish" && !sourceContent.trim()) throw new GenerationContextError("请先生成或保存章节正文，再使用终稿润色。");
  const guidance = getWritingGuidance(outlineItem, outline);
  const useRag = input.useRag !== false;
  const retrievalQuery = useRag ? `${outlineItem.title} ${project.desc} ${extra}` : null;
  const chunks = retrievalQuery ? await retrieveWithScores(project.id, retrievalQuery, input.topK ?? 5) : [];
  const promptKey = outlineItem.promptKey || input.chapterId;
  const prompt = mode === "polish"
    ? buildPolishPrompt(project, promptKey, sourceContent.slice(0, 50000), extra, outlineItem.title, outlineItem.writingType, guidance) + buildRagContext(chunks)
    : buildPrompt(project, promptKey, target, extra, outlineItem.title, outlineItem.writingType, guidance) + buildRagContext(chunks);
  return { project, outlineItem, guidance, retrievalQuery, chunks, prompt, systemPrompt: buildGenerationSystemPrompt(outlineItem), temperature: mode === "polish" ? 0.25 : 0.5, mode };
}

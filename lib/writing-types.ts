import { getChapter } from "@/lib/chapter-definitions";
import type { OutlineItem, WritingType } from "@/lib/types";

// Only labels and compatibility rules belong in the client bundle.
export const WRITING_TYPES = {
  function_description: { label: "功能描述", description: "重点写功能怎么用、系统提供什么支持；围绕已确认的单个功能，材料不足时可少于目标字数。" },
  general: { label: "通用章节", description: "围绕目录标题组织章节内容；原默认章节沿用既有章节要求。" },
} satisfies Record<WritingType, { label: string; description: string }>;

export function isWritingType(value: unknown): value is WritingType {
  return value === "function_description" || value === "general";
}

export function getWritingType(item: Pick<OutlineItem, "id" | "promptKey" | "writingType">): WritingType {
  if (isWritingType(item.writingType)) return item.writingType;
  return getChapter(item.promptKey || item.id) ? "general" : "function_description";
}

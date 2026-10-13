import { CHAPTERS } from "@/lib/chapter-definitions";
import { getWritingType, isWritingType } from "@/lib/writing-types";
import type { OutlineItem, Project } from "@/lib/types";

export const DEFAULT_OUTLINE: OutlineItem[] = CHAPTERS.map((chapter) => ({
  id: chapter.id,
  title: chapter.label,
  level: 1,
  promptKey: chapter.id,
  writingType: "general",
}));

export function getProjectOutline(project: Project): OutlineItem[] {
  const items = Array.isArray(project.outline) && project.outline.length ? project.outline : DEFAULT_OUTLINE;
  return items.map((item) => ({ ...item, writingType: getWritingType(item) }));
}

export function validateOutline(input: unknown): OutlineItem[] {
  if (!Array.isArray(input) || input.length === 0) throw new Error("目录至少需要保留一个标题。");
  if (input.length > 200) throw new Error("目录最多支持 200 个标题。");
  const seen = new Set<string>();
  const items = input.map((value, index) => {
    if (!value || typeof value !== "object") throw new Error("目录标题格式无效。");
    const item = value as Partial<OutlineItem>;
    const id = String(item.id || "").trim();
    const title = String(item.title || "").trim();
    const level = Number(item.level);
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || seen.has(id)) throw new Error("目录标题标识无效或重复。");
    if (!title || title.length > 100) throw new Error("目录标题长度应为 1—100 个字符。");
    if (![1, 2, 3, 4].includes(level)) throw new Error("目录最多支持四级结构。");
    if (item.writingType !== undefined && !isWritingType(item.writingType)) throw new Error("不支持的写作类型，请选择功能描述或通用章节。");
    if (index === 0 && level !== 1) throw new Error("第一个目录标题必须是一级标题。");
    const previousLevel = index ? Number((input[index - 1] as Partial<OutlineItem>).level) : 1;
    if (index && level > previousLevel + 1) throw new Error("目录层级不能跨级。");
    seen.add(id);
    const normalized = { id, title, level: level as 1 | 2 | 3 | 4, ...(item.promptKey ? { promptKey: String(item.promptKey) } : {}) };
    return { ...normalized, writingType: getWritingType({ ...normalized, writingType: item.writingType }) };
  });
  return items;
}

export function outlineNumbers(items: OutlineItem[]): string[] {
  const counters = [0, 0, 0, 0];
  return items.map((item) => {
    counters[item.level - 1] += 1;
    for (let index = item.level; index < counters.length; index += 1) counters[index] = 0;
    return counters.slice(0, item.level).join(".");
  });
}

/** 返回当前标题及其所有子标题组成的连续区块末尾（不含）。 */
export function outlineBlockEnd(items: OutlineItem[], index: number): number {
  let end = index + 1;
  while (end < items.length && items[end].level > items[index].level) end += 1;
  return end;
}

/** 在当前标题的完整子树之后插入一个同级标题。 */
export function insertOutlineSibling(items: OutlineItem[], index: number, item: OutlineItem): OutlineItem[] {
  if (!items[index]) return items;
  const insertionIndex = outlineBlockEnd(items, index);
  return [...items.slice(0, insertionIndex), { ...item, level: items[index].level }, ...items.slice(insertionIndex)];
}

/** 在当前标题下插入一个末位子标题；四级标题不能再新增子级。 */
export function insertOutlineChild(items: OutlineItem[], index: number, item: OutlineItem): OutlineItem[] {
  const parent = items[index];
  if (!parent || parent.level >= 4) return items;
  const insertionIndex = outlineBlockEnd(items, index);
  return [...items.slice(0, insertionIndex), { ...item, level: (parent.level + 1) as 1 | 2 | 3 | 4 }, ...items.slice(insertionIndex)];
}

/** 上下移动同级标题时，始终携带其完整子树。 */
export function moveOutlineBlock(items: OutlineItem[], index: number, direction: -1 | 1): OutlineItem[] {
  const end = outlineBlockEnd(items, index);
  if (!items[index]) return items;
  if (direction === -1) {
    let previous = index - 1;
    while (previous >= 0 && items[previous].level > items[index].level) previous -= 1;
    if (previous < 0 || items[previous].level !== items[index].level) return items;
    const currentBlock = items.slice(index, end);
    return [...items.slice(0, previous), ...currentBlock, ...items.slice(previous, index), ...items.slice(end)];
  }
  if (end >= items.length || items[end].level !== items[index].level) return items;
  const nextEnd = outlineBlockEnd(items, end);
  return [...items.slice(0, index), ...items.slice(end, nextEnd), ...items.slice(index, end), ...items.slice(nextEnd)];
}

/**
 * 将一个标题及其子树拖放到同级标题之前或之后。
 * 不跨级移动，避免拖拽后出现失去父标题或超过四级的无效结构。
 */
export function moveOutlineBlockTo(items: OutlineItem[], fromIndex: number, targetIndex: number, position: "before" | "after"): OutlineItem[] {
  const source = items[fromIndex];
  const target = items[targetIndex];
  if (!source || !target || source.level !== target.level || fromIndex === targetIndex) return items;
  const sourceEnd = outlineBlockEnd(items, fromIndex);
  if (targetIndex > fromIndex && targetIndex < sourceEnd) return items;
  const block = items.slice(fromIndex, sourceEnd);
  const remaining = [...items.slice(0, fromIndex), ...items.slice(sourceEnd)];
  const adjustedTargetIndex = targetIndex < fromIndex ? targetIndex : targetIndex - block.length;
  const insertionIndex = position === "before" ? adjustedTargetIndex : outlineBlockEnd(remaining, adjustedTargetIndex);
  return [...remaining.slice(0, insertionIndex), ...block, ...remaining.slice(insertionIndex)];
}

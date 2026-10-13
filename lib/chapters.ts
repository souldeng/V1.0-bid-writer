import type { Project, WritingType } from "@/lib/types";
import { formatWritingGuidanceForPrompt, type WritingGuidancePoint } from "@/lib/writing-guidance";
import { getChapter } from "@/lib/chapter-definitions";
import { getWritingType } from "@/lib/writing-types";
import { formatProjectFactsForPrompt } from "@/lib/project-facts";
export { CHAPTERS, getChapter } from "@/lib/chapter-definitions";

const PROMPTS: Record<string, string> = {
  bg: "分析政策形势、领域现状和建设必要性，分层陈述。", goal: "明确总体目标和数据、平台、应用、安全等维度的可衡量分目标。",
  basis: "基于已确认的政策材料说明政策要求、甲方现状问题、项目响应关系和建设必要性，不编造政策信息。", plan: "说明建设原则、分层总体架构和建设路径。",
  content: "按4至6个核心模块说明定位、功能和关联关系。", tech: "阐述技术架构、选型理由、关键问题解决方案与成熟性。",
  innovation: "仅从已确认的流程、治理、技术和应用方案中提炼项目特色，不使用无法证明的领先性表述。", org: "说明领导机制、团队、制度和跨部门协调机制。",
  risk: "覆盖技术、管理、数据安全和进度风险，并给出应对措施。", budget: "仅根据已确认的预算数据整理投资范围、费用构成和安排；数据缺失时提示补充，不推测金额。",
  schedule: "按基础建设、功能完善、推广应用三阶段列出任务、里程碑和验收成果。", effect: "预测经济、社会和数据效益，量化应合理可信。",
};



export function buildPrompt(project: Project, chapterId: string, wordTarget: number, extra = "", customTitle = "", writingType?: WritingType, guidance: WritingGuidancePoint[] = []): string {
  const chapter = getChapter(chapterId);
  const title = customTitle.trim() || chapter?.label;
  if (!title) throw new Error("目录标题不存在。");
  const isFunction = getWritingType({ id: chapterId, writingType }) === "function_description";
  const instruction = isFunction ? "描述当前单个功能的实际运作，遵循系统的功能描述策略。" : chapter ? PROMPTS[chapterId] : `紧扣“${title}”说明其定位、功能和与项目建设内容的关系，不擅自扩大建设范围。`;
  return `${formatProjectFactsForPrompt(project)}\n## 当前任务\n目录标题：${title}\n目标字数：约${wordTarget}字（${isFunction ? "仅作参考，材料不足时允许少于目标" : "允许±15%；材料不足时不强求篇幅"}）\n要求：${instruction}\n${guidance.length ? `\n## 本节应覆盖的写作要点\n${formatWritingGuidanceForPrompt(guidance)}\n` : ""}${extra ? `补充要求：${extra}\n` : ""}\n## 写作规范\n1. ${isFunction ? "使用正式、严谨的申报文风和简短自然段，不强制拆小节。" : "使用正式、严谨的政务申报文风和清晰小标题。"}\n2. 只引用可以确认的真实政策文件，不编造政策编号、数据或案例。\n3. 直接输出章节正文，不要解释写作过程，也不要输出 Markdown 标题符号（如 #、##）或代码块。\n\n请撰写「${title}」：`;
}

export function buildPolishPrompt(project: Project, chapterId: string, sourceContent: string, extra = "", customTitle = "", writingType?: WritingType, guidance: WritingGuidancePoint[] = []): string {
  const chapter = getChapter(chapterId);
  const title = customTitle.trim() || chapter?.label;
  if (!title) throw new Error("目录标题不存在。");
  return `${formatProjectFactsForPrompt(project)}\n## 终稿润色任务\n请对「${title}」的现有正文进行终稿润色。\n1. 保留已知事实与原有核心意思；不得杜撰政策、数据、案例、成果或来源。\n2. ${getWritingType({ id: chapterId, writingType }) === "function_description" ? "按单功能实际运作顺序优化简短自然段，不拆分新子功能，不补充建设意义。" : "优化正式申报文风、段落衔接、标题层级和逻辑完整性。"}\n3. 删除重复、空泛、绝对化表述；对无法确认的表述保持审慎。\n4. 按下列写作要点补足章节结构与表达，但不能添加未经确认的事实。\n${guidance.length ? `\n## 本节写作要点\n${formatWritingGuidanceForPrompt(guidance)}\n` : ""}${extra ? `补充要求：${extra}\n` : ""}\n## 待润色正文\n${sourceContent}`;
}

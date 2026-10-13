export const CHAPTERS = [
  { id: "bg", label: "项目背景", sub: "现状分析·行业趋势" }, { id: "basis", label: "建设必要性与政策依据", sub: "政策响应·建设动因" },
  { id: "goal", label: "建设目标", sub: "总目标·阶段目标" }, { id: "plan", label: "总体方案", sub: "架构设计·建设思路" },
  { id: "content", label: "建设内容", sub: "功能模块·系统" }, { id: "tech", label: "技术路线", sub: "选型论证·实现" },
  { id: "innovation", label: "创新与特色", sub: "机制优化·差异化价值" }, { id: "schedule", label: "实施计划", sub: "阶段划分·里程碑" },
  { id: "org", label: "组织保障", sub: "机构·人员·制度" }, { id: "risk", label: "风险管控", sub: "风险识别·应对" },
  { id: "budget", label: "投资估算 / 预算说明", sub: "投资边界·经费构成" }, { id: "effect", label: "预期效益", sub: "经济·社会·数据" },
] as const;


export function getChapter(chapterId: string) {
  return CHAPTERS.find((chapter) => chapter.id === chapterId);
}

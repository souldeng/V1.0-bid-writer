import type { OutlineItem } from "@/lib/types";

export type WritingGuidancePoint = { title: string; description: string };
type GuidanceKind = "background" | "basis" | "meaning" | "goal" | "content" | "architecture" | "function" | "implementation" | "security" | "risk" | "innovation" | "budget" | "effect" | "general";

/** User-facing guidance derived from existing chapter strategies, never internal prompts or model details. */
const GUIDANCE: Record<GuidanceKind, WritingGuidancePoint[]> = {
  background: [
    { title: "政策背景", description: "结合相关国家或地方政策，说明本项目所处的政策环境及政策要求。" },
    { title: "行业发展现状", description: "说明当前行业数字化、数据资源建设或相关领域的发展趋势。" },
    { title: "甲方现状", description: "基于项目资料描述甲方已有系统、业务基础和当前建设情况。" },
    { title: "现存问题", description: "说明当前业务、系统、数据管理或协同过程中存在的主要痛点。" },
    { title: "建设必要性", description: "解释为什么需要在现有基础上进一步建设本项目，并与后续建设目标衔接。" },
  ],
  basis: [
    { title: "政策来源", description: "优先引用已上传或已确认的政策材料，不编造政策名称、文号和具体要求。" },
    { title: "核心要求", description: "提炼与当前项目直接相关的政策任务、目标和要求。" },
    { title: "现状问题", description: "结合甲方实际说明业务、系统或数据管理中存在的问题。" },
    { title: "项目对应", description: "说明本项目如何响应政策要求，避免简单堆砌政策内容。" },
    { title: "建设必要性", description: "解释当前为什么需要建设该项目，并与后续建设目标形成逻辑衔接。" },
  ],
  meaning: [
    { title: "当前问题", description: "说明本项目要回应的实际痛点或发展约束。" },
    { title: "政策与行业要求", description: "结合可确认的政策导向、行业趋势或规范要求说明建设动因。" },
    { title: "项目价值", description: "说明项目对整体建设、能力完善或服务提升的作用。" },
    { title: "业务价值", description: "说明项目对业务流程、协同效率或服务对象的具体价值。" },
    { title: "长期意义", description: "说明项目可持续运营、持续优化或后续拓展的意义。" },
  ],
  goal: [
    { title: "总体目标", description: "明确本项目总体要达到的建设方向和状态。" },
    { title: "业务目标", description: "说明计划改善的业务流程、服务能力或协同方式。" },
    { title: "技术目标", description: "说明数据、平台、应用或安全方面的建设目标。" },
    { title: "阶段目标", description: "说明可按建设阶段逐步达成的重点目标。" },
    { title: "预期成效", description: "描述可合理预期的成果，并避免编造未确认指标。" },
  ],
  content: [
    { title: "建设对象", description: "明确本节覆盖的业务对象、系统对象或数据对象。" },
    { title: "建设范围", description: "说明本次建设包含什么，以及与相邻内容的边界。" },
    { title: "核心模块", description: "列出需要建设的主要模块或能力，并说明各自定位。" },
    { title: "模块关系", description: "说明模块之间如何衔接、协同或共享数据。" },
    { title: "建设成果", description: "说明建成后形成的能力、系统或可交付成果。" },
  ],
  architecture: [
    { title: "架构目标", description: "说明总体架构需要支撑的业务目标、管理要求以及后续扩展需求。" },
    { title: "架构层次", description: "结合项目实际，按照业务、应用、数据、技术、安全等维度合理划分整体架构层次。" },
    { title: "核心组件", description: "说明各架构层中的关键平台、系统、服务、数据资源或支撑组件，以及各自承担的主要职责。" },
    { title: "组件关系", description: "说明各层及核心组件之间的调用、依赖、协同关系与职责边界。" },
    { title: "数据与现有系统关系", description: "说明主要数据流转路径，以及新建能力与甲方现有系统之间的复用、衔接和新增关系。" },
  ],
  function: [
    { title: "服务对象", description: "说明由谁使用该功能，以及服务哪些业务角色或对象。" },
    { title: "触发条件", description: "说明用户、业务事件或上游环节在何种情况下发起该功能。" },
    { title: "输入信息", description: "说明功能处理所需的已确认资料、数据或业务信息。" },
    { title: "处理流程", description: "按实际顺序描述系统如何受理、处理或反馈，不虚构细节。" },
    { title: "输出与衔接", description: "说明处理结果，以及与上下游环节的交接关系。" },
  ],
  implementation: [
    { title: "实施阶段", description: "说明可划分的建设阶段及各阶段目标。" },
    { title: "主要任务", description: "列出每个阶段需要完成的重点工作。" },
    { title: "时间安排", description: "结合可确认的信息说明里程碑或推进节奏。" },
    { title: "责任分工", description: "说明建设、协同、管理等责任边界，未知处保持概括。" },
    { title: "交付与风险控制", description: "说明阶段交付成果，以及主要风险的控制方式。" },
  ],
  security: [
    { title: "安全目标", description: "说明本节需要保障的数据、系统或业务安全目标。" },
    { title: "身份与权限", description: "说明应遵循的身份识别、授权和访问控制原则。" },
    { title: "数据保护", description: "说明数据采集、传输、存储和使用中的保护要求。" },
    { title: "审计追踪", description: "说明关键操作、处理过程或异常事件的记录要求。" },
    { title: "异常与合规", description: "说明异常处置及需遵循的合规要求，不编造具体规则。" },
  ],
  risk: [
    { title: "风险识别", description: "识别进度、组织、技术、数据、安全或资金等方面的主要风险。" },
    { title: "影响分析", description: "说明各类风险可能对建设进度、质量或运行带来的影响。" },
    { title: "预防措施", description: "说明在计划、组织、技术和数据管理方面可采取的预防措施。" },
    { title: "应对机制", description: "说明风险发生后的处置、协同和调整机制，不虚构具体流程。" },
    { title: "跟踪复盘", description: "说明风险监测、责任落实和持续改进的基本安排。" },
  ],
  innovation: [
    { title: "现状差异", description: "说明当前方式或既有系统存在的不足，以及本项目的改进方向。" },
    { title: "机制创新", description: "提炼流程、治理、协同或运营机制方面已经确认的改进。" },
    { title: "技术特色", description: "仅从已确认的技术方案中总结特点，不自行增加技术能力。" },
    { title: "应用创新", description: "说明业务场景、数据应用或服务模式方面的特色。" },
    { title: "表述边界", description: "避免使用全国首创、国际领先、行业第一等无法证明的表述。" },
  ],
  budget: [
    { title: "预算依据", description: "说明已确认的预算依据、测算口径或相关约束条件。" },
    { title: "投入范围", description: "明确本次投资覆盖的建设范围和费用边界。" },
    { title: "费用构成", description: "对已确认的软件、硬件、集成、数据、服务等费用进行结构整理。" },
    { title: "数据边界", description: "仅使用已确认的预算金额、数量和成本数据，不自行推测具体数值。" },
    { title: "待补充信息", description: "预算数据缺失时明确需要补充的资料，不自动估算项目投资。" },
  ],
  effect: [
    { title: "业务成效", description: "说明项目对业务办理、服务能力或流程协同的改善。" },
    { title: "管理成效", description: "说明项目对管理透明度、规范性或决策支持的作用。" },
    { title: "技术成效", description: "说明项目形成的数据、平台或技术能力。" },
    { title: "社会与经济价值", description: "说明项目可带来的公共服务、社会或经济价值。" },
    { title: "可量化结果", description: "仅列出材料能够支撑或后续可核验的量化结果。" },
  ],
  general: [
    { title: "本节目标", description: "说明这一节要回答什么问题，以及在整体材料中的作用。" },
    { title: "核心对象", description: "明确本节涉及的业务对象、系统对象或责任对象。" },
    { title: "主要内容", description: "围绕标题说明应覆盖的重点内容和边界。" },
    { title: "关键机制", description: "说明需要交代的流程、关系或实现机制。" },
    { title: "上下文关系", description: "说明与前后章节或相关建设内容的衔接。" },
    { title: "预期结果", description: "说明本节完成后应形成的结论、能力或结果。" },
  ],
};

const PROMPT_KEY_KINDS: Record<string, GuidanceKind> = {
  bg: "background", basis: "basis", goal: "goal", plan: "architecture", content: "content", tech: "architecture",
  innovation: "innovation", org: "implementation", risk: "risk", budget: "budget", schedule: "implementation", effect: "effect",
};

function kindFromTitle(title: string): GuidanceKind | undefined {
  const text = title.replace(/\s/g, "");
  if (/背景|现状|需求分析|问题分析/.test(text)) return "background";
  if (/建设意义|项目意义|长期意义|业务价值|项目价值/.test(text)) return "meaning";
  if (/政策依据|建设必要性/.test(text)) return "basis";
  if (/建设目标|总体目标|阶段目标|发展目标|目标/.test(text)) return "goal";
  if (/风险|应急|处置/.test(text)) return "risk";
  if (/安全|权限|合规|审计|保密|数据保护/.test(text)) return "security";
  if (/创新|特色|差异化/.test(text)) return "innovation";
  if (/投资估算|预算说明|预算|经费/.test(text)) return "budget";
  if (/实施|计划|进度|里程碑|交付|部署|推广/.test(text)) return "implementation";
  if (/效益|成效|成果|社会价值|经济价值/.test(text)) return "effect";
  if (/总体方案|总体架构|系统架构|技术架构|数据架构|架构|技术路线/.test(text)) return "architecture";
  if (/建设内容|建设范围|建设对象|核心模块|模块建设/.test(text)) return "content";
  if (/功能|服务|申请|审核|审批|登记|查询|办理|受理|管理|流程/.test(text)) return "function";
  return undefined;
}

function kindFromAncestorTitles(item: Pick<OutlineItem, "id" | "level">, outline: OutlineItem[]): GuidanceKind | undefined {
  const index = outline.findIndex((candidate) => candidate.id === item.id);
  if (index < 0) return undefined;
  let childLevel = item.level;
  for (let parentIndex = index - 1; parentIndex >= 0; parentIndex -= 1) {
    const candidate = outline[parentIndex];
    if (candidate.level < childLevel) {
      const kind = kindFromTitle(candidate.title);
      if (kind) return kind;
      childLevel = candidate.level;
    }
  }
  return undefined;
}

/** Matching order: existing chapter strategy, section title, parent title, then general fallback. */
export function getWritingGuidance(item: OutlineItem, outline: OutlineItem[] = []): WritingGuidancePoint[] {
  const strategyKind = item.promptKey ? PROMPT_KEY_KINDS[item.promptKey] : undefined;
  const kind = strategyKind || kindFromTitle(item.title) || kindFromAncestorTitles(item, outline) || "general";
  return GUIDANCE[kind];
}

export function formatWritingGuidanceForPrompt(guidance: WritingGuidancePoint[]): string {
  return guidance.map((point) => `- ${point.title}：${point.description}`).join("\n");
}

import assert from "node:assert/strict";
import test from "node:test";
import { getWritingGuidance } from "../lib/writing-guidance";
import type { OutlineItem } from "../lib/types";

const titles = (item: OutlineItem, outline: OutlineItem[] = []) => getWritingGuidance(item, outline).map((point) => point.title);
const descriptions = (item: OutlineItem, outline: OutlineItem[] = []) => getWritingGuidance(item, outline).map((point) => point.description);

test("project background uses its saved chapter strategy", () => {
  const item: OutlineItem = { id: "bg", title: "项目背景", level: 1, promptKey: "bg", writingType: "general" };
  assert.deepEqual(titles(item), ["政策背景", "行业发展现状", "甲方现状", "现存问题", "建设必要性"]);
  assert.deepEqual(descriptions(item), [
    "结合相关国家或地方政策，说明本项目所处的政策环境及政策要求。",
    "说明当前行业数字化、数据资源建设或相关领域的发展趋势。",
    "基于项目资料描述甲方已有系统、业务基础和当前建设情况。",
    "说明当前业务、系统、数据管理或协同过程中存在的主要痛点。",
    "解释为什么需要在现有基础上进一步建设本项目，并与后续建设目标衔接。",
  ]);
});

test("construction goal and content use distinct saved chapter strategies", () => {
  assert.deepEqual(titles({ id: "goal", title: "建设目标", level: 1, promptKey: "goal", writingType: "general" }), ["总体目标", "业务目标", "技术目标", "阶段目标", "预期成效"]);
  assert.deepEqual(titles({ id: "content", title: "建设内容", level: 1, promptKey: "content", writingType: "general" }), ["建设对象", "建设范围", "核心模块", "模块关系", "建设成果"]);
});

test("high-risk default chapters use dedicated policy, innovation and budget guidance", () => {
  const cases: Array<[OutlineItem, string[]]> = [
    [{ id: "basis", title: "建设必要性与政策依据", level: 1, promptKey: "basis", writingType: "general" }, ["政策来源", "核心要求", "现状问题", "项目对应", "建设必要性"]],
    [{ id: "innovation", title: "创新与特色", level: 1, promptKey: "innovation", writingType: "general" }, ["现状差异", "机制创新", "技术特色", "应用创新", "表述边界"]],
    [{ id: "budget", title: "投资估算 / 预算说明", level: 1, promptKey: "budget", writingType: "general" }, ["预算依据", "投入范围", "费用构成", "数据边界", "待补充信息"]],
  ];
  for (const [item, expected] of cases) assert.deepEqual(titles(item), expected);
  assert.match(descriptions(cases[0][0])[0], /不编造政策名称、文号/);
  assert.match(descriptions(cases[1][0])[4], /全国首创/);
  assert.match(descriptions(cases[2][0])[3], /不自行推测具体数值/);
});

test("overall architecture is identified from the section title", () => {
  const item: OutlineItem = { id: "custom-architecture", title: "总体架构设计", level: 1, writingType: "general" };
  assert.deepEqual(titles(item), ["架构目标", "架构层次", "核心组件", "组件关系", "数据与现有系统关系"]);
  assert.deepEqual(descriptions(item), [
    "说明总体架构需要支撑的业务目标、管理要求以及后续扩展需求。",
    "结合项目实际，按照业务、应用、数据、技术、安全等维度合理划分整体架构层次。",
    "说明各架构层中的关键平台、系统、服务、数据资源或支撑组件，以及各自承担的主要职责。",
    "说明各层及核心组件之间的调用、依赖、协同关系与职责边界。",
    "说明主要数据流转路径，以及新建能力与甲方现有系统之间的复用、衔接和新增关系。",
  ]);
});

test("specific function nodes use function-design guidance from their title", () => {
  const item: OutlineItem = { id: "custom-register", title: "登记申请服务", level: 2, writingType: "general" };
  assert.deepEqual(titles(item), ["服务对象", "触发条件", "输入信息", "处理流程", "输出与衔接"]);
});

test("custom ordinary nodes inherit meaningful parent guidance before using the general fallback", () => {
  const parent: OutlineItem = { id: "parent", title: "总体架构", level: 1, writingType: "general" };
  const child: OutlineItem = { id: "child", title: "数据交换说明", level: 2, writingType: "general" };
  assert.deepEqual(titles(child, [parent, child]), ["架构目标", "架构层次", "核心组件", "组件关系", "数据与现有系统关系"]);
});

test("unmatched custom nodes use the general fallback rather than function guidance", () => {
  const item: OutlineItem = { id: "custom-note", title: "材料说明", level: 1, writingType: "function_description" };
  assert.deepEqual(titles(item), ["本节目标", "核心对象", "主要内容", "关键机制", "上下文关系", "预期结果"]);
  assert.notDeepEqual(titles(item), ["服务对象", "触发条件", "输入信息", "处理流程", "输出与衔接"]);
});

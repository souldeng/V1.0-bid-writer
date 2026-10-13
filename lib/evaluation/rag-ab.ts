import { mkdir, mkdtemp, readFile, writeFile } from "fs/promises";
import path from "path";
import { buildGenerationContext } from "@/lib/generation-context";
import { getLlmConfig, streamLlmText } from "@/lib/llm";
import type { LlmStreamEvent } from "@/lib/llm";

export type FactAnchor = { id: string; fact: string; aliases: string[]; source?: string };
export type RagAbCase = { caseId: string; projectId: string; sectionId: string; sectionTitle: string; targetWords: number; userRequirement: string; runs: number; factAnchors: FactAnchor[] };
export type RagAbConfig = { name?: string; topK?: number; runTimeoutMs?: number; cases: RagAbCase[] };
export type RunCondition = "rag-off" | "rag-on";
export type EvaluationModelInfo = { provider: string; model: string };
export type RawRun = {
  timestamp: string; caseId: string; runId: string; condition: RunCondition; ragEnabled: boolean;
  projectId: string; sectionId: string; sectionTitle: string; targetWords: number; userRequirement: string;
  writingGuidance: { title: string; description: string }[]; model: EvaluationModelInfo; modelParameters: { temperature: number };
  retrievalQuery: string | null; topK: number; retrievedChunks: { id: string; docId: string; sourceFile: string; score: number; text: string }[];
  output: string; outputCharacterCount: number; targetWordDeviation: number; latencyMs: number; success: boolean;
  errorType: string | null; error: string | null; automaticPreliminaryAnchorMatches: { id: string; matchedAliases: string[] }[];
};

type EvaluationOptions = {
  outputBaseDir?: string; now?: () => Date; stream?: (request: Parameters<typeof streamLlmText>[0]) => Promise<AsyncIterable<LlmStreamEvent>>; modelInfo?: EvaluationModelInfo;
  onRunStart?: (run: { runId: string; condition: RunCondition; ordinal: number; total: number }) => void;
  onRunComplete?: (run: RawRun, ordinal: number, total: number) => void;
};

class EvaluationTimeoutError extends Error {
  constructor(timeoutMs: number) { super(`模型生成超时（${Math.round(timeoutMs / 1000)} 秒），已继续下一次运行。`); this.name = "EvaluationTimeoutError"; }
}

function safeName(value: string): string { return value.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 80) || "rag-ab"; }
function timestampName(date: Date): string { return date.toISOString().replace(/[:.]/g, "-"); }
function countCharacters(text: string): number { return text.replace(/\s/g, "").length; }
function automaticMatches(output: string, anchors: FactAnchor[]) {
  const normalized = output.toLowerCase();
  return anchors.map((anchor) => ({ id: anchor.id, matchedAliases: [anchor.fact, ...anchor.aliases].filter((alias) => alias && normalized.includes(alias.toLowerCase())) })).filter((match) => match.matchedAliases.length);
}
function csv(value: unknown): string { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
function errorKind(error: unknown): string { return error instanceof EvaluationTimeoutError ? "timeout" : error instanceof Error && error.name === "LlmError" && "kind" in error ? String((error as { kind: unknown }).kind) : error instanceof Error && error.name === "GenerationContextError" ? "context" : "unknown"; }

export function validateRagAbConfig(input: unknown): RagAbConfig {
  const value = input && typeof input === "object" ? input as Partial<RagAbConfig> : {};
  if (!Array.isArray(value.cases) || !value.cases.length) throw new Error("评测配置至少需要一个 case。");
  const topK = Number(value.topK ?? 5);
  if (!Number.isInteger(topK) || topK < 1 || topK > 20) throw new Error("topK 应为 1—20 的整数。");
  const runTimeoutMs = Number(value.runTimeoutMs ?? 240000);
  if (!Number.isInteger(runTimeoutMs) || runTimeoutMs < 1000 || runTimeoutMs > 600000) throw new Error("runTimeoutMs 应为 1000—600000 的整数。");
  const cases = value.cases.map((item, index) => {
    const caseValue = item as Partial<RagAbCase>;
    const required = [caseValue.caseId, caseValue.projectId, caseValue.sectionId, caseValue.sectionTitle].every((field) => typeof field === "string" && field.trim());
    const targetWords = Number(caseValue.targetWords);
    const runs = Number(caseValue.runs ?? 3);
    if (!required || !Number.isInteger(targetWords) || targetWords < 100 || targetWords > 4000 || !Number.isInteger(runs) || runs < 1 || runs > 20) throw new Error(`第 ${index + 1} 个 case 配置无效。`);
    return { caseId: caseValue.caseId!.trim(), projectId: caseValue.projectId!.trim(), sectionId: caseValue.sectionId!.trim(), sectionTitle: caseValue.sectionTitle!.trim(), targetWords, userRequirement: String(caseValue.userRequirement ?? ""), runs, factAnchors: Array.isArray(caseValue.factAnchors) ? caseValue.factAnchors.map((anchor) => ({ id: String(anchor.id || ""), fact: String(anchor.fact || ""), aliases: Array.isArray(anchor.aliases) ? anchor.aliases.map(String) : [], ...(anchor.source ? { source: String(anchor.source) } : {}) })) : [] };
  });
  return { ...(typeof value.name === "string" ? { name: value.name } : {}), topK, runTimeoutMs, cases };
}

function reviewCsv(runs: RawRun[]): string {
  const header = ["runId", "caseId", "condition", "manualFactAnchorCorrectHits", "unsupportedFactCount", "projectSpecificity1to5", "materialUsageScore1to5", "editEffortLowMediumHigh", "topKRelevantChunkCount", "containsKeyEvidenceYesNo", "mainIssues", "notes"];
  return [header.join(","), ...runs.map((run) => [run.runId, run.caseId, run.condition, "", "", "", "", "", "", "", "", ""].map(csv).join(","))].join("\n") + "\n";
}

function reviewMarkdown(runs: RawRun[]): string {
  const rows = runs.map((run) => `| ${run.runId} | ${run.condition} | Fact Anchor 正确命中数；无依据具体事实数；项目针对性 1–5；材料利用质量 1–5；修改量；${run.condition === "rag-on" ? "Top-K 相关片段数、是否包含关键依据；" : ""}主要问题与备注 |`).join("\n");
  return "# RAG ON/OFF 人工 Review\n\n本实验为 **exploratory small-sample evaluation**。关键词/alias 自动命中只是 preliminary match，不能当作事实正确率。请优先填写同目录的 review.csv，然后运行汇总命令。\n\n| Run | 条件 | 需人工检查 |\n|---|---|---|\n" + rows + "\n\n字段说明：\n\n- manualFactAnchorCorrectHits：人工确认的正确命中数，不是关键词命中数。\n- unsupportedFactCount：输出中没有材料或已确认项目事实支持的具体事实数。\n- editEffortLowMediumHigh：低 / 中 / 高。\n- RAG ON 的 topKRelevantChunkCount 与 containsKeyEvidenceYesNo 仅评价检索证据。\n";
}

function automaticSummaryCsv(runs: RawRun[]): string {
  const header = ["runId", "caseId", "condition", "success", "outputCharacterCount", "targetWordDeviation", "latencyMs", "automaticPreliminaryAnchorMatchCount", "retrievedChunkCount", "sourceFileCount", "errorType"];
  return [header.join(","), ...runs.map((run) => [run.runId, run.caseId, run.condition, run.success, run.outputCharacterCount, run.targetWordDeviation.toFixed(4), run.latencyMs, run.automaticPreliminaryAnchorMatches.length, run.retrievedChunks.length, new Set(run.retrievedChunks.map((chunk) => chunk.sourceFile)).size, run.errorType].map(csv).join(","))].join("\n") + "\n";
}

/** Runs an append-only offline RAG A/B experiment using the same context builder and LLM service as the product route. */
export async function runRagAbEvaluation(input: unknown, options: EvaluationOptions = {}): Promise<{ runDirectory: string; runs: RawRun[] }> {
  const config = validateRagAbConfig(input);
  const now = options.now ?? (() => new Date());
  const outputBaseDir = options.outputBaseDir ?? path.join(process.cwd(), "docs", "evaluation", "rag-ab", "runs");
  await mkdir(outputBaseDir, { recursive: true });
  const runDirectory = await mkdtemp(path.join(outputBaseDir, `${timestampName(now())}-${safeName(config.name || "rag-ab")}-`));
  const model = options.modelInfo ?? (() => { const config = getLlmConfig(); return { provider: config.provider, model: config.model }; })();
  const stream = options.stream ?? streamLlmText;
  const runs: RawRun[] = [];
  const totalRuns = config.cases.reduce((total, testCase) => total + testCase.runs * 2, 0);
  let ordinal = 0;
  await mkdir(path.join(runDirectory, "raw"), { recursive: true });
  for (const testCase of config.cases) for (let index = 1; index <= testCase.runs; index += 1) for (const condition of ["rag-off", "rag-on"] as const) {
    const runId = `${safeName(testCase.caseId)}-${condition}-${index}`;
    ordinal += 1;
    options.onRunStart?.({ runId, condition, ordinal, total: totalRuns });
    const timestamp = now().toISOString(); const started = Date.now();
    let output = ""; let context: Awaited<ReturnType<typeof buildGenerationContext>> | null = null; let error: unknown = null;
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, config.runTimeoutMs);
    try {
      context = await buildGenerationContext({ projectId: testCase.projectId, chapterId: testCase.sectionId, wordTarget: testCase.targetWords, extra: testCase.userRequirement, useRag: condition === "rag-on", mode: "draft", topK: config.topK });
      for await (const event of await stream({ messages: [{ role: "system", content: context.systemPrompt }, { role: "user", content: context.prompt }], temperature: context.temperature, signal: controller.signal })) if (event.type === "text") output += event.text;
      if (timedOut) throw new EvaluationTimeoutError(config.runTimeoutMs);
      if (!output.trim()) throw new Error("模型未返回正文。");
    } catch (caught) { error = timedOut ? new EvaluationTimeoutError(config.runTimeoutMs) : caught; } finally { clearTimeout(timeout); }
    const chars = countCharacters(output);
    const record: RawRun = {
      timestamp, caseId: testCase.caseId, runId, condition, ragEnabled: condition === "rag-on", projectId: testCase.projectId, sectionId: testCase.sectionId, sectionTitle: testCase.sectionTitle, targetWords: testCase.targetWords, userRequirement: testCase.userRequirement,
      writingGuidance: context?.guidance ?? [], model, modelParameters: { temperature: context?.temperature ?? 0.5 }, retrievalQuery: context?.retrievalQuery ?? null, topK: config.topK ?? 5,
      retrievedChunks: (context?.chunks ?? []).map((chunk) => ({ id: chunk.id, docId: chunk.docId, sourceFile: chunk.docName, score: chunk.score, text: chunk.text })), output, outputCharacterCount: chars, targetWordDeviation: testCase.targetWords ? (chars - testCase.targetWords) / testCase.targetWords : 0,
      latencyMs: Date.now() - started, success: !error, errorType: error ? errorKind(error) : null, error: error instanceof Error ? error.message : error ? "评测运行失败。" : null, automaticPreliminaryAnchorMatches: automaticMatches(output, testCase.factAnchors),
    };
    runs.push(record);
    await writeFile(path.join(runDirectory, "raw", `${runId}.json`), JSON.stringify(record, null, 2), "utf8");
    options.onRunComplete?.(record, ordinal, totalRuns);
  }
  await writeFile(path.join(runDirectory, "config.json"), JSON.stringify(config, null, 2), "utf8");
  await writeFile(path.join(runDirectory, "summary.csv"), automaticSummaryCsv(runs), "utf8");
  await writeFile(path.join(runDirectory, "review.csv"), reviewCsv(runs), "utf8");
  await writeFile(path.join(runDirectory, "review.md"), reviewMarkdown(runs), "utf8");
  await writeFile(path.join(runDirectory, "README.md"), `# RAG ON/OFF 评测运行\n\n- 运行目录：\`${path.basename(runDirectory)}\`\n- 设计：每个 case 在 rag-off 与 rag-on 下各运行配置次数；除 RAG 开关外，使用同一 Project、Section、Writing Guidance、补充要求、目标字数和模型参数。\n- 自动结果：\`raw/*.json\`、\`summary.csv\`。请填写 \`review.csv\` 后运行汇总命令。\n- 注意：这是 exploratory small-sample evaluation，不输出事实正确率、幻觉率、RAG 准确率或质量提升结论。\n`, "utf8");
  await summarizeRagAbReview(runDirectory);
  return { runDirectory, runs };
}

function parseCsv(text: string): string[][] { return text.trim().split(/\r?\n/).map((line) => Array.from(line.matchAll(/(?:^|,)(?:"((?:[^"]|"")*)"|([^,]*))/g)).map((match) => (match[1] ?? match[2] ?? "").replace(/""/g, '"'))); }
function mean(values: number[]): number | null { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
function range(values: number[]): { min: number; max: number } | null { return values.length ? { min: Math.min(...values), max: Math.max(...values) } : null; }

/** Aggregates only manually filled review.csv values and keeps small-sample caveats explicit. */
export async function summarizeRagAbReview(runDirectory: string): Promise<{ outputPath: string }> {
  const runs = await Promise.all((await (await import("fs/promises")).readdir(path.join(runDirectory, "raw"))).filter((name) => name.endsWith(".json")).map(async (name) => JSON.parse(await readFile(path.join(runDirectory, "raw", name), "utf8")) as RawRun));
  const table = parseCsv(await readFile(path.join(runDirectory, "review.csv"), "utf8"));
  const header = table.shift() ?? []; const reviews = new Map(table.map((row) => [row[0], Object.fromEntries(header.map((name, index) => [name, row[index] ?? ""]))]));
  const grouped = Object.groupBy(runs, (run) => run.condition);
  const result = Object.fromEntries(Object.entries(grouped).map(([condition, items]) => {
    const rows = items ?? []; const numeric = (name: string) => rows
      .map((run) => reviews.get(run.runId)?.[name]?.trim() ?? "")
      .filter((value) => value !== "")
      .map(Number)
      .filter(Number.isFinite);
    return [condition, { runs: rows.length, successRate: rows.length ? rows.filter((run) => run.success).length / rows.length : null, averageLatencyMs: mean(rows.map((run) => run.latencyMs)), latencyRangeMs: range(rows.map((run) => run.latencyMs)), averageFactAnchorCorrectHits: mean(numeric("manualFactAnchorCorrectHits")), averageUnsupportedFactCount: mean(numeric("unsupportedFactCount")), averageProjectSpecificity: mean(numeric("projectSpecificity1to5")), averageMaterialUsageScore: mean(numeric("materialUsageScore1to5")), automaticAveragePreliminaryAnchorMatches: mean(rows.map((run) => run.automaticPreliminaryAnchorMatches.length)), averageEditEffort: rows.map((run) => reviews.get(run.runId)?.editEffortLowMediumHigh).filter(Boolean) }];
  }));
  const outputPath = path.join(runDirectory, "final-summary.json");
  await writeFile(outputPath, JSON.stringify({ note: "exploratory small-sample evaluation; manual ratings are not statistical proof.", conditions: result }, null, 2), "utf8");
  await writeFile(path.join(runDirectory, "final-summary.md"), `# RAG ON/OFF 汇总\n\n**exploratory small-sample evaluation**：样本量小，不做统计显著性、商业提效、事实正确率或 RAG 准确率结论。\n\n\`final-summary.json\` 包含按条件汇总的自动指标和已填写人工评分。\n`, "utf8");
  return { outputPath };
}

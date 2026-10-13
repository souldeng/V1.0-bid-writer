import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getNextProjectAfterDeletion } from "../lib/project-lifecycle";
import { processFilesIndependently } from "../lib/upload-batch";
import { getDocxExportFailureMessage } from "../lib/export-errors";
import { EMPTY_PROJECT_INPUT } from "../lib/project-defaults";
import { getProjectExportFacts, getProjectPromptFacts } from "../lib/project-facts";

let testDir = "";
let data: typeof import("../lib/data");
let rag: typeof import("../lib/rag");
let extract: typeof import("../lib/extract");
let chapterPrompts: typeof import("../lib/chapters");
let outlineTools: typeof import("../lib/outline");
let content: typeof import("../lib/content");
let uploadLimits: typeof import("../lib/upload-limits");
let exportStyles: typeof import("../lib/export-style");
let docxRenderer: typeof import("../lib/docx-renderer");
let ragAb: typeof import("../lib/evaluation/rag-ab");
const ready = (async () => {
  testDir = await mkdtemp(path.join(os.tmpdir(), "bid-writer-test-"));
  process.env.BID_WRITER_DATA_DIR = testDir;
  data = await import("../lib/data");
  rag = await import("../lib/rag");
  extract = await import("../lib/extract");
  chapterPrompts = await import("../lib/chapters");
  outlineTools = await import("../lib/outline");
  content = await import("../lib/content");
  uploadLimits = await import("../lib/upload-limits");
  exportStyles = await import("../lib/export-style");
  docxRenderer = await import("../lib/docx-renderer");
  ragAb = await import("../lib/evaluation/rag-ab");
})();

after(async () => { await ready; await rm(testDir, { recursive: true, force: true }); });

test("TXT and Markdown are parsed as UTF-8 text", async () => {
  await ready;
  assert.equal(await extract.extractText(Buffer.from("# 标题\n申报材料正文", "utf8"), "material.md"), "# 标题\n申报材料正文");
  await assert.rejects(() => extract.extractText(Buffer.from("x"), "material.xlsx"), /不支持的文件格式/);
});

test("a single upload accepts up to 100MB and rejects larger files", async () => {
  await ready;
  assert.equal(uploadLimits.MAX_UPLOAD_FILE_SIZE_BYTES, 100 * 1024 * 1024);
  assert.equal(uploadLimits.isUploadFileSizeAllowed(uploadLimits.MAX_UPLOAD_FILE_SIZE_BYTES), true);
  assert.equal(uploadLimits.isUploadFileSizeAllowed(uploadLimits.MAX_UPLOAD_FILE_SIZE_BYTES + 1), false);
  assert.equal(uploadLimits.isUploadFileSizeAllowed(-1), false);
});

test("project creation only requires a project name; optional context remains empty until supplied", async () => {
  await ready;
  assert.deepEqual(EMPTY_PROJECT_INPUT, { name: "", org: "", level: "", region: "", budget: "", domain: "", desc: "", edge: "" });
  const project = await data.saveProject({ ...EMPTY_PROJECT_INPUT, name: "最小项目" });
  assert.equal(project.name, "最小项目");
  assert.equal(project.org, "");
  assert.equal(project.level, "");
  assert.equal(project.budget, "");
  assert.equal(project.domain, "");
  assert.equal(project.desc, "");
  await assert.rejects(() => data.saveProject({ ...EMPTY_PROJECT_INPUT }), /请填写项目名称/);
});

test("DOCX export styles use defaults, persist per project, and map to the renderer", async () => {
  await ready;
  const defaultStyle = exportStyles.getDefaultExportStyle();
  assert.equal(defaultStyle.body.chineseFont, "宋体");
  assert.equal(defaultStyle.body.westernFont, "Times New Roman");
  assert.equal(defaultStyle.body.fontSizePt, 12, "小四 is emitted as 12pt");
  assert.deepEqual(defaultStyle.body.lineSpacing, { mode: "fixed", value: 25 });
  assert.equal(defaultStyle.heading1.fontSizePt, 16, "小三 is emitted as 16pt");
  assert.equal(defaultStyle.heading2.fontSizePt, 15, "小三 is emitted as 15pt");
  assert.equal(defaultStyle.heading3.fontSizePt, 14, "四号 is emitted as 14pt");
  assert.equal(defaultStyle.heading4.fontSizePt, 12, "小四 is emitted as 12pt");

  const projectA = await data.saveProject({ ...EMPTY_PROJECT_INPUT, name: "样式项目 A" });
  const projectB = await data.saveProject({ ...EMPTY_PROJECT_INPUT, name: "样式项目 B" });
  assert.equal(projectA.exportStyle, undefined, "legacy or new projects without a saved style use the system default");

  const defaultOptions = docxRenderer.getDocxRenderOptions(projectA.exportStyle);
  assert.equal(defaultOptions.page.margin.top, Math.round(25.4 * 56.6929));
  assert.equal(defaultOptions.body.run.font.eastAsia, "宋体");
  assert.equal(defaultOptions.body.run.font.ascii, "Times New Roman");
  assert.equal(defaultOptions.body.paragraph.indent?.firstLine, 480);
  assert.equal(defaultOptions.heading1.run.size, 32);
  assert.equal(defaultOptions.heading2.run.size, 30);
  assert.equal(defaultOptions.heading3.run.size, 28);
  assert.equal(defaultOptions.heading4.run.size, 24);

  const custom = { ...defaultStyle, page: { ...defaultStyle.page, leftMm: 32 }, body: { ...defaultStyle.body, chineseFont: "仿宋", fontSizePt: 13, lineSpacing: { mode: "fixed" as const, value: 28 } }, heading1: { ...defaultStyle.heading1, chineseFont: "黑体", fontSizePt: 18 } };
  const savedA = await data.saveExportStyle(projectA.id, custom);
  const customOptions = docxRenderer.getDocxRenderOptions(savedA.exportStyle);
  assert.equal(customOptions.page.margin.left, Math.round(32 * 56.6929));
  assert.equal(customOptions.body.run.font.eastAsia, "仿宋");
  assert.equal(customOptions.body.run.size, 26);
  assert.equal(customOptions.body.paragraph.spacing.line, 560);
  assert.equal(customOptions.heading1.run.font.eastAsia, "黑体");
  assert.equal(customOptions.heading1.run.size, 36);
  assert.equal((await data.getProject(projectB.id))?.exportStyle, undefined, "one project style never changes another project");

  const restored = await data.saveExportStyle(projectA.id, exportStyles.getDefaultExportStyle());
  assert.deepEqual(restored.exportStyle, defaultStyle, "restoring defaults stores the original project-level defaults again");
  const prompt = chapterPrompts.buildPrompt(restored, "bg", 300);
  assert.doesNotMatch(prompt, /宋体|Times New Roman|字号|导出样式/, "presentation-only export style never enters generation context");
});

test("Word-friendly font sizes, line spacing, paragraph spacing and indentation have one renderer conversion", async () => {
  await ready;
  assert.equal(exportStyles.wordFontSizeToPt("三号"), 16);
  assert.equal(exportStyles.wordFontSizeToPt("小三"), 15);
  assert.equal(exportStyles.wordFontSizeToPt("四号"), 14);
  assert.equal(exportStyles.wordFontSizeToPt("小四"), 12);
  assert.equal(exportStyles.wordFontSizeToPt("五号"), 10.5);
  assert.equal(exportStyles.wordFontSizeToPt("小五"), 9);
  assert.deepEqual(docxRenderer.lineSpacingToDocx({ mode: "single", value: 1 }), { line: 240, lineRule: "auto" });
  assert.deepEqual(docxRenderer.lineSpacingToDocx({ mode: "multiple", value: 1.5 }), { line: 360, lineRule: "auto" });
  assert.deepEqual(docxRenderer.lineSpacingToDocx({ mode: "multiple", value: 2 }), { line: 480, lineRule: "auto" });
  assert.deepEqual(docxRenderer.lineSpacingToDocx({ mode: "multiple", value: 1.25 }), { line: 300, lineRule: "auto" });
  assert.deepEqual(docxRenderer.lineSpacingToDocx({ mode: "fixed", value: 25 }), { line: 500, lineRule: "exact" });
  const text = { fontSizePt: 12, lineSpacing: { mode: "fixed" as const, value: 25 } };
  assert.equal(docxRenderer.paragraphSpacingToDocx({ unit: "line", value: 0 }, text), 0);
  assert.equal(docxRenderer.paragraphSpacingToDocx({ unit: "line", value: 0.5 }, text), 250);
  assert.equal(docxRenderer.paragraphSpacingToDocx({ unit: "line", value: 1 }, text), 500);
  assert.equal(docxRenderer.indentCharsToDocx(12, 2), 480);
});

test("outline supports a real fourth level while rejecting jumps and fifth levels", async () => {
  await ready;
  const fourLevels = [
    { id: "h1", title: "建设内容", level: 1 as const }, { id: "h2", title: "系统建设", level: 2 as const },
    { id: "h3", title: "登记服务", level: 3 as const }, { id: "h4", title: "申请校验", level: 4 as const },
  ];
  assert.deepEqual(outlineTools.validateOutline(fourLevels).map((item) => item.level), [1, 2, 3, 4]);
  assert.deepEqual(outlineTools.outlineNumbers(fourLevels), ["1", "1.1", "1.1.1", "1.1.1.1"]);
  const inserted = outlineTools.insertOutlineChild(fourLevels.slice(0, 3), 2, { id: "h4-new", title: "材料校验", level: 1 });
  assert.equal(inserted[3].level, 4);
  assert.deepEqual(outlineTools.insertOutlineChild(fourLevels, 3, { id: "impossible", title: "五级", level: 1 }), fourLevels);
  assert.throws(() => outlineTools.validateOutline([...fourLevels, { id: "h5", title: "非法五级", level: 5 }]), /最多支持四级/);
  assert.throws(() => outlineTools.validateOutline([{ id: "h1", title: "根", level: 1 }, { id: "h3", title: "跳级", level: 3 }]), /不能跨级/);
  const project = await data.saveProject({ ...EMPTY_PROJECT_INPUT, name: "四级目录项目" });
  await data.saveOutline(project.id, fourLevels);
  await data.saveChapter(project.id, "h4", "四级章节正文。");
  assert.equal((await data.getProject(project.id))?.outline?.[3].level, 4);
  assert.equal((await data.listChapters(project.id)).h4.content, "四级章节正文。");
  assert.match(chapterPrompts.buildPrompt(project, "h4", 300, "", "申请校验"), /目录标题：申请校验/);
});

test("DOCX keeps the complete outline while ChapterData only controls each heading body", async () => {
  await ready;
  const outline = [
    { id: "background", title: "项目背景", level: 1 as const },
    { id: "content", title: "建设内容", level: 1 as const },
    { id: "system", title: "数据产品等级系统", level: 2 as const },
    { id: "apply", title: "登记申请服务", level: 3 as const },
    { id: "review", title: "登记审核服务", level: 3 as const },
    { id: "publish", title: "公示公告及发证服务", level: 3 as const },
  ];
  const chapters = {
    background: { chapterId: "background", content: "项目背景正文。", wc: 7, ragSources: [], updatedAt: "now" },
    apply: { chapterId: "apply", content: "申请正文。", wc: 5, ragSources: [], updatedAt: "now" },
    review: { chapterId: "review", content: "审核正文。", wc: 5, ragSources: [], updatedAt: "now" },
    publish: { chapterId: "publish", content: "公示正文。", wc: 6, ragSources: [], updatedAt: "now" },
  };
  const entries = docxRenderer.getDocxOutlineEntries(outline, chapters);
  assert.deepEqual(entries.map((entry) => [entry.number, entry.item.title, entry.content]), [
    ["1", "项目背景", "项目背景正文。"], ["2", "建设内容", undefined], ["2.1", "数据产品等级系统", undefined],
    ["2.1.1", "登记申请服务", "申请正文。"], ["2.1.2", "登记审核服务", "审核正文。"], ["2.1.3", "公示公告及发证服务", "公示正文。"],
  ]);
  assert.doesNotMatch(JSON.stringify(entries), /待补充|暂无内容/);

  const h4Outline = [
    { id: "h1", title: "一级", level: 1 as const }, { id: "h2", title: "二级", level: 2 as const },
    { id: "h3", title: "三级", level: 3 as const }, { id: "h4", title: "四级", level: 4 as const },
  ];
  const h4Entries = docxRenderer.getDocxOutlineEntries(h4Outline, { h4: { chapterId: "h4", content: "四级正文。", wc: 5, ragSources: [], updatedAt: "now" } });
  assert.deepEqual(h4Entries.map((entry) => [entry.number, entry.content]), [["1", undefined], ["1.1", undefined], ["1.1.1", undefined], ["1.1.1.1", "四级正文。"]]);
  assert.equal(docxRenderer.getDocxRenderOptions().heading4.run.size, 24, "H4 remains mapped to its own export style");

  const emptyBranch = [
    { id: "written", title: "已有正文", level: 1 as const }, { id: "empty", title: "空分支", level: 1 as const },
    { id: "empty-child", title: "空子节点", level: 2 as const },
  ];
  assert.deepEqual(docxRenderer.getDocxOutlineEntries(emptyBranch, { written: { chapterId: "written", content: "已保存。", wc: 4, ragSources: [], updatedAt: "now" } }).map((entry) => entry.number), ["1", "2", "2.1"]);
});

test("offline RAG A/B evaluator keeps conditions isolated, leaves evidence, and never writes model secrets", async () => {
  await ready;
  const projectA = await data.saveProject({ ...EMPTY_PROJECT_INPUT, name: "评测项目 A", desc: "数据产品登记" });
  const projectB = await data.saveProject({ ...EMPTY_PROJECT_INPUT, name: "评测项目 B", desc: "不相关项目" });
  await data.saveOutline(projectA.id, [{ id: "apply", title: "登记申请服务", level: 1 }]);
  await rag.addDocument({ id: "eval-a", projectId: projectA.id, name: "项目A依据.txt", type: "policy", size: 20, uploadedAt: new Date().toISOString(), chunkCount: 1, summary: "" }, "登记申请服务需要校验申请资料并形成受理结果。");
  await rag.addDocument({ id: "eval-b", projectId: projectB.id, name: "项目B依据.txt", type: "policy", size: 20, uploadedAt: new Date().toISOString(), chunkCount: 1, summary: "" }, "不相关项目的专有材料。");
  const config = { name: "test", topK: 5, cases: [{ caseId: "apply", projectId: projectA.id, sectionId: "apply", sectionTitle: "登记申请服务", targetWords: 300, userRequirement: "仅描述申请受理。", runs: 1, factAnchors: [{ id: "F01", fact: "申请资料", aliases: ["受理结果"], source: "项目A依据.txt" }] }] };
  const outputBaseDir = path.join(testDir, "evaluation-runs");
  const stream = async () => (async function* () { yield { type: "text" as const, text: "系统校验申请资料并返回受理结果。" }; yield { type: "done" as const }; })();
  const first = await ragAb.runRagAbEvaluation(config, { outputBaseDir, now: () => new Date("2026-09-25T00:00:00.000Z"), modelInfo: { provider: "test", model: "test-model" }, stream });
  assert.equal(first.runs.length, 2);
  const off = first.runs.find((run) => run.condition === "rag-off")!;
  const on = first.runs.find((run) => run.condition === "rag-on")!;
  assert.equal(off.retrievalQuery, null);
  assert.deepEqual(off.retrievedChunks, []);
  assert.match(on.retrievalQuery || "", /登记申请服务/);
  assert.deepEqual(on.retrievedChunks.map((chunk) => chunk.sourceFile), ["项目A依据.txt"]);
  const rawText = await readFile(path.join(first.runDirectory, "raw", `${on.runId}.json`), "utf8");
  assert.doesNotMatch(rawText, /API[_ -]?KEY|secret/i);
  assert.match(await readFile(path.join(first.runDirectory, "review.md"), "utf8"), /exploratory small-sample evaluation/);
  const second = await ragAb.runRagAbEvaluation(config, { outputBaseDir, now: () => new Date("2026-09-25T00:00:00.000Z"), modelInfo: { provider: "test", model: "test-model" }, stream });
  assert.notEqual(first.runDirectory, second.runDirectory, "runs never overwrite an existing experiment directory");

  const failed = await ragAb.runRagAbEvaluation(config, { outputBaseDir, modelInfo: { provider: "test", model: "test-model" }, stream: async () => { throw new Error("模拟模型失败"); } });
  assert.ok(failed.runs.every((run) => !run.success && run.error));
  assert.ok((await readFile(path.join(failed.runDirectory, "raw", `${failed.runs[0].runId}.json`), "utf8")).includes("模拟模型失败"));
  const timedOut = await ragAb.runRagAbEvaluation({ ...config, runTimeoutMs: 1000 }, {
    outputBaseDir, modelInfo: { provider: "test", model: "test-model" },
    stream: async (request) => (async function* () {
      await new Promise<void>((_, reject) => request.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true }));
      yield { type: "done" as const };
    })(),
  });
  assert.deepEqual(timedOut.runs.map((run) => run.errorType), ["timeout", "timeout"], "a timeout is recorded and the paired condition continues");
  assert.ok(await readFile(path.join(timedOut.runDirectory, "raw", `${timedOut.runs[1].runId}.json`), "utf8"), "timed-out runs retain raw evidence");
  const reviewCsv = await readFile(path.join(first.runDirectory, "review.csv"), "utf8");
  await writeFile(path.join(first.runDirectory, "review.csv"), reviewCsv.replace(/""\,""\,""\,""\,""\,""\,""\,""\,""\,""\,$/m, '"1","0","4","4","中","1","是","无",""'), "utf8");
  assert.match((await ragAb.summarizeRagAbReview(first.runDirectory)).outputPath, /final-summary\.json$/);
  assert.ok(await readFile(path.join(first.runDirectory, "final-summary.json"), "utf8"), "each completed evaluation also produces an initial summary");
  const emptyReviewSummary = JSON.parse(await readFile(path.join(second.runDirectory, "final-summary.json"), "utf8"));
  assert.equal(emptyReviewSummary.conditions["rag-off"].averageProjectSpecificity, null, "blank human review cells must remain unscored rather than become zero");
});

test("only supplied project facts are retained and enter prompt or DOCX metadata", async () => {
  await ready;
  const minimal = await data.saveProject({ ...EMPTY_PROJECT_INPUT, name: "最小事实项目" });
  const minimalPrompt = chapterPrompts.buildPrompt(minimal, "budget", 400);
  const minimalPolishPrompt = chapterPrompts.buildPolishPrompt(minimal, "budget", "已有正文");
  assert.doesNotMatch(minimalPrompt, /申报主体|申报级别|所在地区|项目预算|建设领域|建设内容|项目优势|未指定|500-2000万|省级|数字资源体系建设/);
  assert.doesNotMatch(minimalPolishPrompt, /申报主体|申报级别|所在地区|项目预算|建设领域|建设内容|项目优势|未指定|500-2000万|省级|数字资源体系建设/);
  assert.deepEqual(getProjectExportFacts(minimal), []);

  const supplied = await data.saveProject({ ...minimal, org: "测试单位", level: "市级", region: "测试市", budget: "已确认测试预算", domain: "数据治理", desc: "建设测试平台", edge: "已有基础" }, minimal.id);
  assert.deepEqual(getProjectPromptFacts(supplied), [
    ["项目名称", "最小事实项目"], ["申报主体", "测试单位"], ["申报级别", "市级"], ["所在地区", "测试市"], ["项目预算", "已确认测试预算"], ["建设领域", "数据治理"], ["建设内容", "建设测试平台"], ["项目优势", "已有基础"],
  ]);
  assert.deepEqual(getProjectExportFacts(supplied), [["申报主体", "测试单位"], ["申报级别", "市级"], ["所在地区", "测试市"], ["预算", "已确认测试预算"]]);
  const suppliedPrompt = chapterPrompts.buildPrompt(supplied, "budget", 400);
  assert.match(suppliedPrompt, /项目预算：已确认测试预算/);
  assert.match(suppliedPrompt, /申报级别：市级/);
  assert.match(suppliedPrompt, /建设领域：数据治理/);

  const existing = await data.saveProject({ name: "已有项目", org: "已有主体", level: "省级", region: "已有地区", budget: "已有预算", domain: "已有领域", desc: "已有内容", edge: "" });
  const edited = await data.saveProject({ ...existing, name: "已有项目（编辑后）" }, existing.id);
  assert.deepEqual({ level: edited.level, budget: edited.budget, domain: edited.domain }, { level: "省级", budget: "已有预算", domain: "已有领域" });
});

test("batch upload continues after one file fails and reports the failed file", async () => {
  const handled: string[] = [];
  const result = await processFilesIndependently(["可上传A", "失败文件", "可上传B"], async (file) => {
    handled.push(file);
    if (file === "失败文件") throw new Error("文件内容为空");
  });
  assert.deepEqual(handled, ["可上传A", "失败文件", "可上传B"]);
  assert.deepEqual(result.succeeded, ["可上传A", "可上传B"]);
  assert.deepEqual(result.failed, [{ file: "失败文件", reason: "文件内容为空" }]);
});

test("DOCX export errors are safe and actionable without leaking internal details", () => {
  assert.equal(getDocxExportFailureMessage(400), "当前没有可导出的已保存章节，请先保存正文后重试。");
  assert.equal(getDocxExportFailureMessage(404), "当前项目不存在或已被删除，请重新选择项目后重试。");
  assert.equal(getDocxExportFailureMessage(500), "导出文件生成失败，请稍后重试。");
});

test("project and chapter save persist through the repository", async () => {
  await ready;
  const project = await data.saveProject({ name: "测试项目", org: "测试单位", level: "市级", region: "测试市", budget: "100-500万", domain: "数据治理", desc: "建设测试平台", edge: "已有基础" });
  const chapter = await data.saveChapter(project.id, "bg", "一、建设背景\n项目需要建设。", ["政策.txt"]);
  assert.equal(chapter.wc, data.countWords("一、建设背景\n项目需要建设。"));
  const saved = await data.listChapters(project.id);
  assert.equal(saved.bg.content, "一、建设背景\n项目需要建设。");
  assert.deepEqual(saved.bg.ragSources, ["政策.txt"]);
});

test("clearing a saved chapter removes only its body while keeping the project and other chapters", async () => {
  await ready;
  const project = await data.saveProject({ ...EMPTY_PROJECT_INPUT, name: "清空正文项目" });
  const otherProject = await data.saveProject({ ...EMPTY_PROJECT_INPUT, name: "保留正文项目" });
  await data.saveChapter(project.id, "background", "待清空正文。", ["背景资料.txt"]);
  await data.saveChapter(project.id, "goal", "保留的同项目正文。");
  await data.saveChapter(otherProject.id, "background", "其他项目正文。");
  await data.clearChapter(project.id, "background");
  const chapters = await data.listChapters(project.id);
  assert.equal(chapters.background, undefined);
  assert.equal(chapters.goal.content, "保留的同项目正文。");
  assert.equal((await data.listChapters(otherProject.id)).background.content, "其他项目正文。");
  assert.ok(await data.getProject(project.id), "clearing a body must not delete the project or its outline");
});

test("a project can persist an editable three-level outline", async () => {
  await ready;
  const project = await data.saveProject({ name: "目录项目", org: "测试单位", level: "省级", region: "", budget: "100万以下", domain: "数据治理", desc: "建设登记系统", edge: "" });
  const outline = [
    { id: "custom-root", title: "建设内容", level: 1 as const },
    { id: "custom-child", title: "数据产品登记系统", level: 2 as const },
    { id: "custom-detail", title: "登记申请", level: 3 as const },
  ];
  await data.saveOutline(project.id, outline);
  assert.deepEqual((await data.getProject(project.id))?.outline, outline.map((item) => ({ ...item, writingType: "function_description" })));
  const prompt = chapterPrompts.buildPrompt(project, "custom-child", 800, "覆盖申请与审核", "数据产品登记系统");
  assert.match(prompt, /目录标题：数据产品登记系统/);
  assert.match(prompt, /覆盖申请与审核/);
  assert.deepEqual(outlineTools.outlineNumbers(outline), ["1", "1.1", "1.1.1"]);
});

test("outline editing inserts child titles in place and moves complete same-level blocks", async () => {
  await ready;
  const outline = [
    { id: "root-a", title: "建设内容", level: 1 as const },
    { id: "child-a", title: "登记服务", level: 2 as const },
    { id: "detail-a", title: "登记申请", level: 3 as const },
    { id: "root-b", title: "实施保障", level: 1 as const },
  ];
  const withChild = outlineTools.insertOutlineChild(outline, 0, { id: "child-b", title: "审核服务", level: 1 });
  assert.deepEqual(withChild.map((item) => [item.id, item.level]), [["root-a", 1], ["child-a", 2], ["detail-a", 3], ["child-b", 2], ["root-b", 1]]);
  const withDetail = outlineTools.insertOutlineChild(withChild, 3, { id: "detail-b", title: "审核处理", level: 1 });
  assert.deepEqual(withDetail.map((item) => [item.id, item.level]), [["root-a", 1], ["child-a", 2], ["detail-a", 3], ["child-b", 2], ["detail-b", 3], ["root-b", 1]]);
  const withSibling = outlineTools.insertOutlineSibling(withDetail, 3, { id: "child-c", title: "结果查询", level: 1 });
  assert.deepEqual(withSibling.map((item) => [item.id, item.level]), [["root-a", 1], ["child-a", 2], ["detail-a", 3], ["child-b", 2], ["detail-b", 3], ["child-c", 2], ["root-b", 1]]);
  const moved = outlineTools.moveOutlineBlockTo(withSibling, 0, 6, "after");
  assert.deepEqual(moved.map((item) => item.id), ["root-b", "root-a", "child-a", "detail-a", "child-b", "detail-b", "child-c"]);
  assert.deepEqual(outlineTools.moveOutlineBlockTo(withSibling, 3, 0, "before"), withSibling, "dragging across levels must not change the hierarchy");
});

test("generated Markdown heading markers are removed before saving", async () => {
  await ready;
  assert.equal(content.normalizeGeneratedContent("## 登记申请服务\n正文\n### 审核流程\n内容"), "登记申请服务\n正文\n审核流程\n内容");
  assert.equal(content.normalizeGeneratedContent("普通 # 文本\n#\n结尾"), "普通 # 文本\n结尾");
});

test("editor metrics count selected text and flag long paragraphs without changing content", async () => {
  await ready;
  assert.equal(content.countTextChars("登记 申请\n服务"), 6);
  assert.deepEqual(content.getParagraphMetrics("第一段\n\n第二段内容", 3), [
    { index: 1, chars: 3, isLong: false },
    { index: 2, chars: 5, isLong: true },
  ]);
});

test("material chunks are stored and listed by project", async () => {
  await ready;
  const project = await data.saveProject({ name: "材料项目", org: "测试单位", level: "省级", region: "", budget: "100万以下", domain: "数字政府", desc: "材料验证", edge: "" });
  const text = "政务数据共享建设内容。".repeat(100);
  const chunks = rag.chunkText(text);
  await rag.addDocument({ id: "doc-test", projectId: project.id, name: "政策.txt", type: "policy", size: text.length, uploadedAt: new Date().toISOString(), chunkCount: chunks.length, summary: "政策材料" }, text);
  const documents = await data.listDocuments(project.id);
  assert.equal(documents.length, 1);
  assert.ok(documents[0].chunkCount > 1);
});

test("deleting a project cascades its chapters and materials without affecting other projects", async () => {
  await ready;
  const input = { org: "测试单位", level: "省级", region: "", budget: "100万以下", domain: "数据治理", desc: "验证项目删除", edge: "" };
  const projectA = await data.saveProject({ ...input, name: "待删除项目" });
  const projectB = await data.saveProject({ ...input, name: "保留项目" });
  await data.saveOutline(projectA.id, [{ id: "custom-a", title: "删除范围", level: 1 }]);
  await data.saveChapter(projectA.id, "custom-a", "待删除项目的章节正文。", ["待删除材料.txt"]);
  await rag.addDocument({ id: "delete-doc", projectId: projectA.id, name: "待删除材料.txt", type: "policy", size: 10, uploadedAt: new Date().toISOString(), chunkCount: 1, summary: "待删除" }, "待删除项目的材料文本。");
  await data.saveChapter(projectB.id, "bg", "保留项目的章节正文。", ["保留材料.txt"]);
  await rag.addDocument({ id: "keep-doc", projectId: projectB.id, name: "保留材料.txt", type: "policy", size: 10, uploadedAt: new Date().toISOString(), chunkCount: 1, summary: "保留" }, "保留项目的材料文本。");

  const remaining = await data.deleteProject(projectA.id);
  assert.ok(!remaining.some((project) => project.id === projectA.id));
  assert.equal(await data.getProject(projectA.id), null);
  assert.deepEqual(await data.listChapters(projectA.id), {});
  assert.deepEqual(await data.listDocuments(projectA.id), []);
  assert.deepEqual(await data.listChunks(projectA.id), []);
  assert.equal((await data.getProject(projectB.id))?.name, "保留项目");
  assert.equal((await data.listChapters(projectB.id)).bg.content, "保留项目的章节正文。");
  assert.equal((await data.listDocuments(projectB.id))[0].id, "keep-doc");
  const persisted = JSON.parse(await readFile(path.join(testDir, "bid-writer.json"), "utf8"));
  assert.ok(!persisted.projects.some((project: { id: string }) => project.id === projectA.id));
  assert.ok(!persisted.documents.some((document: { projectId: string }) => document.projectId === projectA.id));
  assert.ok(!persisted.chunks.some((chunk: { projectId: string }) => chunk.projectId === projectA.id));
  assert.equal(Object.hasOwn(persisted.chapters, projectA.id), false);

  const finalProjects = await data.deleteProject(projectB.id);
  assert.ok(!finalProjects.some((project) => project.id === projectB.id));
  assert.equal(getNextProjectAfterDeletion([]), null, "deleting the last project selects no project and enters the empty workspace state");
});

test("BM25 ranks a highly relevant policy material ahead of unrelated material", async () => {
  await ready;
  const project = await data.saveProject({ name: "BM25排序项目", org: "测试单位", level: "省级", region: "", budget: "100万以下", domain: "数据治理", desc: "材料验证", edge: "" });
  await rag.addDocument({ id: "policy-relevant", projectId: project.id, name: "高质量数据集政策.txt", type: "policy", size: 30, uploadedAt: new Date().toISOString(), chunkCount: 1, summary: "" }, "高质量数据集建设需要建立数据标注规范和质量评估机制。");
  await rag.addDocument({ id: "case-unrelated", projectId: project.id, name: "园区绿化案例.txt", type: "case", size: 30, uploadedAt: new Date().toISOString(), chunkCount: 1, summary: "" }, "园区绿化工程重点配置乔木灌木和景观步道。");
  const results = await rag.retrieve(project.id, "高质量数据集建设", 5);
  assert.equal(results[0].docName, "高质量数据集政策.txt");
  assert.ok(results.every((result) => result.docName !== "园区绿化案例.txt"));
});

test("BM25 gives a rare query term enough weight to rank its material first", async () => {
  await ready;
  const project = await data.saveProject({ name: "BM25稀有词项目", org: "测试单位", level: "省级", region: "", budget: "100万以下", domain: "数据治理", desc: "材料验证", edge: "" });
  await rag.addDocument({ id: "common-data", projectId: project.id, name: "通用数据治理.txt", type: "other", size: 30, uploadedAt: new Date().toISOString(), chunkCount: 1, summary: "" }, "数据治理平台建设应建立统一的数据目录和质量规则。数据治理平台服务多个业务部门。");
  await rag.addDocument({ id: "rare-code", projectId: project.id, name: "XJ-42专项方案.txt", type: "policy", size: 30, uploadedAt: new Date().toISOString(), chunkCount: 1, summary: "" }, "XJ-42专项数据治理方案用于设备运维数据质量核查。");
  const results = await rag.retrieve(project.id, "数据治理 XJ-42", 5);
  assert.equal(results[0].docName, "XJ-42专项方案.txt");
});

test("BM25 does not return chunks when no query term matches", async () => {
  await ready;
  const project = await data.saveProject({ name: "BM25零命中项目", org: "测试单位", level: "省级", region: "", budget: "100万以下", domain: "数据治理", desc: "材料验证", edge: "" });
  await rag.addDocument({ id: "no-match", projectId: project.id, name: "绿化材料.txt", type: "other", size: 30, uploadedAt: new Date().toISOString(), chunkCount: 1, summary: "" }, "城市公园绿化应配置乔木灌木和景观照明。");
  assert.deepEqual(await rag.retrieve(project.id, "工业设备预测维护", 5), []);
});

test("BM25 keeps projects isolated and preserves the source file name", async () => {
  await ready;
  const projectA = await data.saveProject({ name: "BM25隔离项目A", org: "测试单位", level: "省级", region: "", budget: "100万以下", domain: "数据治理", desc: "材料验证", edge: "" });
  const projectB = await data.saveProject({ name: "BM25隔离项目B", org: "测试单位", level: "省级", region: "", budget: "100万以下", domain: "数据治理", desc: "材料验证", edge: "" });
  await rag.addDocument({ id: "project-a-doc", projectId: projectA.id, name: "甲方设备数据政策.txt", type: "policy", size: 30, uploadedAt: new Date().toISOString(), chunkCount: 1, summary: "" }, "设备数据治理需要统一目录和质量规则。");
  await rag.addDocument({ id: "project-b-doc", projectId: projectB.id, name: "乙方设备数据政策.txt", type: "policy", size: 30, uploadedAt: new Date().toISOString(), chunkCount: 1, summary: "" }, "设备数据治理需要统一目录和质量规则，乙方内容更长。");
  const results = await rag.retrieve(projectA.id, "设备数据治理", 5);
  assert.deepEqual(results.map((result) => result.projectId), [projectA.id]);
  assert.equal(results[0].docName, "甲方设备数据政策.txt");
});

test("Polishing prompt retains the existing chapter and prohibits fabricated facts", async () => {
  await ready;
  const project = await data.saveProject({ name: "润色项目", org: "测试单位", level: "省级", region: "", budget: "100万以下", domain: "数字政府", desc: "建设数据平台", edge: "" });
  const prompt = chapterPrompts.buildPolishPrompt(project, "bg", "一、建设背景\n已有事实内容。", "语言更精炼");
  assert.match(prompt, /已有事实内容/);
  assert.match(prompt, /不得杜撰政策、数据、案例、成果或来源/);
  assert.match(prompt, /语言更精炼/);
});

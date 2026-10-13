"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { countTextChars, getParagraphMetrics, normalizeGeneratedContent } from "@/lib/content";
import { DEFAULT_OUTLINE, insertOutlineChild, insertOutlineSibling, moveOutlineBlock, moveOutlineBlockTo, outlineBlockEnd, outlineNumbers } from "@/lib/outline";
import { isUploadFileSizeAllowed, MAX_UPLOAD_FILE_SIZE_LABEL } from "@/lib/upload-limits";
import { processFilesIndependently } from "@/lib/upload-batch";
import { getDocxExportFailureMessage } from "@/lib/export-errors";
import { CHINESE_FONT_OPTIONS, getDefaultExportStyle, LINE_SPACING_OPTIONS, lineSpacingSummary, normalizeExportStyle, PARAGRAPH_SPACING_OPTIONS, paragraphSpacingSummary, WESTERN_FONT_OPTIONS, WORD_FONT_SIZES, wordFontSizeLabel } from "@/lib/export-style";
import { EMPTY_PROJECT_INPUT } from "@/lib/project-defaults";
import type { ExportStyle, OutlineItem, WritingType } from "@/lib/types";
import { getWritingType, WRITING_TYPES } from "@/lib/writing-types";
import { getWritingGuidance } from "@/lib/writing-guidance";
import { getNextProjectAfterDeletion } from "@/lib/project-lifecycle";
import { hasUnsavedSectionDraft, isSameSectionLocation, needsGenerationReplacementConfirmation, type SectionLocation } from "@/lib/workspace-state";

const COLORS = { ink: "#16120e", muted: "#746e66", border: "#e8e4de", canvas: "#f5f3f0", paper: "#faf8f5", red: "#b5271a", green: "#1e6641", blue: "#1b3d6e", gold: "#c8922a" };
const TYPES = [["policy", "政策文件"], ["template", "申报模板"], ["case", "案例参考"], ["other", "其他材料"]] as const;
const DEFAULT_WORD_TARGET = 1500;
type ProjectForm = { name: string; org: string; level: string; region: string; budget: string; domain: string; desc: string; edge: string };
type Project = ProjectForm & { id: string; outline?: OutlineItem[]; exportStyle?: ExportStyle };
type Chapter = { chapterId: string; content: string; wc: number; ragSources: string[]; updatedAt: string };
type KBDoc = { id: string; name: string; type: string; size: number; uploadedAt: string; chunkCount: number; summary: string };
type View = "workspace" | "kb" | "export";
type GenerationMode = "draft" | "polish";
type GenerationContext = SectionLocation & { initialContent: string; initialSources: string[] };
type SaveChapterInput = SectionLocation & { content: string; ragSources: string[] };
const emptyProject = EMPTY_PROJECT_INPUT;
const fieldStyle: CSSProperties = { width: "100%", padding: "8px 10px", border: `1px solid ${COLORS.border}`, borderRadius: 4, background: "#fff", font: "inherit", fontSize: 13 };

function Button({ children, onClick, disabled, kind = "plain" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; kind?: "plain" | "primary" | "danger" }) {
  const shades = kind === "primary" ? { background: COLORS.ink, color: "#fff", border: "none" } : kind === "danger" ? { background: COLORS.red, color: "#fff", border: "none" } : { background: "#fff", color: COLORS.ink, border: `1px solid ${COLORS.border}` };
  return <button disabled={disabled} onClick={onClick} style={{ ...shades, padding: "7px 12px", borderRadius: 4, font: "inherit", fontSize: 12, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? .5 : 1 }}>{children}</button>;
}

function ProjectModal({ project, onClose, onSave, onDelete }: { project: Project | null; onClose: () => void; onSave: (value: ProjectForm) => Promise<void>; onDelete?: () => Promise<boolean> }) {
  const [form, setForm] = useState<ProjectForm>(project ? { name: project.name, org: project.org, level: project.level, region: project.region, budget: project.budget, domain: project.domain, desc: project.desc, edge: project.edge } : emptyProject);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const set = (key: keyof typeof form, value: string) => setForm((last) => ({ ...last, [key]: value }));
  const submit = async () => { setSaving(true); try { await onSave(form); } finally { setSaving(false); } };
  const remove = async () => { if (!onDelete) return; setDeleting(true); try { const deleted = await onDelete(); if (!deleted) setConfirmingDelete(false); } finally { setDeleting(false); } };
  return <div style={overlay}><div style={modal}>
    <h2 style={{ fontFamily: "serif", marginBottom: 18 }}>{project ? "编辑项目" : "创建项目"}</h2>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <Field label="项目名称 *"><input value={form.name} onChange={(e) => set("name", e.target.value)} style={fieldStyle} /></Field>
      <Field label="申报主体（可选）"><input value={form.org} onChange={(e) => set("org", e.target.value)} style={fieldStyle} /></Field>
      <Field label="申报级别（可选）"><select value={form.level} onChange={(e) => set("level", e.target.value)} style={fieldStyle}><option value="">请选择申报级别（可选）</option>{["国家级", "省级", "市级", "区县级"].map((x) => <option key={x}>{x}</option>)}</select></Field>
      <Field label="所在地区"><input value={form.region} onChange={(e) => set("region", e.target.value)} placeholder="如：广东省广州市" style={fieldStyle} /></Field>
      <Field label="预算 / 投资规模（可选）"><input value={form.budget} onChange={(e) => set("budget", e.target.value)} placeholder="请输入已确认的项目预算（可选）" style={fieldStyle} /></Field>
      <Field label="建设领域（可选）"><input value={form.domain} onChange={(e) => set("domain", e.target.value)} placeholder="请选择或填写建设领域（可选）" style={fieldStyle} /></Field>
    </div>
    <Field label="建设内容（可选）"><textarea value={form.desc} onChange={(e) => set("desc", e.target.value)} style={{ ...fieldStyle, minHeight: 86, resize: "vertical" }} /></Field>
    <Field label="项目优势"><textarea value={form.edge} onChange={(e) => set("edge", e.target.value)} style={{ ...fieldStyle, minHeight: 58, resize: "vertical" }} /></Field>
    {project && <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: 20, paddingTop: 16 }}><strong style={{ display: "block", color: COLORS.red, fontSize: 13, marginBottom: 6 }}>危险操作</strong>{confirmingDelete ? <div style={{ background: "#fff4f2", border: "1px solid #f0c5c0", borderRadius: 4, padding: 12 }}><strong style={{ display: "block", fontSize: 13, marginBottom: 6 }}>确认删除“{project.name}”？</strong><p style={{ ...muted, marginBottom: 10 }}>删除后，该项目的目录、章节正文、项目资料及相关本地数据将一并删除，且无法恢复。已经下载到本地的 Word 文件不会受到影响。</p><div style={{ display: "flex", gap: 8 }}><Button disabled={deleting} onClick={() => setConfirmingDelete(false)}>取消</Button><Button kind="danger" disabled={deleting} onClick={remove}>{deleting ? "删除中…" : "确认删除"}</Button></div></div> : <Button kind="danger" disabled={saving} onClick={() => setConfirmingDelete(true)}>删除当前项目</Button>}</div>}
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}><Button disabled={saving || deleting} onClick={onClose}>取消</Button><Button kind="primary" disabled={saving || deleting} onClick={submit}>{saving ? "保存中…" : "保存项目"}</Button></div>
  </div></div>;
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <label style={{ display: "block", marginBottom: 12, fontSize: 12, color: COLORS.muted }}><span style={{ display: "block", marginBottom: 5 }}>{label}</span>{children}</label>; }

function OutlineModal({ outline, onClose, onSave }: { outline: OutlineItem[]; onClose: () => void; onSave: (items: OutlineItem[]) => Promise<void> }) {
  const [items, setItems] = useState<OutlineItem[]>(outline.map((item) => ({ ...item, writingType: getWritingType(item) })));
  const numbers = outlineNumbers(items);
  const [saving, setSaving] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const change = (index: number, update: Partial<OutlineItem>) => setItems((last) => last.map((item, itemIndex) => itemIndex === index ? { ...item, ...update } : item));
  const move = (index: number, offset: -1 | 1) => setItems((last) => moveOutlineBlock(last, index, offset));
  const shiftLevel = (index: number, offset: -1 | 1) => setItems((last) => { const end = outlineBlockEnd(last, index); const block = last.slice(index, end); if (block.some((item) => item.level + offset < 1 || item.level + offset > 4)) return last; return [...last.slice(0, index), ...block.map((item) => ({ ...item, level: (item.level + offset) as 1 | 2 | 3 | 4 })), ...last.slice(end)]; });
  const remove = (index: number) => setItems((last) => { const end = outlineBlockEnd(last, index); const next = [...last.slice(0, index), ...last.slice(end)]; return next.length ? next : last; });
  const newItem = (level: 1 | 2 | 3 | 4): OutlineItem => ({ id: `outline-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title: "新标题", level, writingType: "function_description" });
  const add = () => setItems((last) => [...last, newItem(1)]);
  const addSibling = (index: number) => setItems((last) => last.length >= 200 ? last : insertOutlineSibling(last, index, newItem(last[index].level)));
  const addChild = (index: number) => setItems((last) => last.length >= 200 || last[index].level >= 4 ? last : insertOutlineChild(last, index, newItem((last[index].level + 1) as 1 | 2 | 3 | 4)));
  const canDropOn = (targetIndex: number) => {
    const sourceIndex = items.findIndex((item) => item.id === draggedId);
    if (sourceIndex < 0 || sourceIndex === targetIndex || items[sourceIndex].level !== items[targetIndex].level) return false;
    const sourceEnd = outlineBlockEnd(items, sourceIndex);
    return targetIndex < sourceIndex || targetIndex >= sourceEnd;
  };
  const drop = (targetIndex: number, clientY: number, target: HTMLElement) => {
    if (!canDropOn(targetIndex)) return;
    const sourceIndex = items.findIndex((item) => item.id === draggedId);
    const position = clientY < target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2 ? "before" : "after";
    setItems((last) => moveOutlineBlockTo(last, sourceIndex, targetIndex, position));
    setDraggedId(null);
    setDragOverIndex(null);
  };
  const submit = async () => { setSaving(true); try { await onSave(items); } finally { setSaving(false); } };
  return <div style={overlay}><div style={{ ...modal, width: 820 }}><h2 style={{ fontFamily: "serif", marginBottom: 8 }}>编辑项目目录</h2><p style={{ ...muted, marginBottom: 8 }}>支持最多四级目录：一级为 1，二级为 1.1，三级为 1.1.1，四级为 1.1.1.1。点击“新增子级”即可添加下一级标题；父标题移动、调整层级或删除时会连同子标题一起处理。</p>
    <p style={{ ...muted, marginBottom: 12 }}>可拖动“⋮⋮”把手重排同级标题及其子标题；上移、下移保留为键盘和精细调整的备选。新增标题默认使用“功能描述”，原默认章节仍沿用既有章节策略。</p>
    <div style={{ display: "grid", gap: 10 }}>{items.map((item, index) => <div key={item.id} onDragOver={(event) => { if (canDropOn(index)) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverIndex(index); } }} onDrop={(event) => { event.preventDefault(); drop(index, event.clientY, event.currentTarget); }} style={{ display: "grid", gridTemplateColumns: "28px 48px minmax(0, 1fr)", gap: 7, alignItems: "start", marginLeft: (item.level - 1) * 26, padding: "3px 0 10px", borderTop: dragOverIndex === index && canDropOn(index) ? `2px solid ${COLORS.blue}` : "2px solid transparent", borderBottom: `1px solid ${COLORS.border}` }}>
      <button aria-label={`拖动 ${numbers[index]} ${item.title}`} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.id); setDraggedId(item.id); }} onDragEnd={() => { setDraggedId(null); setDragOverIndex(null); }} style={{ cursor: "grab", border: 0, background: "transparent", color: COLORS.muted, fontSize: 16, padding: "4px 0" }}>⋮⋮</button><span style={{ color: COLORS.muted, fontSize: 12, paddingTop: 7 }}><b style={{ color: COLORS.ink }}>{numbers[index]}</b><br />第{item.level}级</span>
      <div style={{ minWidth: 0, display: "grid", gap: 7 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, alignItems: "center" }}><input aria-label={`${numbers[index]} 目录标题`} value={item.title} onChange={(event) => change(index, { title: event.target.value })} style={{ ...fieldStyle, flex: "1 1 200px", minWidth: 0, width: "auto" }} /><label style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", maxWidth: "100%", fontSize: 12, color: COLORS.muted }}>写作类型<select aria-label={`${numbers[index]} ${item.title}的写作类型`} value={getWritingType(item)} onChange={(event) => change(index, { writingType: event.target.value as WritingType })} style={{ ...fieldStyle, width: 120, maxWidth: "100%" }}>{Object.entries(WRITING_TYPES).map(([value, type]) => <option key={value} value={value}>{type.label}</option>)}</select></label></div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}><Button disabled={items.length >= 200} onClick={() => addSibling(index)}>+ 同级</Button><Button disabled={items.length >= 200 || item.level >= 4} onClick={() => addChild(index)}>+ 子级</Button><Button disabled={item.level === 1} onClick={() => shiftLevel(index, -1)}>升一级</Button><Button disabled={index === 0 || item.level >= 4 || item.level > items[index - 1].level} onClick={() => shiftLevel(index, 1)}>降一级</Button><Button disabled={index === 0} onClick={() => move(index, -1)}>上移</Button><Button disabled={index === items.length - 1} onClick={() => move(index, 1)}>下移</Button><Button kind="danger" disabled={items.length === 1} onClick={() => remove(index)}>删除</Button></div>
      </div>
    </div>)}</div>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 18 }}><Button disabled={items.length >= 200} onClick={add}>+ 新增一级标题</Button><div style={{ display: "flex", gap: 8 }}><Button onClick={onClose}>取消</Button><Button kind="primary" disabled={saving || items.some((item) => !item.title.trim())} onClick={submit}>{saving ? "保存中…" : "保存目录"}</Button></div></div>
  </div></div>;
}

function KnowledgeBase({ project, onCount, toast }: { project: Project | null; onCount: (count: number) => void; toast: (text: string, isError?: boolean) => void }) {
  const [docs, setDocs] = useState<KBDoc[]>([]); const [type, setType] = useState("policy"); const [busy, setBusy] = useState(false); const [uploadResult, setUploadResult] = useState<{ succeeded: number; failed: { name: string; reason: string }[] } | null>(null); const fileRef = useRef<HTMLInputElement>(null);
  const refresh = useCallback(async () => { if (!project) { setDocs([]); return; } const response = await fetch(`/api/kb?projectId=${project.id}`); const body = await response.json(); setDocs(body.docs || []); onCount((body.docs || []).length); }, [project, onCount]);
  useEffect(() => { refresh().catch(() => toast("加载材料列表失败", true)); }, [refresh, toast]);
  const upload = async (files: FileList | null) => { if (!files || !project) return; setBusy(true); setUploadResult(null); try { const result = await processFilesIndependently(Array.from(files), async (file) => { if (!isUploadFileSizeAllowed(file.size)) throw new Error(`单个文件超过 ${MAX_UPLOAD_FILE_SIZE_LABEL} 限制，请压缩或拆分后重试。`); const form = new FormData(); form.append("file", file); form.append("type", type); form.append("projectId", project.id); const response = await fetch("/api/upload", { method: "POST", body: form }); let body: { error?: string } = {}; try { body = await response.json(); } catch { /* A network proxy may return a non-JSON error page. */ } if (!response.ok) throw new Error(body.error || "上传处理失败，请稍后重试。"); }); setUploadResult({ succeeded: result.succeeded.length, failed: result.failed.map(({ file, reason }) => ({ name: file.name, reason })) }); if (result.succeeded.length) { await refresh(); toast(`已保存 ${result.succeeded.length} 份项目资料`); } } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; } };
  const remove = async (doc: KBDoc) => { if (!project || !confirm(`删除「${doc.name}」？`)) return; const response = await fetch("/api/kb/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: project.id, docId: doc.id }) }); if (response.ok) { await refresh(); toast("项目资料已删除"); } else toast("删除失败", true); };
  if (!project) return <Empty title="先创建项目" text="项目资料会按项目隔离保存。创建项目后即可上传 PDF、DOCX、TXT 或 Markdown 文件。" />;
  return <section style={panel}><h1>项目资料</h1><p style={muted}>上传政策文件、申报模板、案例或其他与项目相关的资料；生成正文时可选择参考这些资料。</p>
    <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "18px 0" }}><select value={type} onChange={(e) => setType(e.target.value)} style={{ ...fieldStyle, width: 130 }}>{TYPES.map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select><Button onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? "处理中…" : "上传资料"}</Button><input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md,text/plain,text/markdown,application/pdf" multiple hidden onChange={(e) => upload(e.target.files)} /><span style={muted}>单个文件最大 {MAX_UPLOAD_FILE_SIZE_LABEL}</span></div>
    {uploadResult && <div style={{ marginBottom: 14, fontSize: 12, lineHeight: 1.6 }}>{uploadResult.succeeded > 0 && <div style={{ color: COLORS.green }}>已成功上传 {uploadResult.succeeded} 份项目资料。</div>}{uploadResult.failed.length > 0 && <div style={{ color: COLORS.red }}>以下资料上传失败：{uploadResult.failed.map((item) => <div key={item.name}>- {item.name}：{item.reason}</div>)}</div>}</div>}
    <div style={card}>{docs.length ? docs.map((doc) => <div key={doc.id} style={{ padding: 14, borderBottom: `1px solid ${COLORS.canvas}`, display: "flex", gap: 12 }}><span>📄</span><div style={{ flex: 1 }}><strong style={{ fontSize: 13 }}>{doc.name}</strong><div style={muted}>{TYPES.find(([id]) => id === doc.type)?.[1]} · {Math.max(1, Math.round(doc.size / 1024))}KB · {doc.chunkCount} 个片段</div><div style={{ fontSize: 12, color: COLORS.muted, marginTop: 5 }}>{doc.summary}</div></div><Button onClick={() => remove(doc)}>删除</Button></div>) : <Empty title="暂无项目资料" text="上传后生成章节时可选择参考相关资料。" />}</div>
  </section>;
}

const compactField: CSSProperties = { ...fieldStyle, padding: "6px 8px", fontSize: 12, minHeight: 32 };
const styleGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 };

function ExportField({ label, children }: { label: string; children: ReactNode }) { return <label style={{ display: "grid", gap: 3, fontSize: 11, color: COLORS.muted }}><span>{label}</span>{children}</label>; }
function ExportNumberField({ label, value, onChange, step = 1, suffix }: { label: string; value: number; onChange: (value: number) => void; step?: number; suffix?: string }) {
  return <ExportField label={label}><div style={{ display: "flex", alignItems: "center", gap: 4 }}><input type="number" min={0} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} style={compactField} /><span style={{ fontSize: 11, color: COLORS.muted }}>{suffix}</span></div></ExportField>;
}

function ExportTextStyleFields({ style, body, onChange }: { style: ExportStyle["body"] | ExportStyle["heading1"]; body?: boolean; onChange: (next: ExportStyle["body"] | ExportStyle["heading1"]) => void }) {
  const update = (key: string, value: unknown) => onChange({ ...style, [key]: value } as ExportStyle["body"] | ExportStyle["heading1"]);
  const linePreset = LINE_SPACING_OPTIONS.find((item) => item.mode === style.lineSpacing.mode && item.value === style.lineSpacing.value);
  const spacingSelect = (key: "spaceBefore" | "spaceAfter", label: string) => <ExportField label={label}><select value={style[key].unit === "line" && PARAGRAPH_SPACING_OPTIONS.includes(style[key].value as 0 | 0.5 | 1 | 1.5 | 2) ? String(style[key].value) : "custom"} onChange={(event) => update(key, event.target.value === "custom" ? { unit: "pt", value: 0 } : { unit: "line", value: Number(event.target.value) })} style={compactField}>{PARAGRAPH_SPACING_OPTIONS.map((value) => <option key={value} value={value}>{value} 行</option>)}<option value="custom">自定义（磅）</option></select>{style[key].unit === "pt" && <input type="number" min={0} step={0.5} value={style[key].value} onChange={(event) => update(key, { unit: "pt", value: Number(event.target.value) })} style={{ ...compactField, marginTop: 4 }} aria-label={`${label} 自定义磅`} />}</ExportField>;
  return <div style={styleGrid}>
    <ExportField label="中文字体"><select value={style.chineseFont} onChange={(event) => update("chineseFont", event.target.value)} style={compactField}>{CHINESE_FONT_OPTIONS.map((font) => <option key={font}>{font}</option>)}{!CHINESE_FONT_OPTIONS.includes(style.chineseFont) && <option value={style.chineseFont}>自定义：{style.chineseFont}</option>}</select></ExportField>
    <ExportField label="英文字体"><select value={style.westernFont} onChange={(event) => update("westernFont", event.target.value)} style={compactField}>{WESTERN_FONT_OPTIONS.map((font) => <option key={font}>{font}</option>)}{!WESTERN_FONT_OPTIONS.includes(style.westernFont) && <option value={style.westernFont}>自定义：{style.westernFont}</option>}</select></ExportField>
    <ExportField label="中文字号"><select value={WORD_FONT_SIZES.some((item) => item.pt === style.fontSizePt) ? String(style.fontSizePt) : "custom"} onChange={(event) => update("fontSizePt", event.target.value === "custom" ? 12 : Number(event.target.value))} style={compactField}>{WORD_FONT_SIZES.map((item) => <option key={item.label} value={item.pt}>{item.label}</option>)}<option value="custom">自定义字号</option></select></ExportField>
    <ExportField label="字形"><label style={{ display: "flex", alignItems: "center", height: 32, gap: 5, color: COLORS.ink }}><input type="checkbox" checked={style.bold} onChange={(event) => update("bold", event.target.checked)} />加粗</label></ExportField>
    <ExportField label="对齐方式"><select value={style.alignment} onChange={(event) => update("alignment", event.target.value)} style={compactField}><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option><option value="both">两端对齐</option></select></ExportField>
    <ExportField label="行距"><select value={linePreset ? `${linePreset.mode}:${linePreset.value}` : style.lineSpacing.mode === "fixed" ? "fixed-custom" : "multiple-custom"} onChange={(event) => { if (event.target.value === "multiple-custom") update("lineSpacing", { mode: "multiple", value: 1.25 }); else if (event.target.value === "fixed-custom") update("lineSpacing", { mode: "fixed", value: 24 }); else { const [mode, value] = event.target.value.split(":"); update("lineSpacing", { mode, value: Number(value) }); } }} style={compactField}>{LINE_SPACING_OPTIONS.map((item) => <option key={`${item.mode}:${item.value}`} value={`${item.mode}:${item.value}`}>{item.label}</option>)}<option value="multiple-custom">自定义多倍行距</option><option value="fixed-custom">固定值（自定义磅）</option></select>{!linePreset && <input type="number" min={style.lineSpacing.mode === "fixed" ? 10 : 1.05} max={style.lineSpacing.mode === "fixed" ? 72 : 3} step={style.lineSpacing.mode === "fixed" ? 1 : 0.05} value={style.lineSpacing.value} onChange={(event) => update("lineSpacing", { ...style.lineSpacing, value: Number(event.target.value) })} style={{ ...compactField, marginTop: 4 }} aria-label="自定义行距" />}</ExportField>
    {spacingSelect("spaceBefore", "段前")}{spacingSelect("spaceAfter", "段后")}
    {body && <ExportField label="首行缩进"><select value={(style as ExportStyle["body"]).firstLineIndentChars === 0 ? "0" : (style as ExportStyle["body"]).firstLineIndentChars === 2 ? "2" : "custom"} onChange={(event) => update("firstLineIndentChars", event.target.value === "custom" ? 1 : Number(event.target.value))} style={compactField}><option value="0">无缩进</option><option value="2">首行缩进 2 字符</option><option value="custom">自定义字符数</option></select>{![0, 2].includes((style as ExportStyle["body"]).firstLineIndentChars) && <input type="number" min={0} max={4} step={0.5} value={(style as ExportStyle["body"]).firstLineIndentChars} onChange={(event) => update("firstLineIndentChars", Number(event.target.value))} style={{ ...compactField, marginTop: 4 }} aria-label="自定义首行缩进字符数" />}</ExportField>}
  </div>;
}

function StyleAccordion({ title, summary, open, onToggle, children }: { title: string; summary: string; open: boolean; onToggle: () => void; children: ReactNode }) { return <div style={{ borderTop: `1px solid ${COLORS.border}` }}><button type="button" onClick={onToggle} style={{ width: "100%", padding: "10px 0", display: "flex", alignItems: "center", gap: 10, border: 0, background: "transparent", textAlign: "left", cursor: "pointer", font: "inherit" }}><strong style={{ fontSize: 13 }}>{title}</strong><span style={{ ...muted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{summary}</span><span style={{ color: COLORS.muted }}>{open ? "收起" : "展开"}</span></button>{open && <div style={{ padding: "0 0 12px" }}>{children}</div>}</div>; }

function ExportStyleEditor({ style, onChange }: { style: ExportStyle; onChange: (style: ExportStyle) => void }) {
  const [open, setOpen] = useState<string | null>("body");
  const updatePage = (key: keyof ExportStyle["page"], valueCm: number) => onChange({ ...style, page: { ...style.page, [key]: valueCm * 10 } });
  const pageSummary = `A4 · 上下 ${(style.page.topMm / 10).toFixed(2)} cm · 左右 ${(style.page.leftMm / 10).toFixed(2)} cm`;
  const summary = (item: ExportStyle["body"] | ExportStyle["heading1"], body = false) => `${item.chineseFont} / ${item.westernFont} · ${wordFontSizeLabel(item.fontSizePt)} · ${lineSpacingSummary(item.lineSpacing)} · ${paragraphSpacingSummary(item.spaceBefore, "段前")}${body ? ` · 首行 ${(item as ExportStyle["body"]).firstLineIndentChars} 字符` : ""}`;
  const group = (key: "body" | "heading1" | "heading2" | "heading3" | "heading4", title: string, body = false) => <StyleAccordion title={title} summary={summary(style[key], body)} open={open === key} onToggle={() => setOpen(open === key ? null : key)}><ExportTextStyleFields style={style[key]} body={body} onChange={(next) => onChange({ ...style, [key]: next as never })} /></StyleAccordion>;
  return <div style={{ marginTop: 10 }}>
    <StyleAccordion title="页面设置" summary={pageSummary} open={open === "page"} onToggle={() => setOpen(open === "page" ? null : "page")}><div style={styleGrid}><ExportNumberField label="上边距" suffix="cm" value={style.page.topMm / 10} onChange={(value) => updatePage("topMm", value)} step={0.01} /><ExportNumberField label="下边距" suffix="cm" value={style.page.bottomMm / 10} onChange={(value) => updatePage("bottomMm", value)} step={0.01} /><ExportNumberField label="左边距" suffix="cm" value={style.page.leftMm / 10} onChange={(value) => updatePage("leftMm", value)} step={0.01} /><ExportNumberField label="右边距" suffix="cm" value={style.page.rightMm / 10} onChange={(value) => updatePage("rightMm", value)} step={0.01} /></div></StyleAccordion>
    {group("body", "正文", true)}{group("heading1", "一级标题")}{group("heading2", "二级标题")}{group("heading3", "三级标题")}{group("heading4", "四级标题")}
  </div>;
}

function ExportView({ project, outline, chapters, toast, onProjectStyleSaved }: { project: Project | null; outline: OutlineItem[]; chapters: Record<string, Chapter>; toast: (text: string, error?: boolean) => void; onProjectStyleSaved: (project: Project) => void }) {
  const done = outline.filter((item) => chapters[item.id]?.content.trim());
  const numbers = outlineNumbers(outline);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showStyle, setShowStyle] = useState(true);
  const [style, setStyle] = useState<ExportStyle>(() => normalizeExportStyle(project?.exportStyle || getDefaultExportStyle()));
  const [savingStyle, setSavingStyle] = useState(false);
  useEffect(() => { setStyle(normalizeExportStyle(project?.exportStyle || getDefaultExportStyle())); setShowStyle(true); }, [project?.id, project?.exportStyle]);
  const saveStyle = async () => {
    if (!project) return;
    setSavingStyle(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/export-style`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(style) });
      const body = await response.json();
      if (!response.ok) return toast(body.error || "导出样式保存失败，请重试。", true);
      const saved = body.project as Project;
      setStyle(normalizeExportStyle(saved.exportStyle));
      onProjectStyleSaved(saved);
      toast("导出样式已保存");
    } catch { toast("导出样式保存失败，请检查网络后重试。", true); } finally { setSavingStyle(false); }
  };
  const exportDocx = async () => { if (!project || !done.length) { const message = "请先保存至少一个章节后再导出。"; setExportError(message); return toast(message, true); } setExporting(true); setExportError(null); try { const response = await fetch(`/api/projects/${project.id}/export/docx`); if (!response.ok) { const message = getDocxExportFailureMessage(response.status); setExportError(message); return toast(message, true); } const blob = await response.blob(); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${project.name}_申报书草稿.docx`; link.click(); URL.revokeObjectURL(link.href); } catch { const message = getDocxExportFailureMessage(); setExportError(message); toast(message, true); } finally { setExporting(false); } };
  return <section style={panel}><h1>汇总预览与导出</h1><p style={muted}>完整目录会按当前顺序导出；已保存正文仅决定标题下是否附带正文。</p><div style={{ ...card, margin: "18px 0", padding: 16 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}><div><strong>导出样式</strong><div style={muted}>{project?.exportStyle ? "已保存自定义样式" : "政企申报默认样式"}</div></div><Button onClick={() => setShowStyle((last) => !last)}>{showStyle ? "收起" : "自定义样式"}</Button></div>{showStyle && <><ExportStyleEditor style={style} onChange={setStyle} /><div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><Button disabled={savingStyle} onClick={() => { setStyle(getDefaultExportStyle()); toast("已恢复默认样式，保存后会用于导出。"); }}>恢复默认样式</Button><Button kind="primary" disabled={savingStyle} onClick={saveStyle}>{savingStyle ? "保存中…" : "保存样式"}</Button></div></>}</div><div style={{ margin: "18px 0" }}><Button kind="primary" disabled={exporting} onClick={exportDocx}>{exporting ? "正在导出…" : "导出 Word（DOCX）"}</Button>{exportError && <div style={{ color: COLORS.red, fontSize: 12, marginTop: 8 }}>{exportError} <Button disabled={exporting} onClick={exportDocx}>重试导出</Button></div>}</div><div style={card}>{outline.map((item, index) => { const chapter = chapters[item.id]; const hasContent = Boolean(chapter?.content.trim()); return <div key={item.id} style={{ padding: 16, paddingLeft: 16 + (item.level - 1) * 24, borderBottom: `1px solid ${COLORS.canvas}` }}><strong>{numbers[index]} {item.title}</strong>{hasContent ? <><span style={{ color: COLORS.green, marginLeft: 8, fontSize: 12 }}>已保存 · {chapter!.wc} 字</span><p style={{ whiteSpace: "pre-wrap", lineHeight: 1.8, marginTop: 10, fontSize: 13 }}>{chapter!.content}</p></> : <p style={{ color: COLORS.muted, marginTop: 8, fontSize: 13 }}>未生成 / 无正文</p>}</div>; })}</div></section>;
}

function Empty({ title, text }: { title: string; text: string }) { return <div style={{ padding: 36, textAlign: "center", color: COLORS.muted }}><strong style={{ color: COLORS.ink, display: "block", marginBottom: 8 }}>{title}</strong>{text}</div>; }

export default function Page() {
  const [projects, setProjects] = useState<Project[]>([]); const [project, setProject] = useState<Project | null>(null); const [chapters, setChapters] = useState<Record<string, Chapter>>({}); const [selected, setSelected] = useState("bg"); const [view, setView] = useState<View>("workspace"); const [modal, setModal] = useState(false); const [outlineModal, setOutlineModal] = useState(false); const [wordTarget, setWordTarget] = useState(DEFAULT_WORD_TARGET); const [wordTargetInput, setWordTargetInput] = useState(String(DEFAULT_WORD_TARGET)); const [extra, setExtra] = useState(""); const [useRag, setUseRag] = useState(true); const [draft, setDraft] = useState(""); const [sources, setSources] = useState<string[]>([]); const [error, setError] = useState(""); const [generating, setGenerating] = useState(false); const [lastMode, setLastMode] = useState<GenerationMode>("draft"); const [kbCount, setKbCount] = useState(0); const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null); const [selectedChars, setSelectedChars] = useState(0); const abortRef = useRef<AbortController | null>(null); const generationRef = useRef<GenerationContext | null>(null); const generatingRef = useRef(false); const locationRef = useRef<SectionLocation>({ projectId: "", sectionId: "bg" });
  const outline = project?.outline?.length ? project.outline : DEFAULT_OUTLINE;
  const outlineLabels = outlineNumbers(outline);
  const toast = useCallback((text: string, error = false) => { setMessage({ text, error }); window.setTimeout(() => setMessage(null), 3800); }, []);
  const loadProjects = useCallback(async () => { const response = await fetch("/api/projects"); const body = await response.json(); const saved = body.projects || []; setProjects(saved); const stored = localStorage.getItem("bid-writer:active-project"); setProject(saved.find((item: Project) => item.id === stored) || saved[0] || null); }, []);
  useEffect(() => { loadProjects().catch(() => toast("加载项目失败", true)); }, [loadProjects, toast]);
  const loadChapters = useCallback(async () => { if (!project) { setChapters({}); return; } const response = await fetch(`/api/projects/${project.id}/chapters`); const body = await response.json(); setChapters(body.chapters || {}); }, [project]);
  useEffect(() => { loadChapters().catch(() => toast("加载章节失败", true)); setDraft(""); setSources([]); setError(""); }, [loadChapters, toast]);
  useEffect(() => { if (!project) { setKbCount(0); return; } let active = true; fetch(`/api/kb?projectId=${project.id}`).then((response) => response.json()).then((body) => { if (active) setKbCount((body.docs || []).length); }).catch(() => { if (active) setKbCount(0); }); return () => { active = false; }; }, [project?.id]);
  const current = chapters[selected];
  const hasUnsavedDraft = hasUnsavedSectionDraft(draft, current?.content);
  useEffect(() => { locationRef.current = { projectId: project?.id || "", sectionId: selected }; }, [project?.id, selected]);
  useEffect(() => { setDraft(current?.content || ""); setSources(current?.ragSources || []); setError(""); }, [selected, current?.content, current?.ragSources]);
  useEffect(() => { setWordTarget(DEFAULT_WORD_TARGET); setWordTargetInput(String(DEFAULT_WORD_TARGET)); setExtra(""); }, [selected, project?.id]);
  useEffect(() => { setSelectedChars(0); }, [selected, project?.id, draft]);
  const wordTargetValid = /^\d+$/.test(wordTargetInput) && Number(wordTargetInput) >= 100 && Number(wordTargetInput) <= 4000;
  const updateWordTarget = (value: string) => { setWordTargetInput(value); const next = Number(value); if (/^\d+$/.test(value) && next >= 100 && next <= 4000) setWordTarget(next); };
  const normalizeWordTarget = () => { if (!wordTargetValid) setWordTargetInput(String(wordTarget)); };
  const paragraphMetrics = getParagraphMetrics(draft);
  const longParagraphs = paragraphMetrics.filter((item) => item.isLong);
  const updateSelectionCount = (element: HTMLTextAreaElement) => setSelectedChars(countTextChars(element.value.slice(element.selectionStart, element.selectionEnd)));
  const isViewingContext = (context: SectionLocation) => isSameSectionLocation(locationRef.current, context);
  const confirmDiscardUnsavedDraft = () => !hasUnsavedDraft || window.confirm("当前章节有未保存修改。点击“确定”将放弃这些修改并继续；点击“取消”留在当前章节，可先保存后再切换。");
  const saveProject = async (value: ProjectForm) => { const response = await fetch(project ? `/api/projects/${project.id}` : "/api/projects", { method: project ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) }); const body = await response.json(); if (!response.ok) return toast(body.error || "项目保存失败", true); const saved = body.project as Project; await loadProjects(); setProject(saved); localStorage.setItem("bid-writer:active-project", saved.id); setModal(false); toast("项目已持久化保存"); };
  const saveProjectExportStyle = (saved: Project) => { setProject(saved); setProjects((last) => last.map((item) => item.id === saved.id ? saved : item)); };
  const deleteCurrentProject = async (): Promise<boolean> => {
    if (!project) return false;
    if (generatingRef.current) { toast("AI 正在生成，请先停止生成后再删除项目。", true); return false; }
    if (!confirmDiscardUnsavedDraft()) return false;
    const deletingId = project.id;
    try {
      const response = await fetch(`/api/projects/${deletingId}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) { toast(body.error || "项目删除失败，请重试。", true); return false; }
      const remaining = (body.projects || []) as Project[];
      const next = getNextProjectAfterDeletion(remaining);
      setProjects(remaining);
      setProject(next);
      setChapters({}); setDraft(""); setSources([]); setError(""); setKbCount(0); setSelectedChars(0);
      const nextOutline = next?.outline?.length ? next.outline : DEFAULT_OUTLINE;
      setSelected(nextOutline[0]?.id || "bg");
      if (next) localStorage.setItem("bid-writer:active-project", next.id);
      else localStorage.removeItem("bid-writer:active-project");
      setModal(false);
      toast(next ? `项目已删除，已切换至「${next.name}」` : "尚未创建项目，请先新建项目开始使用。");
      return true;
    } catch {
      toast("项目删除失败，请检查网络后重试。", true);
      return false;
    }
  };
  const saveOutline = async (items: OutlineItem[]) => { if (!project || generatingRef.current) return; if (!items.some((item) => item.id === selected) && !confirmDiscardUnsavedDraft()) return; const response = await fetch(`/api/projects/${project.id}/outline`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outline: items }) }); const body = await response.json(); if (!response.ok) return toast(body.error || "目录保存失败", true); const saved = body.project as Project; const savedOutline = saved.outline?.length ? saved.outline : DEFAULT_OUTLINE; setProject(saved); setProjects((last) => last.map((item) => item.id === saved.id ? saved : item)); setSelected(savedOutline.some((item) => item.id === selected) ? selected : savedOutline[0]?.id || ""); setOutlineModal(false); toast("项目目录已保存"); };
  const chooseSection = (sectionId: string) => { if (sectionId === selected) return; if (generatingRef.current) return toast("AI 正在生成，请先停止生成后再切换章节。", true); if (!confirmDiscardUnsavedDraft()) return; setSelected(sectionId); };
  const chooseProject = (id: string) => { const next = projects.find((item) => item.id === id) || null; if (!next || next.id === project?.id) return; if (generatingRef.current) return toast("AI 正在生成，请先停止生成后再切换项目。", true); if (!confirmDiscardUnsavedDraft()) return; setProject(next); localStorage.setItem("bid-writer:active-project", next.id); };
  const beginNewProject = () => { if (generatingRef.current) return toast("AI 正在生成，请先停止生成后再新建项目。", true); if (!confirmDiscardUnsavedDraft()) return; setProject(null); setModal(true); };
  const saveChapter = async ({ projectId, sectionId, content, ragSources }: SaveChapterInput): Promise<Chapter | null> => {
    if (!projectId || !sectionId || !content.trim()) { toast("章节正文不能为空", true); return null; }
    try {
      const response = await fetch(`/api/projects/${projectId}/chapters`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chapterId: sectionId, content, ragSources }) });
      const body = await response.json();
      if (!response.ok) { toast(body.error || "章节保存失败", true); return null; }
      const chapter = body.chapter as Chapter;
      if (isViewingContext({ projectId, sectionId })) { setChapters((last) => ({ ...last, [sectionId]: chapter })); setDraft(chapter.content); }
      return chapter;
    } catch {
      toast("章节保存失败，请检查网络后重试。", true);
      return null;
    }
  };
  const clearCurrentChapter = async (): Promise<boolean> => {
    if (!project || !selected) return false;
    try {
      const response = await fetch(`/api/projects/${project.id}/chapters`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chapterId: selected }) });
      const body = await response.json();
      if (!response.ok) { toast(body.error || "章节正文清空失败", true); return false; }
      if (isViewingContext({ projectId: project.id, sectionId: selected })) {
        setChapters((last) => { const next = { ...last }; delete next[selected]; return next; });
        setDraft("");
        setSources([]);
      }
      return true;
    } catch {
      toast("章节正文清空失败，请检查网络后重试。", true);
      return false;
    }
  };
  const saveCurrentChapter = async () => {
    const isClearing = !draft.trim();
    const saved = isClearing
      ? await clearCurrentChapter()
      : Boolean(project && await saveChapter({ projectId: project.id, sectionId: selected, content: draft, ragSources: sources }));
    if (saved) toast(isClearing ? "章节正文已清空" : "章节已保存");
  };
  const generate = async (mode: GenerationMode = "draft") => {
    if (!project || !selected || generatingRef.current) return;
    if (needsGenerationReplacementConfirmation(mode, draft, current?.content) && !window.confirm("重新生成会产生新的候选内容。生成成功并保存后将覆盖当前已保存正文；生成失败会恢复原正文。建议先保存或复制，是否继续？")) return;
    const context: GenerationContext = { projectId: project.id, sectionId: selected, initialContent: draft, initialSources: sources };
    const controller = new AbortController();
    generationRef.current = context;
    generatingRef.current = true;
    abortRef.current = controller;
    setLastMode(mode);
    setGenerating(true);
    setError("");
    setDraft("");
    setSources([]);
    let text = "";
    let streamSources: string[] = [];
    const restoreSnapshot = () => { if (isViewingContext(context)) { setDraft(context.initialContent); setSources(context.initialSources); } };
    try {
      const response = await fetch("/api/generate", { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: context.projectId, chapterId: context.sectionId, wordTarget, extra, useRag, mode, sourceContent: mode === "polish" ? context.initialContent : undefined }) });
      if (!response.ok) { const body = await response.json(); throw new Error(body.error || "生成失败"); }
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          const event = JSON.parse(data);
          if (event.aborted) { const abortError = new Error("已停止生成"); abortError.name = "AbortError"; throw abortError; }
          if (event.error) throw new Error(event.error);
          if (event.rag) { streamSources = event.rag; if (isViewingContext(context)) setSources(streamSources); }
          if (event.text) { text += event.text; if (isViewingContext(context)) setDraft(text); }
        }
      }
      if (!text) throw new Error("模型未返回正文，请重试。");
      const normalized = normalizeGeneratedContent(text);
      if (isViewingContext(context)) setDraft(normalized);
      const saved = await saveChapter({ projectId: context.projectId, sectionId: context.sectionId, content: normalized, ragSources: streamSources });
      if (!saved) {
        const saveError = "正文已生成，但保存失败。当前内容仍保留在编辑器中，请手动保存。";
        if (isViewingContext(context)) setError(saveError);
        toast(saveError, true);
        return;
      }
      toast(mode === "polish" ? "终稿润色完成并已保存" : "章节起草完成并已保存");
    } catch (caught) {
      if ((caught as Error).name !== "AbortError") {
        const failure = (caught as Error).message || "生成失败";
        restoreSnapshot();
        if (isViewingContext(context)) setError(failure);
        toast(failure, true);
      } else if (text) {
        if (isViewingContext(context)) setDraft(normalizeGeneratedContent(text));
        toast("已停止生成；可编辑后手动保存");
      } else {
        restoreSnapshot();
      }
    } finally {
      if (generationRef.current === context) { generationRef.current = null; generatingRef.current = false; abortRef.current = null; setGenerating(false); }
    }
  };
  useEffect(() => { if (project && !outline.some((item) => item.id === selected)) setSelected(outline[0]?.id || ""); }, [project, outline, selected]);
  const selectedItem = outline.find((item) => item.id === selected);
  const selectedLabel = selectedItem?.title || "未选择标题";
  const writingGuidance = selectedItem ? getWritingGuidance(selectedItem, outline) : [];
  return <main style={{ height: "100vh", display: "flex", overflow: "hidden", background: COLORS.paper, color: COLORS.ink, fontFamily: "'Noto Sans SC', 'Microsoft YaHei', sans-serif" }}>
    <aside style={{ flex: "0 0 230px", boxSizing: "border-box", minHeight: 0, overflow: "hidden", background: COLORS.ink, color: "#fff", padding: 16, display: "flex", flexDirection: "column" }}><h2 style={{ fontFamily: "serif", fontSize: 20 }}>标智 BidAI</h2><p style={{ fontSize: 11, opacity: .5, marginTop: 4 }}>政企项目智能申报助手</p>
      <nav style={{ marginTop: 20 }}>{([ ["workspace", "✍️ 生成工作台"], ["kb", `📚 项目资料${kbCount ? ` (${kbCount})` : ""}`], ["export", "📤 汇总与导出"] ] as [View, string][]).map(([id, label]) => <button key={id} onClick={() => setView(id)} style={{ width: "100%", textAlign: "left", padding: "9px 8px", color: "#fff", background: view === id ? "rgba(255,255,255,.13)" : "transparent", border: "none", borderRadius: 4, font: "inherit", fontSize: 12 }}>{label}</button>)}</nav>
      {view === "workspace" && <div style={{ flex: 1, minHeight: 0, marginTop: 18, overflowY: "auto", paddingRight: 4 }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}><span style={{ fontSize: 11, opacity: .65 }}>当前目录</span>{project && <Button disabled={generating} onClick={() => setOutlineModal(true)}>编辑目录</Button>}</div><p style={{ fontSize: 11, lineHeight: 1.5, opacity: .6, margin: "0 0 8px" }}>已根据通用申报结构初始化，请结合正式申报模板进行调整。</p>{outline.map((item, index) => <button key={item.id} onClick={() => chooseSection(item.id)} style={{ display: "flex", justifyContent: "space-between", width: `calc(100% - ${(item.level - 1) * 12}px)`, marginLeft: (item.level - 1) * 12, padding: "7px 4px", color: selected === item.id ? "#fff" : "rgba(255,255,255,.62)", background: "transparent", border: "none", borderLeft: selected === item.id ? `2px solid ${COLORS.red}` : "2px solid transparent", font: "inherit", fontSize: 12 }}><span>{outlineLabels[index]} {item.title}</span><span>{chapters[item.id] ? "●" : "○"}</span></button>)}</div>}
      <div style={{ flexShrink: 0, marginTop: "auto", borderTop: "1px solid rgba(255,255,255,.12)", paddingTop: 12 }}>{project && <div style={{ fontSize: 12, opacity: .75, marginBottom: 8 }}>{project.name}</div>}<Button disabled={generating} onClick={() => setModal(true)}>{project ? "编辑当前项目" : "创建项目"}</Button></div>
    </aside>
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}><header style={{ flexShrink: 0, padding: "12px 22px", borderBottom: `1px solid ${COLORS.border}`, background: "#fff", display: "flex", gap: 10, alignItems: "center" }}><strong style={{ flex: 1 }}>{project?.name || "请先创建项目"}</strong>{projects.length > 1 && <select disabled={generating} value={project?.id || ""} onChange={(e) => chooseProject(e.target.value)} style={{ ...fieldStyle, width: 180 }}><option value="" disabled>选择项目</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}<Button disabled={generating} onClick={beginNewProject}>+ 新建项目</Button></header>
      {view === "kb" && <KnowledgeBase project={project} onCount={setKbCount} toast={toast} />}
      {view === "export" && <ExportView project={project} outline={outline} chapters={chapters} toast={toast} onProjectStyleSaved={saveProjectExportStyle} />}
      {view === "workspace" && <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(300px, 340px)", overflow: "hidden" }}>
        <section style={{ minWidth: 0, minHeight: 0, padding: 22, overflowY: "auto", background: COLORS.canvas }}>
          <div style={{ ...card, padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 12 }}>
              <div><h2 style={{ fontFamily: "serif" }}>{selectedLabel}</h2><p style={{ ...muted, marginTop: 4 }}>在此检查、编辑并保存当前章节正文。</p></div>
              <span style={{ fontSize: 12, color: generating ? COLORS.blue : hasUnsavedDraft ? COLORS.red : current ? COLORS.green : COLORS.muted }}>{generating ? "AI 正在生成" : hasUnsavedDraft ? "有未保存修改" : current ? `已保存 · ${current.wc} 字` : "尚未生成"}</span>
            </div>
            {sources.length > 0 && <p style={{ fontSize: 12, color: COLORS.blue, marginBottom: 10 }}>本次参考材料：{sources.join("、")}</p>}
            {error && <div style={{ color: COLORS.red, fontSize: 13, marginBottom: 10 }}>生成失败：{error} <Button kind="danger" onClick={() => generate(lastMode)}>重试{lastMode === "polish" ? "优化" : "生成"}</Button></div>}
            {!draft.trim() && !generating && <div style={{ padding: "12px 14px", marginBottom: 10, border: `1px dashed ${COLORS.border}`, borderRadius: 4, color: COLORS.muted, fontSize: 13 }}>当前章节尚未生成内容，请在右侧查看推荐写作要点并设置要求后生成；也可以直接在下方手工编写。</div>}
            <textarea value={draft} onChange={(e) => { setDraft(e.target.value); setSelectedChars(0); }} onSelect={(e) => updateSelectionCount(e.currentTarget)} placeholder={project ? "当前章节正文将显示在这里，也可以直接手工编写。" : "请先创建项目。"} disabled={!project || generating} style={{ ...fieldStyle, minHeight: 500, lineHeight: 1.8, resize: "vertical", whiteSpace: "pre-wrap" }} />
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 12, alignItems: "flex-start" }}>
              <div style={muted}><div>当前字数：{countTextChars(draft)}{selectedChars ? ` · 选中：${selectedChars} 字` : ""}</div>{hasUnsavedDraft && <div style={{ marginTop: 5, color: COLORS.red }}>编辑内容尚未保存</div>}{paragraphMetrics.length > 0 && <div style={{ marginTop: 5 }}>段落字数（按换行）：{paragraphMetrics.map((item) => <span key={item.index} style={{ display: "inline-block", marginRight: 6, color: item.isLong ? COLORS.red : COLORS.muted }}>第{item.index}段 {item.chars}字</span>)}{longParagraphs.length > 0 && <span style={{ color: COLORS.red }}>；{longParagraphs.length} 段超过 300 字，建议复核</span>}</div>}</div>
              <div style={{ display: "flex", gap: 8 }}><Button disabled={!draft || generating} onClick={() => navigator.clipboard.writeText(draft).then(() => toast("已复制"))}>复制</Button><Button kind="primary" disabled={generating || (!draft && !current)} onClick={saveCurrentChapter}>{draft.trim() ? "保存章节" : "清空正文"}</Button></div>
            </div>
          </div>
        </section>
        <aside style={{ minHeight: 0, background: "#fff", borderLeft: `1px solid ${COLORS.border}`, padding: 18, overflowY: "auto" }}>
          <h3 style={{ fontFamily: "serif", fontSize: 18, marginBottom: 5 }}>AI 写作指导</h3>
          <p style={{ ...muted, marginBottom: 10 }}>参考下方写作要点，补充本项目的特殊要求即可。</p>
          <div style={{ ...card, padding: 12, marginBottom: 12, background: "#fcfbf9" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 9 }}><strong style={{ fontSize: 13 }}>推荐写作要点</strong><span style={{ ...muted, fontSize: 11 }}>{writingGuidance.length} 项</span></div><div style={{ display: "grid", gap: 9 }}>{writingGuidance.map((item) => <div key={item.title} style={{ fontSize: 12, lineHeight: 1.55 }}><strong style={{ color: COLORS.ink, marginRight: 8 }}>{item.title}</strong><span style={{ color: COLORS.muted }}>{item.description}</span></div>)}</div></div>
          <Field label="补充要求（可选）"><textarea value={extra} onChange={(e) => setExtra(e.target.value)} style={{ ...fieldStyle, minHeight: 100, resize: "vertical" }} placeholder="如：重点说明已确认的业务范围，或按专家意见压缩某段内容。" /><span style={{ ...muted, display: "block", marginTop: 5 }}>说明本章节的业务重点或修改要求即可。</span></Field>
          <Field label="目标字数"><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}><select value={[800, 1500, 2500, 4000].includes(wordTarget) ? String(wordTarget) : ""} onChange={(e) => { if (e.target.value) updateWordTarget(e.target.value); }} style={fieldStyle}><option value="">快捷档位</option>{[800, 1500, 2500, 4000].map((n) => <option key={n} value={n}>约 {n} 字</option>)}</select><input type="number" min="100" max="4000" step="1" value={wordTargetInput} onChange={(e) => updateWordTarget(e.target.value)} onBlur={normalizeWordTarget} style={fieldStyle} aria-label="自定义目标字数" /></div><span style={{ ...muted, display: "block", marginTop: 5, color: wordTargetValid ? COLORS.muted : COLORS.red }}>支持 100—4000 字；材料不足时可设置较短目标。</span></Field>
          <label style={{ display: "flex", gap: 8, fontSize: 12, margin: "16px 0 8px" }}><input type="checkbox" checked={useRag} onChange={(e) => setUseRag(e.target.checked)} />参考项目资料</label>
          {useRag && kbCount === 0 && <p style={{ ...muted, margin: "0 0 12px" }}>当前项目尚未上传资料，本次生成将主要依据项目信息、章节结构和写作要求。</p>}
          {!draft.trim() && !current && project && (!project.org || !project.desc) && <p style={{ ...muted, margin: "0 0 12px", color: COLORS.gold }}>项目信息尚未完整；建议补充申报主体或建设内容，以便生成更贴合项目实际的正文。</p>}
          <div style={{ display: "grid", gap: 8 }}>
            {!draft.trim() && !current ? <Button kind="primary" disabled={!project || generating || !wordTargetValid} onClick={() => generate("draft")}>{generating ? "AI 正在生成…" : "生成正文"}</Button> : <><Button kind="primary" disabled={!project || generating} onClick={() => generate("polish")}>{generating ? "AI 正在生成…" : "AI 优化"}</Button><Button disabled={!project || generating || !wordTargetValid} onClick={() => generate("draft")}>重新生成</Button></>}
            {generating && <Button kind="danger" onClick={() => abortRef.current?.abort()}>停止生成</Button>}
          </div>
          <p style={{ ...muted, marginTop: 12 }}>AI 输出是可编辑初稿，请结合项目资料和业务事实复核后保存。</p>
        </aside>
      </div>}
    </div>{modal && <ProjectModal project={project} onClose={() => setModal(false)} onSave={saveProject} onDelete={project ? deleteCurrentProject : undefined} />}{outlineModal && project && <OutlineModal outline={outline} onClose={() => setOutlineModal(false)} onSave={saveOutline} />}{message && <div style={{ position: "fixed", right: 20, bottom: 20, padding: "10px 14px", color: "#fff", background: message.error ? COLORS.red : COLORS.green, borderRadius: 4, fontSize: 13 }}>{message.text}</div>}
  </main>;
}

const panel: CSSProperties = { flex: 1, overflow: "auto", padding: 24 }; const card: CSSProperties = { background: "#fff", border: `1px solid ${COLORS.border}`, borderRadius: 7 }; const muted: CSSProperties = { color: COLORS.muted, fontSize: 12, lineHeight: 1.6 }; const overlay: CSSProperties = { position: "fixed", inset: 0, zIndex: 20, background: "rgba(0,0,0,.48)", display: "grid", placeItems: "center" }; const modal: CSSProperties = { width: 620, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto", background: "#fff", borderRadius: 8, padding: 24 };

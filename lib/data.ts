import { kv } from "@vercel/kv";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import type { ChapterData, ExportStyle, KBChunk, KBDoc, Project, ProjectInput } from "@/lib/types";
import { validateOutline } from "@/lib/outline";
import { normalizeExportStyle } from "@/lib/export-style";

interface AppData {
  projects: Project[];
  documents: KBDoc[];
  chunks: KBChunk[];
  chapters: Record<string, Record<string, ChapterData>>;
}

const DATA_KEY = "bid-writer:app-data:v1";
const dataDir = process.env.BID_WRITER_DATA_DIR || path.join(process.cwd(), "data");
const dataFile = path.join(dataDir, "bid-writer.json");
const useKv = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
let updateQueue = Promise.resolve();

function emptyData(): AppData {
  return { projects: [], documents: [], chunks: [], chapters: {} };
}

function safeData(value: Partial<AppData> | null): AppData {
  return {
    projects: Array.isArray(value?.projects) ? value.projects : [],
    documents: Array.isArray(value?.documents) ? value.documents : [],
    chunks: Array.isArray(value?.chunks) ? value.chunks : [],
    chapters: value?.chapters && typeof value.chapters === "object" ? value.chapters : {},
  };
}

async function readData(): Promise<AppData> {
  if (useKv) return safeData(await kv.get<AppData>(DATA_KEY));
  try {
    return safeData(JSON.parse(await readFile(dataFile, "utf8")) as AppData);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyData();
    throw new Error("无法读取本地数据文件，请检查 data 目录的读写权限。");
  }
}

async function writeData(data: AppData): Promise<void> {
  if (useKv) {
    await kv.set(DATA_KEY, data);
    return;
  }
  await mkdir(dataDir, { recursive: true });
  const tempFile = `${dataFile}.tmp`;
  await writeFile(tempFile, JSON.stringify(data, null, 2), "utf8");
  await rename(tempFile, dataFile);
}

async function updateData<T>(fn: (data: AppData) => T | Promise<T>): Promise<T> {
  const job = updateQueue.then(async () => {
    const data = await readData();
    const result = await fn(data);
    await writeData(data);
    return result;
  });
  updateQueue = job.then(() => undefined, () => undefined);
  return job;
}

export function countWords(content: string): number {
  return content.replace(/\s/g, "").length;
}

export function validateProject(input: ProjectInput): ProjectInput {
  const cleaned: ProjectInput = {
    name: String(input.name || "").trim(), org: String(input.org || "").trim(), level: String(input.level || "").trim(),
    region: String(input.region || "").trim(), budget: String(input.budget || "").trim(), domain: String(input.domain || "").trim(),
    desc: String(input.desc || "").trim(), edge: String(input.edge || "").trim(),
  };
  if (!cleaned.name) {
    throw new Error("请填写项目名称。");
  }
  return cleaned;
}

export async function saveOutline(projectId: string, input: unknown) {
  const outline = validateOutline(input);
  return updateData((data) => {
    const project = data.projects.find((item) => item.id === projectId);
    if (!project) throw new Error("项目不存在或已被删除。");
    project.outline = outline;
    project.updatedAt = new Date().toISOString();
    return project;
  });
}

export async function listProjects(): Promise<Project[]> {
  return (await readData()).projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getProject(projectId: string): Promise<Project | null> {
  return (await readData()).projects.find((project) => project.id === projectId) ?? null;
}

export async function saveProject(input: ProjectInput, projectId?: string): Promise<Project> {
  const cleaned = validateProject(input);
  return updateData((data) => {
    const now = new Date().toISOString();
    const existingIndex = projectId ? data.projects.findIndex((project) => project.id === projectId) : -1;
    if (projectId && existingIndex < 0) throw new Error("项目不存在或已被删除。");
    const project: Project = existingIndex >= 0
      ? { ...data.projects[existingIndex], ...cleaned, updatedAt: now }
      : { ...cleaned, id: `project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: now, updatedAt: now };
    if (existingIndex >= 0) data.projects[existingIndex] = project;
    else data.projects.push(project);
    return project;
  });
}

export async function saveExportStyle(projectId: string, input: unknown): Promise<Project> {
  const exportStyle: ExportStyle = normalizeExportStyle(input);
  return updateData((data) => {
    const project = data.projects.find((item) => item.id === projectId);
    if (!project) throw new Error("项目不存在或已被删除。");
    project.exportStyle = exportStyle;
    project.updatedAt = new Date().toISOString();
    return project;
  });
}

/** Permanently removes one project and every record scoped to it in the single data store. */
export async function deleteProject(projectId: string): Promise<Project[]> {
  return updateData((data) => {
    const projectIndex = data.projects.findIndex((project) => project.id === projectId);
    if (projectIndex < 0) throw new Error("项目不存在或已被删除。");
    data.projects.splice(projectIndex, 1);
    delete data.chapters[projectId];
    data.documents = data.documents.filter((document) => document.projectId !== projectId);
    data.chunks = data.chunks.filter((chunk) => chunk.projectId !== projectId);
    return [...data.projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  });
}

export async function listChapters(projectId: string): Promise<Record<string, ChapterData>> {
  return (await readData()).chapters[projectId] ?? {};
}

export async function saveChapter(projectId: string, chapterId: string, content: string, ragSources: string[] = []): Promise<ChapterData> {
  if (!chapterId || !content.trim()) throw new Error("章节名称和正文不能为空。");
  return updateData((data) => {
    if (!data.projects.some((project) => project.id === projectId)) throw new Error("项目不存在或已被删除。");
    const chapter: ChapterData = { chapterId, content: content.trim(), wc: countWords(content), ragSources, updatedAt: new Date().toISOString() };
    data.chapters[projectId] ??= {};
    data.chapters[projectId][chapterId] = chapter;
    return chapter;
  });
}

/** Removes only one section's persisted body; the project outline remains intact. */
export async function clearChapter(projectId: string, chapterId: string): Promise<void> {
  if (!chapterId) throw new Error("章节名称不能为空。");
  await updateData((data) => {
    if (!data.projects.some((project) => project.id === projectId)) throw new Error("项目不存在或已被删除。");
    delete data.chapters[projectId]?.[chapterId];
  });
}

export async function listDocuments(projectId: string): Promise<KBDoc[]> {
  return (await readData()).documents.filter((document) => document.projectId === projectId).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export async function replaceDocument(document: KBDoc, chunks: KBChunk[]): Promise<void> {
  await updateData((data) => {
    data.documents = data.documents.filter((item) => item.id !== document.id);
    data.chunks = data.chunks.filter((item) => item.docId !== document.id);
    data.documents.push(document);
    data.chunks.push(...chunks);
  });
}

export async function deleteDocument(projectId: string, documentId: string): Promise<void> {
  await updateData((data) => {
    const document = data.documents.find((item) => item.id === documentId && item.projectId === projectId);
    if (!document) throw new Error("材料不存在或不属于当前项目。");
    data.documents = data.documents.filter((item) => item.id !== documentId);
    data.chunks = data.chunks.filter((item) => item.docId !== documentId);
  });
}

export async function listChunks(projectId: string): Promise<KBChunk[]> {
  return (await readData()).chunks.filter((chunk) => chunk.projectId === projectId);
}

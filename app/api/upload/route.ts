import { NextRequest, NextResponse } from "next/server";
import { getProject } from "@/lib/data";
import { extractText } from "@/lib/extract";
import { addDocument, chunkText } from "@/lib/rag";
import type { DocumentType, KBDoc } from "@/lib/types";
import { isUploadFileSizeAllowed, MAX_UPLOAD_FILE_SIZE_LABEL } from "@/lib/upload-limits";

export const runtime = "nodejs";
const supportedTypes = new Set(["policy", "template", "case", "other"]);
const supportedExtensions = new Set(["txt", "md", "pdf", "docx"]);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const projectId = String(formData.get("projectId") || "");
    const type = String(formData.get("type") || "other");
    if (!(file instanceof File)) return NextResponse.json({ error: "未收到文件，请重新选择。" }, { status: 400 });
    if (!projectId || !(await getProject(projectId))) return NextResponse.json({ error: "请先创建并保存项目，再上传材料。" }, { status: 400 });
    if (!supportedTypes.has(type)) return NextResponse.json({ error: "材料分类无效。" }, { status: 400 });
    if (!isUploadFileSizeAllowed(file.size)) return NextResponse.json({ error: `单个文件超过 ${MAX_UPLOAD_FILE_SIZE_LABEL} 限制，请压缩或拆分后重试。` }, { status: 400 });
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    if (!supportedExtensions.has(extension)) return NextResponse.json({ error: "不支持的文件格式：仅支持 PDF、DOCX、TXT 和 Markdown 文件。" }, { status: 400 });
    const text = await extractText(Buffer.from(await file.arrayBuffer()), file.name);
    if (text.length < 10) return NextResponse.json({ error: "文件内容为空或可提取文字不足，请检查文件后重试。" }, { status: 400 });
    const chunks = chunkText(text);
    const document: KBDoc = {
      id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      projectId,
      name: file.name,
      type: type as DocumentType,
      size: file.size,
      uploadedAt: new Date().toISOString(),
      chunkCount: chunks.length,
      summary: text.replace(/\s+/g, " ").slice(0, 150) + (text.length > 150 ? "…" : ""),
    };
    await addDocument(document, text);
    return NextResponse.json({ success: true, doc: document, stats: { chars: text.length, chunks: chunks.length } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "上传处理失败，请稍后重试。";
    console.error("Upload failed", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

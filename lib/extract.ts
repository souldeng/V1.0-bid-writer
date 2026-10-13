export async function extractText(buffer: Buffer, filename: string): Promise<string> {
  const extension = filename.split(".").pop()?.toLowerCase();
  if (extension === "txt" || extension === "md") return buffer.toString("utf8").replace(/^\uFEFF/, "").trim();
  if (extension === "pdf") {
    try {
      const module = await import("pdf-parse/lib/pdf-parse.js");
      const parsed = await module.default(buffer);
      return (parsed.text || "").trim();
    } catch {
      throw new Error("PDF 解析失败：请确认文件未加密、未损坏，或转换为 TXT 后重试。");
    }
  }
  if (extension === "docx") {
    try {
      const mammoth = await import("mammoth");
      const parsed = await mammoth.extractRawText({ buffer });
      return (parsed.value || "").trim();
    } catch {
      throw new Error("DOCX 解析失败：请确认文件未加密、未损坏后重试。");
    }
  }
  throw new Error("不支持的文件格式：仅支持 PDF、DOCX、TXT 和 Markdown 文件。");
}

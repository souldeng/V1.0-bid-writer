import { NextRequest } from "next/server";
import { Packer } from "docx";
import { getProject, listChapters } from "@/lib/data";
import { createProjectDocx } from "@/lib/docx-renderer";
import { getDocxExportFailureMessage } from "@/lib/export-errors";
import { getProjectOutline } from "@/lib/outline";

export const runtime = "nodejs";

function safeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80) || "项目申报书";
}

export async function GET(_: NextRequest, { params }: { params: { projectId: string } }) {
  try {
    const project = await getProject(params.projectId);
    if (!project) return Response.json({ error: getDocxExportFailureMessage(404) }, { status: 404 });
    const chapters = await listChapters(project.id);
    const outline = getProjectOutline(project);
    const savedItems = outline.filter((chapter) => chapters[chapter.id]?.content.trim());
    if (!savedItems.length) return Response.json({ error: getDocxExportFailureMessage(400) }, { status: 400 });
    const document = createProjectDocx(project, outline, chapters, project.exportStyle);
    const buffer = await Packer.toBuffer(document);
    const body = new Uint8Array(buffer.byteLength);
    body.set(buffer);
    return new Response(body, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${safeFilename(project.name)}_申报书草稿.docx`)}` } });
  } catch (error) {
    console.error("DOCX export failed", error);
    return Response.json({ error: getDocxExportFailureMessage() }, { status: 500 });
  }
}

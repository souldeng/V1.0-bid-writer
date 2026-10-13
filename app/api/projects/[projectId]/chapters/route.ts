import { NextRequest, NextResponse } from "next/server";
import { clearChapter, listChapters, saveChapter } from "@/lib/data";

export async function GET(_: NextRequest, { params }: { params: { projectId: string } }) {
  return NextResponse.json({ chapters: await listChapters(params.projectId) });
}

export async function POST(request: NextRequest, { params }: { params: { projectId: string } }) {
  try {
    const { chapterId, content, ragSources } = await request.json();
    return NextResponse.json({ chapter: await saveChapter(params.projectId, chapterId, content, Array.isArray(ragSources) ? ragSources : []) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "章节保存失败。" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { projectId: string } }) {
  try {
    const { chapterId } = await request.json();
    await clearChapter(params.projectId, chapterId);
    return NextResponse.json({ cleared: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "章节正文清空失败。" }, { status: 400 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { deleteDocument } from "@/lib/data";

export async function POST(request: NextRequest) {
  try {
    const { projectId, docId } = await request.json();
    if (!projectId || !docId) return NextResponse.json({ error: "缺少项目或材料标识。" }, { status: 400 });
    await deleteDocument(projectId, docId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "删除失败，请重试。" }, { status: 400 });
  }
}

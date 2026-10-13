import { NextRequest, NextResponse } from "next/server";
import { saveExportStyle } from "@/lib/data";

export async function PUT(request: NextRequest, { params }: { params: { projectId: string } }) {
  try {
    return NextResponse.json({ project: await saveExportStyle(params.projectId, await request.json()) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "导出样式保存失败。" }, { status: 400 });
  }
}

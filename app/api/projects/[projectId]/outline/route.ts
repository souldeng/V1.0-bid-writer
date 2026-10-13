import { NextRequest, NextResponse } from "next/server";
import { saveOutline } from "@/lib/data";

export async function PUT(request: NextRequest, { params }: { params: { projectId: string } }) {
  try {
    const { outline } = await request.json();
    return NextResponse.json({ project: await saveOutline(params.projectId, outline) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "目录保存失败。" }, { status: 400 });
  }
}

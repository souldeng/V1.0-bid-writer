import { NextRequest, NextResponse } from "next/server";
import { deleteProject, getProject, saveProject } from "@/lib/data";

export async function GET(_: NextRequest, { params }: { params: { projectId: string } }) {
  const project = await getProject(params.projectId);
  return project ? NextResponse.json({ project }) : NextResponse.json({ error: "项目不存在。" }, { status: 404 });
}

export async function PUT(request: NextRequest, { params }: { params: { projectId: string } }) {
  try {
    return NextResponse.json({ project: await saveProject(await request.json(), params.projectId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "项目保存失败。" }, { status: 400 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { projectId: string } }) {
  try {
    return NextResponse.json({ success: true, projects: await deleteProject(params.projectId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "项目删除失败，请重试。" }, { status: 400 });
  }
}

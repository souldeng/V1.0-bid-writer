import { NextRequest, NextResponse } from "next/server";
import { listProjects, saveProject } from "@/lib/data";

export async function GET() {
  return NextResponse.json({ projects: await listProjects() });
}

export async function POST(request: NextRequest) {
  try {
    return NextResponse.json({ project: await saveProject(await request.json()) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "项目保存失败。" }, { status: 400 });
  }
}

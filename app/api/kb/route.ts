import { NextRequest, NextResponse } from "next/server";
import { listDocuments } from "@/lib/data";

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "缺少 projectId。", docs: [] }, { status: 400 });
  return NextResponse.json({ docs: await listDocuments(projectId) });
}

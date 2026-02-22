import { NextRequest, NextResponse } from "next/server";

const VPS = process.env.VPS_API_URL || "http://45.76.152.169:8001";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await fetch(`${VPS}/v1/jobs/${id}`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

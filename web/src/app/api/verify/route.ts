import { NextRequest, NextResponse } from "next/server";

const VPS = process.env.VPS_API_URL || "http://45.76.152.169:8001";

export async function POST(req: NextRequest) {
  const body = await req.json();  // body includes { address, chain }
  const res = await fetch(`${VPS}/v1/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

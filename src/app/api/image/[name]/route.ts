import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { readImage } from "@/lib/cases";

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  if (!(await getSession())) return new NextResponse("Not signed in", { status: 401 });
  const { name } = await params;
  const data = await readImage(name);
  if (!data) return new NextResponse("Not found", { status: 404 });
  const type = name.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  return new NextResponse(new Uint8Array(data), {
    headers: { "Content-Type": type, "Cache-Control": "private, max-age=86400" },
  });
}

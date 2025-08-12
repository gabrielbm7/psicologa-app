import { NextRequest, NextResponse } from "next/server";
import { makeAuthUrl } from "@/lib/google";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const providerId = url.searchParams.get("providerId");
  if (!providerId) return NextResponse.json({ error: "providerId é obrigatório" }, { status: 400 });

  const authUrl = makeAuthUrl(providerId);
  return NextResponse.redirect(authUrl, { status: 302 });
}

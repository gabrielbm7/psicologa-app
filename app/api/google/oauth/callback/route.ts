import { NextRequest, NextResponse } from "next/server";
import { exchangeAndStoreTokens } from "@/lib/google";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state"); // providerId
    if (!code || !state) return NextResponse.json({ error: "code/state ausentes" }, { status: 400 });

    await exchangeAndStoreTokens(state, code);
    return NextResponse.redirect(`/booking?connected=1`, { status: 302 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Falha no callback" }, { status: 500 });
  }
}

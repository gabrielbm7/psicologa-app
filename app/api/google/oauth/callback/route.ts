import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { exchangeAndStoreTokens } from "@/lib/google";

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const stateStr = searchParams.get("state");

    if (!code || !stateStr) {
      return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
    }

    let providerId = "";
    try {
      const parsed = JSON.parse(stateStr);
      providerId = parsed.providerId || "";
    } catch {
      // fallback: caso não esteja em JSON
      providerId = stateStr;
    }
    if (!providerId) {
      return NextResponse.json({ error: "providerId ausente no state" }, { status: 400 });
    }

    // >>> correção principal: passa prisma, providerId e code
    await exchangeAndStoreTokens(prisma, providerId, code);

    // Redirect ABSOLUTO (usa a URL base da requisição)
    return NextResponse.redirect(new URL("/booking?connected=1", req.url));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro inesperado" }, { status: 500 });
  }
}
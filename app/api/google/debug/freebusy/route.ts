import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getAuthedCalendar } from "@/lib/google";

const prisma = new PrismaClient();
const TZ = "America/Sao_Paulo";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const providerId = searchParams.get("providerId") || "";
    if (!providerId) return NextResponse.json({ error: "providerId é obrigatório" }, { status: 400 });

    const cal = await getAuthedCalendar(prisma, providerId);

    // Janela: hoje até +14 dias corridos (só para debug)
    const now = new Date();
    const in14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const url = "https://www.googleapis.com/calendar/v3/freeBusy";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cal.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeMin: now.toISOString(),
        timeMax: in14.toISOString(),
        items: [{ id: "primary" }],
        timeZone: TZ,
      }),
    });

    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data }, { status: res.status });

    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro inesperado" }, { status: 500 });
  }
}
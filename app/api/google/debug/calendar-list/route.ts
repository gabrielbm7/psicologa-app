import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getAuthedCalendar } from "@/lib/google";

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const providerId = searchParams.get("providerId") || "";
    if (!providerId) return NextResponse.json({ error: "providerId é obrigatório" }, { status: 400 });

    const cal = await getAuthedCalendar(prisma, providerId);

    // Lista de calendários do usuário (somente owner)
    const url = "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=owner";
    const { ok, status, data } = await cal.fetchJson(url);

    if (!ok) return NextResponse.json({ error: data }, { status });

    const items = (data.items || []).map((c: any) => ({
      id: c.id,
      summary: c.summary,
      primary: !!c.primary,
      selected: !!c.selected,
      accessRole: c.accessRole,
    }));

    return NextResponse.json({ calendars: items });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro inesperado" }, { status: 500 });
  }
}
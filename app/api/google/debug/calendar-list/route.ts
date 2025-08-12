import { NextRequest, NextResponse } from "next/server";
import { getAuthedCalendar } from "@/lib/google";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const providerId = url.searchParams.get("providerId");
    if (!providerId) return NextResponse.json({ error: "providerId é obrigatório" }, { status: 400 });

    const cal = await getAuthedCalendar(providerId);
    const { data } = await cal.calendarList.list({ minAccessRole: "owner" });
    const items = (data.items || []).map(c => ({
      id: c.id,
      summary: c.summary,
      primary: c.primary || false,
      selected: c.selected || false,
      accessRole: c.accessRole
    }));
    return NextResponse.json({ calendars: items });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Falha ao listar calendários" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getAuthedCalendar } from "@/lib/google";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const providerId = url.searchParams.get("providerId");
    if (!providerId) return NextResponse.json({ error: "providerId é obrigatório" }, { status: 400 });

    const cal = await getAuthedCalendar(providerId);
    const now = new Date();
    const to = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const fb = await cal.freebusy.query({
      requestBody: {
        timeMin: now.toISOString(),
        timeMax: to.toISOString(),
        timeZone: "America/Sao_Paulo",
        items: [{ id: "primary" }],
      },
    });

    return NextResponse.json(fb.data, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Falha no FreeBusy" }, { status: 500 });
  }
}

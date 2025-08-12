import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";

export const dynamic = "force-dynamic";
const prisma = new PrismaClient();

function generateHourlyStarts(rangeStart: Date, rangeEnd: Date) {
  const starts: Date[] = [];
  const stepMs = 60 * 60 * 1000;
  for (let t = rangeStart.getTime(); t + stepMs <= rangeEnd.getTime(); t += stepMs) {
    starts.push(new Date(t));
  }
  return starts;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const providerId = url.searchParams.get("providerId");
    const fromISO = url.searchParams.get("from");
    const toISO = url.searchParams.get("to");
    if (!providerId) return Response.json({ error: "providerId é obrigatório" }, { status: 400 });

    const settings = await prisma.providerSettings.findFirst({ where: { providerId } });
    if (!settings) return Response.json({ slots: [] });

    const now = new Date();
    const from = fromISO ? new Date(fromISO) : now;
    const to   = toISO   ? new Date(toISO)   : new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const minStart = new Date(now.getTime() + settings.minHoursBeforeBook * 60 * 60 * 1000);

    const avail = await prisma.availability.findMany({ where: { providerId } });
    const out: string[] = [];
    const dayMs = 24 * 60 * 60 * 1000;

    for (let d = new Date(from.setHours(0,0,0,0)); d <= to; d = new Date(d.getTime() + dayMs)) {
      const dow = d.getDay();
      const todays = avail.filter(a => a.dayOfWeek === dow);
      for (const a of todays) {
        const [h1, m1] = a.startTime.split(":").map(Number);
        const [h2, m2] = a.endTime.split(":").map(Number);
        const rangeStart = new Date(d); rangeStart.setHours(h1, m1, 0, 0);
        const rangeEnd   = new Date(d); rangeEnd.setHours(h2, m2, 0, 0);
        const starts = generateHourlyStarts(rangeStart, rangeEnd);
        for (const s of starts) if (s >= minStart) out.push(s.toISOString());
      }
    }
    return Response.json({ slots: out.sort() });
  } catch (e: any) {
    return Response.json({ error: e.message ?? "Erro inesperado" }, { status: 500 });
  }
}

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const TZ = "America/Sao_Paulo";
const TZ_OFFSET = "-03:00";

// YYYY-MM-DD no fuso indicado
function ymdInTZ(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// monta ISO local com -03:00 (ex.: 2025-08-15T13:00:00-03:00)
function isoAtLocalTime(ymd: string, hhmm: string) {
  const [hh, mm] = hhmm.split(":");
  return `${ymd}T${hh}:${mm}:00${TZ_OFFSET}`;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const providerId = url.searchParams.get("providerId");
    if (!providerId) return Response.json({ error: "providerId é obrigatório" }, { status: 400 });

    const settings = await prisma.providerSettings.findFirst({ where: { providerId } });
    if (!settings) return Response.json({ slots: [] });

    const now = new Date();
    const from = new Date();
    const to = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const minStart = new Date(now.getTime() + settings.minHoursBeforeBook * 60 * 60 * 1000);

    const avail = await prisma.availability.findMany({ where: { providerId } });

    const out: string[] = [];
    const dayMs = 24 * 60 * 60 * 1000;

    for (let d = new Date(from.setHours(0,0,0,0)); d <= to; d = new Date(d.getTime() + dayMs)) {
      const dow = d.getDay();
      const dayAvail = avail.filter(a => a.dayOfWeek === dow);
      if (dayAvail.length === 0) continue;

      const ymd = ymdInTZ(d);

      for (const a of dayAvail) {
        // blocos de 60min (50 + 5 + 5)
        const [sh, sm] = a.startTime.split(":").map(Number);
        const [eh, em] = a.endTime.split(":").map(Number);
        let h = sh, m = sm;

        while (true) {
          const cur = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
          const slotISO = isoAtLocalTime(ymd, cur);

          // próximo bloco
          const next = new Date(new Date(slotISO).getTime() + 60 * 60 * 1000);
          const endISO = isoAtLocalTime(ymd, a.endTime);
          if (next > new Date(endISO)) break;

          if (new Date(slotISO) >= minStart) out.push(slotISO);

          // avança 60 min
          h += 1;
          if (h >= 24) break;
        }
      }
    }

    out.sort((a,b) => +new Date(a) - +new Date(b));
    return Response.json({ slots: out });
  } catch (e: any) {
    return Response.json({ error: e.message ?? "Erro inesperado" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Utilidades simples de data (America/Sao_Paulo, -03:00 fixo)
const TZ_OFFSET = "-03:00";
function fmtYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(d: Date, n: number) {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}
function isBusinessDay(d: Date) {
  const wd = d.getDay(); // 0 dom, 6 sáb
  return wd >= 1 && wd <= 5;
}
function atHourLocalISO(dateYMD: string, hour: number) {
  // monta "YYYY-MM-DDTHH:00:00-03:00"
  const hh = String(hour).padStart(2, "0");
  return `${dateYMD}T${hh}:00:00${TZ_OFFSET}`;
}
function parseRFC3339ToDate(s: string) {
  // Google retorna tz no string; Date consegue parsear
  return new Date(s);
}
function overlaps(slotStart: Date, slotEnd: Date, busyStart: Date, busyEnd: Date) {
  // interseção se start < busyEnd && busyStart < end
  return slotStart < busyEnd && busyStart < slotEnd;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const providerId = searchParams.get("providerId") ?? undefined;
    const tipo = (searchParams.get("tipo") ?? "online") as "online" | "presencial";

    if (!providerId) {
      return NextResponse.json({ error: "providerId é obrigatório" }, { status: 400 });
    }

    // ------ JANELA: hoje até 3 semanas ÚTEIS ------
    const today = new Date();
    const businessDays: string[] = [];
    let cursor = new Date(today);

    while (businessDays.length < 15) { // 3 semanas úteis = 15 dias úteis
      if (isBusinessDay(cursor)) {
        businessDays.push(fmtYMD(cursor));
      }
      cursor = addDays(cursor, 1);
    }

    // ------ HORÁRIOS BASE ------
    // Consultório (presencial): 13,14,15,16,17 (última consulta começa 17h)
    const baseClinicHours = [13, 14, 15, 16, 17];

    // Online: iguais aos base + 19h (apenas seg-sex)
    const baseOnlineHours = [...baseClinicHours, 19];

    // Escolhe grade conforme tipo
    const hoursForTipo = tipo === "presencial" ? baseClinicHours : baseOnlineHours;

    // ------ BUSY (Google + nossos agendamentos HOLD/CONFIRMADO) ------
    // 1) Google FreeBusy (se a conta estiver conectada)
    const google = await prisma.googleAuth.findUnique({ where: { providerId } });
    let googleBusy: Array<{ start: Date; end: Date }> = [];

    if (google?.accessToken) {
      // timeMin/timeMax em UTC (ISO Z)
      const timeMin = new Date(businessDays[0] + "T00:00:00" + TZ_OFFSET).toISOString();
      const lastDay = businessDays[businessDays.length - 1];
      const timeMax = addDays(new Date(lastDay + "T23:59:59" + TZ_OFFSET), 0).toISOString();

      const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${google.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          timeMin,
          timeMax,
          items: [{ id: "primary" }],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const busyArr = data?.calendars?.primary?.busy ?? [];
        googleBusy = busyArr.map((b: any) => ({
          start: parseRFC3339ToDate(b.start),
          end: parseRFC3339ToDate(b.end),
        }));
      }
    }

    // 2) Busy por reservas existentes (HOLD ou CONFIRMADO)
    const appts = await prisma.appointment.findMany({
      where: {
        providerId,
        status: { in: ["HOLD", "CONFIRMADO"] },
        // dentro do range aproximado
        startUtc: {
          gte: new Date(businessDays[0] + "T00:00:00" + TZ_OFFSET),
          lte: new Date(businessDays[businessDays.length - 1] + "T23:59:59" + TZ_OFFSET),
        },
      },
      select: { startUtc: true, endUtc: true },
    });
    const localBusy = appts.map((a) => ({ start: new Date(a.startUtc), end: new Date(a.endUtc) }));

    const allBusy = [...googleBusy, ...localBusy];

    // ------ GERA SLOTS E DEDUPLICA ------
    const slotsSet = new Set<string>();

    for (const ymd of businessDays) {
      // se for fim de semana, pula (garantia extra)
      const d = new Date(ymd + "T12:00:00" + TZ_OFFSET);
      if (!isBusinessDay(d)) continue;

      // se for presencial, NUNCA incluir 19h; se online, incluir 19h
      for (const hour of hoursForTipo) {
        // 19h só aparece quando tipo === "online"
        if (hour === 19 && tipo !== "online") continue;

        const slotStartISO = atHourLocalISO(ymd, hour);
        const slotEndISO = atHourLocalISO(ymd, hour + 1);

        const slotStart = new Date(slotStartISO);
        const slotEnd = new Date(slotEndISO);

        // conflito?
        const hasConflict = allBusy.some((b) => overlaps(slotStart, slotEnd, b.start, b.end));
        if (!hasConflict) {
          slotsSet.add(slotStartISO);
        }
      }
    }

    // Ordena cronologicamente
    const slots = Array.from(slotsSet).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    );

    return NextResponse.json({ slots });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
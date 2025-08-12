import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getValidAccessToken } from "@/lib/google";

const prisma = new PrismaClient();

// ===== Configurações de negócio =====
const TZ = "America/Sao_Paulo";
const SESSION_MIN = 50;
const BUFFER_BEFORE_MIN = 5;
const BUFFER_AFTER_MIN = 5;
const LEAD_HOURS = 24; // antecedência mínima
const BUSINESS_DAYS_COUNT = 15; // 3 semanas úteis (Seg–Sex)

const START_HOUR = 13; // primeira sessão 13:00
const LAST_START_PRESENCIAL = 17; // última PRESENCIAL às 17:00
const ONLINE_EXTRA_19 = true; // 19:00 só no Online (Seg–Sex)

// ===== Utilitários =====
function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60000);
}
function isBusinessDay(d: Date) {
  const dow = d.getDay();
  return dow >= 1 && dow <= 5;
}
function startBusinessFromToday(from = new Date()) {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  if (dow === 0) d.setDate(d.getDate() + 1); // dom -> seg
  if (dow === 6) d.setDate(d.getDate() + 2); // sáb -> seg
  return d;
}
function nextBusinessDays(start: Date, businessDays: number) {
  const arr: Date[] = [];
  const d = new Date(start);
  while (arr.length < businessDays) {
    if (isBusinessDay(d)) arr.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return arr;
}
function endOfDayLocal(d: Date, tz = TZ) {
  const local = new Date(d.toLocaleString("en-US", { timeZone: tz }));
  local.setHours(23, 59, 59, 999);
  // converte p/ UTC mantendo o ponto do fim do dia local
  return new Date(local.toISOString());
}
function dateAtLocal(y: number, m: number, d: number, hh: number, mm = 0, tz = TZ) {
  // cria a data no fuso do Brasil corretamente
  const base = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const local = new Date(base.toLocaleString("en-US", { timeZone: tz }));
  return local;
}
function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}
function toIsoWithOffsetMinus3(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const local = new Date(date.toLocaleString("en-US", { timeZone: TZ }));
  const yyyy = local.getFullYear();
  const mm = pad(local.getMonth() + 1);
  const dd = pad(local.getDate());
  const HH = pad(local.getHours());
  const MM = pad(local.getMinutes());
  return `${yyyy}-${mm}-${dd}T${HH}:${MM}:00-03:00`; // Brasil (sem DST)
}

// ===== Handler =====
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const providerId = searchParams.get("providerId") || "";
    const tipo = (searchParams.get("tipo") || "presencial").toLowerCase();

    if (!providerId) return Response.json({ error: "providerId é obrigatório" }, { status: 400 });
    if (tipo !== "presencial" && tipo !== "online") {
      return Response.json({ error: "tipo inválido" }, { status: 400 });
    }

    // 3 semanas úteis a partir de hoje (ou próxima segunda)
    const now = new Date();
    const minStart = addMinutes(now, LEAD_HOURS * 60);

    const start = startBusinessFromToday(now);
    const businessDays = nextBusinessDays(start, BUSINESS_DAYS_COUNT);
    const lastBusinessDay = businessDays[businessDays.length - 1];
    const timeMax = endOfDayLocal(lastBusinessDay, TZ);

    // token Google válido
    const accessToken = await getValidAccessToken(prisma, providerId);

    // freeBusy cobrindo exatamente o intervalo dos dias úteis
    const fbRes = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeMin: now.toISOString(),
        timeMax: timeMax.toISOString(),
        items: [{ id: "primary" }],
        timeZone: TZ,
      }),
    });

    if (!fbRes.ok) {
      const text = await fbRes.text();
      return Response.json({ error: `Google freeBusy falhou: ${text}` }, { status: 502 });
    }

    const fb = (await fbRes.json()) as {
      calendars: { [key: string]: { busy: { start: string; end: string }[] } };
    };
    const busy = fb.calendars?.primary?.busy || [];

    // evita choque com reservas do banco (HOLD/CONFIRMADO) nesse mesmo intervalo
    const dbAppts = await prisma.appointment.findMany({
      where: {
        providerId,
        startUtc: { lt: timeMax },
        endUtc: { gt: now },
        status: { in: ["HOLD", "CONFIRMADO"] },
      },
      select: { startUtc: true, endUtc: true },
    });

    const slots: string[] = [];

    for (const day of businessDays) {
      const dow = day.getDay(); // 1..5
      const y = day.getFullYear();
      const m = day.getMonth() + 1;
      const d = day.getDate();

      const hours: number[] = [];
      for (let h = START_HOUR; h <= LAST_START_PRESENCIAL; h++) hours.push(h);
      if (ONLINE_EXTRA_19 && tipo === "online") hours.push(19); // 19h só online

      for (const h of hours) {
        const startLocal = dateAtLocal(y, m, d, h, 0, TZ);
        const endLocal = addMinutes(startLocal, SESSION_MIN + BUFFER_BEFORE_MIN + BUFFER_AFTER_MIN); // 60min janela

        // respeita antecedência e janela máxima
        if (startLocal < minStart) continue;
        if (startLocal > timeMax) continue;

        // conflito com Google
        const hasGCalConflict = busy.some(({ start: bS, end: bE }) =>
          overlaps(startLocal, endLocal, new Date(bS), new Date(bE))
        );
        if (hasGCalConflict) continue;

        // conflito com banco
        const hasDbConflict = dbAppts.some(({ startUtc, endUtc }) =>
          overlaps(startLocal, endLocal, new Date(startUtc), new Date(endUtc))
        );
        if (hasDbConflict) continue;

        slots.push(toIsoWithOffsetMinus3(startLocal));
      }
    }

    slots.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    return Response.json({ slots });
  } catch (e: any) {
    return Response.json({ error: e?.message || "Erro inesperado" }, { status: 500 });
  }
}
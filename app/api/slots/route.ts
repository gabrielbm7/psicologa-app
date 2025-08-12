// app/api/slots/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getAuthedCalendar } from "@/lib/google";

const prisma = new PrismaClient();

// --- CONFIG ---
const TZ_OFFSET_MIN = -3 * 60; // America/Sao_Paulo (sem DST)
const MIN_HOURS_AHEAD = 24;    // mínimo de antecedência p/ agendar
const WEEKS_AHEAD = 3;         // 3 semanas úteis
const BASE_HOURS = [13, 14, 15, 16, 17]; // últimas 17h (consulta termina 17:50)
const EXTRA_ONLINE_HOUR = 19;            // só ONLINE, seg-sex
const SESSION_MINUTES = 50;

// util: cria Date ancorado no fuso -03:00 a partir de Y,M,D e hora local
function makeZonedDate(year: number, monthIdx: number, day: number, hour: number, minute = 0) {
  // Convertemos “horário local SP” para UTC somando o offset (negativo)
  const utc = new Date(Date.UTC(year, monthIdx, day, hour - TZ_OFFSET_MIN / 60, minute, 0, 0));
  return utc;
}

// util: ISO com sufixo -03:00 (para exibir e enviar ao front)
function toIsoSaoPaulo(d: Date) {
  // gera “YYYY-MM-DDTHH:mm:ss-03:00”
  const pad = (n: number) => String(n).padStart(2, "0");
  const u = new Date(d); // UTC
  // Converte UTC -> hora local (-03:00)
  const localMs = u.getTime() + TZ_OFFSET_MIN * 60 * 1000;
  const ld = new Date(localMs);
  const YYYY = ld.getUTCFullYear();
  const MM = pad(ld.getUTCMonth() + 1);
  const DD = pad(ld.getUTCDate());
  const hh = pad(ld.getUTCHours());
  const mm = pad(ld.getUTCMinutes());
  const ss = pad(ld.getUTCSeconds());
  return `${YYYY}-${MM}-${DD}T${hh}:${mm}:${ss}-03:00`;
}

// util: pula fins de semana
function isWeekday(d: Date) {
  const wd = d.getUTCDay(); // 0 dom, 6 sáb (em UTC, mas o dia civil é o mesmo aqui)
  return wd !== 0 && wd !== 6;
}

// gera a lista de dias úteis a partir de hoje, por 3 semanas úteis
function getBusinessDays(fromUtc: Date, weeks: number) {
  const days: Date[] = [];
  let d = new Date(Date.UTC(fromUtc.getUTCFullYear(), fromUtc.getUTCMonth(), fromUtc.getUTCDate(), 0, 0, 0, 0));
  while (days.length < weeks * 5) {
    if (isWeekday(d)) days.push(new Date(d));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const providerId = url.searchParams.get("providerId");
    const tipo = (url.searchParams.get("tipo") || "PRESENCIAL").toUpperCase(); // "ONLINE" | "PRESENCIAL"

    if (!providerId) {
      return NextResponse.json({ error: "providerId é obrigatório" }, { status: 400 });
    }

    // regras do provedor (janela de antecedência)
    const settings = await prisma.providerSettings.findUnique({ where: { providerId } });
    const minHours = settings?.minHoursBeforeBook ?? MIN_HOURS_AHEAD;

    // agora + antecedência mínima
    const now = new Date();
    const minStartUtc = new Date(now.getTime() + minHours * 60 * 60 * 1000);

    // janela de consulta (3 semanas úteis)
    const days = getBusinessDays(now, WEEKS_AHEAD);

    // monta os horários base por dia
    const slotsCandUtc: Date[] = [];
    for (const day of days) {
      const y = day.getUTCFullYear();
      const m = day.getUTCMonth();
      const d = day.getUTCDate();

      // base presencial (13..17)
      for (const h of BASE_HOURS) {
        const startUtc = makeZonedDate(y, m, d, h, 0);
        // Só entra se for >= minStart
        if (startUtc >= minStartUtc) {
          slotsCandUtc.push(startUtc);
        }
      }

      // extra 19h somente ONLINE e somente seg-sex
      if (tipo === "ONLINE" && isWeekday(day)) {
        const extraUtc = makeZonedDate(y, m, d, EXTRA_ONLINE_HOUR, 0);
        if (extraUtc >= minStartUtc) {
          slotsCandUtc.push(extraUtc);
        }
      }
    }

    // remover passados e ordenar
    const futureSorted = slotsCandUtc
      .filter((d) => d >= minStartUtc)
      .sort((a, b) => a.getTime() - b.getTime());

    // consulta Google FreeBusy para bloquear ocupados
    const { accessToken } = await getAuthedCalendar(prisma, providerId);
    const timeMin = futureSorted[0] ?? makeZonedDate(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0);
    const last = futureSorted[futureSorted.length - 1] ?? timeMin;
    const timeMax = new Date(last.getTime() + 24 * 60 * 60 * 1000);

    const freeBusyRes = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: [{ id: "primary" }],
      }),
    });

    if (!freeBusyRes.ok) {
      const txt = await freeBusyRes.text();
      return NextResponse.json({ error: "Google FreeBusy falhou", details: txt }, { status: 500 });
    }

    const freeBusy = (await freeBusyRes.json()) as {
      calendars: { primary: { busy: { start: string; end: string }[] } };
    };

    const busy = freeBusy.calendars.primary.busy.map((b) => ({
      start: new Date(b.start),
      end: new Date(b.end),
    }));

    // conflito? (qualquer ocupação que intersecte a janela de 50min do slot)
    function hasConflict(startUtc: Date) {
      const endUtc = new Date(startUtc.getTime() + SESSION_MINUTES * 60 * 1000);
      return busy.some(
        (b) => !(endUtc <= b.start || startUtc >= b.end) // se NÃO (termina antes OU começa depois), há interseção
      );
    }

    const freeSlots = futureSorted.filter((s) => !hasConflict(s));

    // retorna ISO -03:00
    const slots = freeSlots.map(toIsoSaoPaulo);

    return NextResponse.json({ slots });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
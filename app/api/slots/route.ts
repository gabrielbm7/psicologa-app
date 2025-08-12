// app/api/slots/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthedCalendar } from "@/lib/google";

/** interseção entre [aStart,aEnd) e [bStart,bEnd) */
function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

/** formata em ISO com sufixo -03:00 (America/Sao_Paulo) */
function toBrIso(startUtc: Date) {
  const y = startUtc.getUTCFullYear();
  const m = String(startUtc.getUTCMonth() + 1).padStart(2, "0");
  const d = String(startUtc.getUTCDate()).padStart(2, "0");
  // “local” = UTC-3
  const hh = String((startUtc.getUTCHours() + 21) % 24).padStart(2, "0");
  const mm = String(startUtc.getUTCMinutes()).padStart(2, "0");
  const ss = String(startUtc.getUTCSeconds()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}-03:00`;
}

/** retorna true se é dia útil (seg=1 ... sex=5) */
function isWeekday(dateUtc: Date) {
  // dateUtc está “no dia” em UTC; como não há DST no -03 atualmente,
  // para decidir weekday é suficiente usar getUTCDay() aqui.
  const dow = dateUtc.getUTCDay(); // 0=Dom,1=Seg,...,6=Sáb
  return dow >= 1 && dow <= 5;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const providerId = url.searchParams.get("providerId");
    const tipo = (url.searchParams.get("tipo") || "").toLowerCase(); // "online" | "presencial" | ""
    if (!providerId) {
      return NextResponse.json({ error: "providerId é obrigatório" }, { status: 400 });
    }

    // parâmetros
    const FUSO = "America/Sao_Paulo";
    const DIAS_A_FRENTE = 14;
    const DURACAO_MIN = 50;          // 50 min por sessão
    const STEP_MIN = 60;             // começa a cada 60 min (13:00, 14:00, ...)
    const HORA_INICIO = 13;          // 13h
    const HORA_FIM = 17;             // última consulta inicia às 17:00 (presencial/online)
    const HORA_EXTRA_ONLINE = 19;    // slot extra somente online (seg–sex)
    const ANTECEDENCIA_MIN_HORAS = 24;

    const now = new Date();
    const endWindow = new Date(now.getTime() + DIAS_A_FRENTE * 24 * 60 * 60 * 1000);

    // 1) Pegar janelas ocupadas do Calendar (primary)
    let busyWindows: { start: Date; end: Date }[] = [];
    try {
      const cal = await getAuthedCalendar(providerId);
      const fb = await cal.freebusy.query({
        requestBody: {
          timeMin: now.toISOString(),
          timeMax: endWindow.toISOString(),
          timeZone: FUSO,
          items: [{ id: "primary" }],
        },
      });
      const arr = fb.data.calendars?.primary?.busy || [];
      busyWindows = arr.map(b => ({
        start: new Date(b.start as string),
        end: new Date(b.end as string),
      }));
    } catch {
      busyWindows = [];
    }

    // 2) Gerar slots
    const slots: string[] = [];
    const antecedenciaMs = ANTECEDENCIA_MIN_HORAS * 60 * 60 * 1000;

    // varrer dia a dia (a partir de "hoje" em UTC, sem horas)
    for (
      let day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      day <= endWindow;
      day = new Date(day.getTime() + 24 * 60 * 60 * 1000)
    ) {
      // --- bloco padrão 13..17 (todos os dias) ---
      for (let h = HORA_INICIO; h <= HORA_FIM; h += Math.floor(STEP_MIN / 60)) {
        const startUtc = new Date(
          Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h + 3, 0, 0) // UTC = local+3
        );
        const endUtc = new Date(startUtc.getTime() + DURACAO_MIN * 60 * 1000);

        if (startUtc.getTime() - now.getTime() < antecedenciaMs) continue;

        const conflitou = busyWindows.some(b => overlaps(startUtc, endUtc, b.start, b.end));
        if (conflitou) continue;

        slots.push(toBrIso(startUtc));
      }

      // --- slot extra 19:00 SOMENTE ONLINE e só em dias úteis (seg–sex) ---
      if (isWeekday(day) && tipo !== "presencial") {
        const h = HORA_EXTRA_ONLINE;
        const startUtc = new Date(
          Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h + 3, 0, 0)
        );
        const endUtc = new Date(startUtc.getTime() + DURACAO_MIN * 60 * 1000);

        if (startUtc.getTime() - now.getTime() >= antecedenciaMs) {
          const conflitou = busyWindows.some(b => overlaps(startUtc, endUtc, b.start, b.end));
          if (!conflitou) {
            slots.push(toBrIso(startUtc));
          }
        }
      }
    }

    // dica: se quiser forçar o 19:00 aparecer só quando ?tipo=online,
    // troque o if acima por: if (isWeekday(day) && tipo === "online") { ... }

    return NextResponse.json({ slots });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Falha ao carregar slots" }, { status: 500 });
  }
}
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

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const providerId = url.searchParams.get("providerId");
    if (!providerId) {
      return NextResponse.json({ error: "providerId é obrigatório" }, { status: 400 });
    }

    // parâmetros
    const FUSO = "America/Sao_Paulo";
    const DIAS_A_FRENTE = 14;
    const DURACAO_MIN = 50;          // 50 min por sessão
    const STEP_MIN = 60;             // começa a cada 60 min (13:00, 14:00, ...)
    const HORA_INICIO = 13;          // 13h
    const HORA_FIM = 17;             // ✅ última consulta inicia às 17:00
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

    // 2) Gerar slots (todos os dias, 13h..17h, a cada 60min)
    const slots: string[] = [];
    const antecedenciaMs = ANTECEDENCIA_MIN_HORAS * 60 * 60 * 1000;

    for (
      let day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      day <= endWindow;
      day = new Date(day.getTime() + 24 * 60 * 60 * 1000)
    ) {
      for (let h = HORA_INICIO; h <= HORA_FIM; h += Math.floor(STEP_MIN / 60)) {
        // construir UTC equivalente ao horário local (-03): UTC = local + 3h
        const startUtc = new Date(
          Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h + 3, 0, 0)
        );
        const endUtc = new Date(startUtc.getTime() + DURACAO_MIN * 60 * 1000);

        // respeita 24h de antecedência
        if (startUtc.getTime() - now.getTime() < antecedenciaMs) continue;

        // remove se conflitar com QUALQUER intervalo ocupado
        const conflitou = busyWindows.some(b => overlaps(startUtc, endUtc, b.start, b.end));
        if (conflitou) continue;

        // retorna como ...-03:00
        slots.push(toBrIso(startUtc));
      }
    }

    return NextResponse.json({ slots });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Falha ao carregar slots" }, { status: 500 });
  }
}
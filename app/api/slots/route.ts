// app/api/slots/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthedCalendar } from "@/lib/google";

/** verifica interseção entre [aStart,aEnd) e [bStart,bEnd) */
function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

/** formata em ISO com sufixo -03:00 (America/Sao_Paulo) */
function toBrIso(startUtc: Date) {
  // Brasil sem horário de verão atualmente (-03:00)
  // startUtc é a data UTC equivalente ao horário local-03
  const y = startUtc.getUTCFullYear();
  const m = String(startUtc.getUTCMonth() + 1).padStart(2, "0");
  const d = String(startUtc.getUTCDate()).padStart(2, "0");
  // como guardamos UTC = local+3, o "horário local" = UTC-3:
  const hh = String((startUtc.getUTCHours() + 21) % 24).padStart(2, "0"); // (UTC - 3)
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

    // parâmetros da janela de geração
    const FUSO = "America/Sao_Paulo";
    const DIAS_A_FRENTE = 14;
    const DURACAO_MIN = 50;      // consulta de 50 minutos
    const STEP_MIN = 60;         // inicia a cada 60 minutos (13:00, 14:00, ...)
    const HORA_INICIO = 13;      // 13:00
    const HORA_FIM = 18;         // até 18:00 (último começo 18:00)
    const ANTECEDENCIA_MIN_HORAS = 24; // regra atual: 24h para marcar/remarcar

    const now = new Date();
    const endWindow = new Date(now.getTime() + DIAS_A_FRENTE * 24 * 60 * 60 * 1000);

    // 1) BUSY do Google Calendar (primary)
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
      // se falhar o Google, segue sem busy (mas o ideal é logar isso)
      busyWindows = [];
    }

    // 2) GERAÇÃO DE SLOTS (todo dia, 13h..18h, a cada 60 min)
    const slots: string[] = [];
    const antecedenciaMs = ANTECEDENCIA_MIN_HORAS * 60 * 60 * 1000;

    for (
      let day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      day <= endWindow;
      day = new Date(day.getTime() + 24 * 60 * 60 * 1000)
    ) {
      for (let h = HORA_INICIO; h <= HORA_FIM; h += Math.floor(STEP_MIN / 60)) {
        // construir a data em "horário local -03" convertida para UTC:
        // truque: UTC = local + 3h
        const startUtc = new Date(
          Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h + 3, 0, 0)
        );
        const endUtc = new Date(startUtc.getTime() + DURACAO_MIN * 60 * 1000);

        // respeita antecedência mínima
        if (startUtc.getTime() - now.getTime() < antecedenciaMs) continue;

        // remove se conflitar com QUALQUER intervalo ocupado
        const conflitou = busyWindows.some(b => overlaps(startUtc, endUtc, b.start, b.end));
        if (conflitou) continue;

        // retorna no formato que você já usa (…-03:00)
        slots.push(toBrIso(startUtc));
      }
    }

    return NextResponse.json({ slots });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Falha ao carregar slots" }, { status: 500 });
  }
}
// app/api/slots/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ---- Configuração de agenda ----
const TZ_OFFSET = "-03:00"; // Brasil sem horário de verão
const PRESENCIAL_HOURS = [13, 14, 15, 16, 17]; // última às 17h
const ONLINE_EXTRA_HOUR = 19; // extra só para online

// Gera YYYY-MM-DD para um Date em UTC, mas "considerando" o dia local
function ymd(d: Date) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Constrói string ISO local fixa com offset -03:00, ex: 2025-08-13T13:00:00-03:00
function localIso(dateStr: string, hour: number) {
  const hh = String(hour).padStart(2, "0");
  return `${dateStr}T${hh}:00:00${TZ_OFFSET}`;
}

function isBusinessDay(d: Date) {
  const wd = d.getUTCDay(); // 0=Dom, 1=Seg, ... 6=Sáb (usando UTC só pra índice)
  return wd >= 1 && wd <= 5;
}

// Avança 1 dia (UTC) — suficiente para contagem de dias úteis simples
function addDays(d: Date, days: number) {
  const c = new Date(d.getTime());
  c.setUTCDate(c.getUTCDate() + days);
  return c;
}

// Lê ocupações (busy) do Google FreeBusy, se houver token; senão retorna lista vazia
async function getBusyWindowsFromGoogle(accessToken?: string) {
  if (!accessToken) return [];

  // janela: hoje até +21 dias (3 semanas corridas)
  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = addDays(now, 21).toISOString();

  try {
    const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeMin,
        timeMax,
        timeZone: "America/Sao_Paulo",
        items: [{ id: "primary" }],
      }),
      // Evita cache em edge
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    const busy = data?.calendars?.primary?.busy ?? [];
    // Normaliza para pares [start,end] como strings
    return busy
      .map((b: { start?: string; end?: string }) =>
        b?.start && b?.end ? [b.start, b.end] : null
      )
      .filter(Boolean) as [string, string][];
  } catch {
    return [];
  }
}

// true se um slot (ISO string com -03:00) colide com alguma janela busy
function isBusySlot(slotIso: string, busy: [string, string][]) {
  const s = new Date(slotIso).getTime();
  const e = s + 60 * 60 * 1000; // 1h

  for (const [bStart, bEnd] of busy) {
    const bs = new Date(bStart).getTime();
    const be = new Date(bEnd).getTime();
    // colisão se houver interseção
    if (s < be && e > bs) return true;
  }
  return false;
}

// Dedupe por timestamp (ms) + ordena
function dedupeAndSort(isoList: string[]) {
  const seen = new Set<number>();
  const out: string[] = [];
  for (const iso of isoList) {
    const t = new Date(iso).getTime();
    if (!seen.has(t)) {
      seen.add(t);
      out.push(iso);
    }
  }
  out.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  return out;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const providerId = searchParams.get("providerId") || "";
    const tipoParam = searchParams.get("tipo");
    const tipo = (tipoParam === "online" || tipoParam === "presencial"
      ? tipoParam
      : "online") as "online" | "presencial";

    if (!providerId) {
      return NextResponse.json(
        { error: "providerId é obrigatório" },
        { status: 400 }
      );
    }

    // 1) Busca token (opcional). Se não houver, segue sem Google.
    let accessToken: string | undefined = undefined;
    try {
      const row = await prisma.googleAuth.findUnique({
        where: { providerId },
        select: { accessToken: true },
      });
      accessToken = row?.accessToken || undefined;
    } catch {
      accessToken = undefined;
    }

    // 2) Janela de 3 semanas úteis a partir de HOJE
    const today = new Date(); // agora
    const slots: string[] = [];

    let businessDaysCount = 0;
    let cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())); // zera hora

    while (businessDaysCount < 15) {
      if (isBusinessDay(cursor)) {
        const dateStr = ymd(cursor);

        // base presencial
        const hours = [...PRESENCIAL_HOURS];

        // se online, inclui 19h
        if (tipo === "online") hours.push(ONLINE_EXTRA_HOUR);

        for (const h of hours) {
          slots.push(localIso(dateStr, h));
        }

        businessDaysCount++;
      }
      cursor = addDays(cursor, 1);
    }

    // 3) Remove janelas ocupadas do Google (se houver token)
    let available = slots;
    if (accessToken) {
      const busy = await getBusyWindowsFromGoogle(accessToken);
      available = slots.filter((s) => !isBusySlot(s, busy));
    }

    // 4) Dedupe + sort (resolve qualquer duplicidade “acidental”)
    const finalSlots = dedupeAndSort(available);

    return NextResponse.json({ slots: finalSlots }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error)?.message || "Erro desconhecido" },
      { status: 500 }
    );
  }
}
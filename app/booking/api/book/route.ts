import { NextRequest } from "next/server";
import { PrismaClient, ApptStatus, SessaoTipo } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const { providerId, userName, userEmail, tipo, startIso } = await req.json();

    if (!providerId || !userName || !userEmail || !tipo || !startIso) {
      return Response.json({ error: "Dados obrigatórios ausentes." }, { status: 400 });
    }

    // configurações da psicóloga
    const settings = await prisma.providerSettings.findFirst({ where: { providerId } });
    if (!settings) return Response.json({ error: "Provider não encontrado." }, { status: 404 });

    const start = new Date(startIso);
    const end = new Date(start.getTime() + 60 * 60 * 1000); // bloco de 60min (50+5+5)

    // regra: no mínimo 24h (ou conforme settings)
    const minStart = new Date(Date.now() + settings.minHoursBeforeBook * 60 * 60 * 1000);
    if (start < minStart) {
      return Response.json({ error: "Agendamento precisa de antecedência mínima." }, { status: 400 });
    }

    // verificar se o horário pertence à disponibilidade cadastrada
    const dow = start.getDay();
    const avail = await prisma.availability.findMany({ where: { providerId } });
    const belongsToWindow = avail.some(a => {
      if (a.dayOfWeek !== dow) return false;
      const [sh, sm] = a.startTime.split(":").map(Number);
      const [eh, em] = a.endTime.split(":").map(Number);
      const winStart = new Date(start); winStart.setHours(sh, sm, 0, 0);
      const winEnd   = new Date(start); winEnd.setHours(eh, em, 0, 0);
      // início do bloco precisa caber dentro da janela
      return start >= winStart && end <= winEnd;
    });
    if (!belongsToWindow) {
      return Response.json({ error: "Horário fora da disponibilidade." }, { status: 400 });
    }

    // conflito com outras reservas no mesmo provider
    const conflict = await prisma.appointment.findFirst({
      where: {
        providerId,
        status: { in: [ApptStatus.HOLD, ApptStatus.CONFIRMADO] },
        OR: [
          { startUtc: { lt: end }, endUtc: { gt: start } }, // overlap
        ],
      },
    });
    if (conflict) {
      return Response.json({ error: "Horário já reservado." }, { status: 409 });
    }

    // criar reserva (HOLD)
    const appt = await prisma.appointment.create({
      data: {
        providerId,
        userName,
        userEmail,
        tipo: tipo === "PRESENCIAL" ? SessaoTipo.PRESENCIAL : SessaoTipo.ONLINE,
        startUtc: start,
        endUtc: end,
        status: ApptStatus.HOLD,
      },
    });

    return Response.json({ ok: true, appointmentId: appt.id });
  } catch (e: any) {
    return Response.json({ error: e.message || "Erro ao reservar" }, { status: 500 });
  }
}
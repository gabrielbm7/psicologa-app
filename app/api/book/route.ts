// app/api/book/route.ts
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const { providerId, userName, userEmail, tipo, startIso } = await req.json();

    if (!providerId || !userName || !userEmail || !tipo || !startIso) {
      return Response.json({ error: "Dados obrigatórios ausentes." }, { status: 400 });
    }

    const settings = await prisma.providerSettings.findFirst({ where: { providerId } });
    if (!settings) return Response.json({ error: "Provider não encontrado." }, { status: 404 });

    const start = new Date(startIso);
    const end = new Date(start.getTime() + 60 * 60 * 1000); // 60 min (50 + 5 + 5)

    // antecedência mínima
    const minStart = new Date(Date.now() + settings.minHoursBeforeBook * 60 * 60 * 1000);
    if (start < minStart) {
      return Response.json({ error: "Agendamento precisa de antecedência mínima." }, { status: 400 });
    }

    // horário pertence à disponibilidade?
    const dow = start.getDay();
    const avail = await prisma.availability.findMany({ where: { providerId } });
    const belongsToWindow = avail.some(a => {
      if (a.dayOfWeek !== dow) return false;
      const [sh, sm] = a.startTime.split(":").map(Number);
      const [eh, em] = a.endTime.split(":").map(Number);
      const winStart = new Date(start); winStart.setHours(sh, sm, 0, 0);
      const winEnd   = new Date(start); winEnd.setHours(eh, em, 0, 0);
      return start >= winStart && end <= winEnd;
    });
    if (!belongsToWindow) {
      return Response.json({ error: "Horário fora da disponibilidade." }, { status: 400 });
    }

    // conflito com outras reservas
    const conflict = await prisma.appointment.findFirst({
      where: {
        providerId,
        status: { in: ["HOLD", "CONFIRMADO"] }, // usar strings
        OR: [{ startUtc: { lt: end }, endUtc: { gt: start } }],
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
        tipo: (tipo === "PRESENCIAL" ? "PRESENCIAL" : "ONLINE") as any,
        startUtc: start,
        endUtc: end,
        status: "HOLD" as any,
      },
    });

    return Response.json({ ok: true, appointmentId: appt.id });
  } catch (e: any) {
    return Response.json({ error: e.message || "Erro ao reservar" }, { status: 500 });
  }
}
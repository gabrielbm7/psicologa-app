// app/booking/ui/BookingClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Tipo = "online" | "presencial";

const PROVIDER_ID = "cme85bsyz000072zolcarfaqp";

// Paleta por dia (seg–sex). Sem nomes de planeta, só cor.
const weekdayColors: Record<number, string> = {
  1: "#FFD166", // Seg
  2: "#EF476F", // Ter
  3: "#118AB2", // Qua
  4: "#06D6A0", // Qui
  5: "#8E7CC3", // Sex
};

// Paleta por horário (opcional, leve variação para contraste)
const timeShades = [
  "brightness-100",
  "brightness-95",
  "brightness-90",
  "brightness-85",
  "brightness-100",
];

// Utilidades de datas
const tz = "America/Sao_Paulo";
const toStartOfDay = (d: Date) => {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt;
};
const addDays = (d: Date, n: number) => {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + n);
  return dt;
};
const isWeekend = (d: Date) => {
  const w = d.getDay(); // 0 dom, 6 sáb
  return w === 0 || w === 6;
};
const getMonday = (d: Date) => {
  const dt = toStartOfDay(d);
  const day = dt.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // transformar para segunda
  return addDays(dt, diff);
};

// Gera a lista de dias (3 semanas úteis a partir de hoje, começando na segunda)
function useBusinessDays3WeeksStartingToday() {
  return useMemo(() => {
    const today = toStartOfDay(new Date());
    const monday = getMonday(today); // garante que a semana começa na segunda
    const days: Date[] = [];
    let cursor = new Date(monday);

    // Precisamos cobrir 3 semanas úteis (15 dias úteis)
    while (days.length < 15) {
      if (!isWeekend(cursor) && cursor >= today) {
        days.push(new Date(cursor));
      }
      cursor = addDays(cursor, 1);
    }
    return days;
  }, []);
}

function fmtDayLabel(d: Date) {
  const wd = d.toLocaleDateString("pt-BR", {
    weekday: "short",
    timeZone: tz,
  });
  const day = d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: tz,
  });
  // Sem parênteses e sem textos extras
  return `${wd.replace(".", "")} ${day}`;
}

function weekdayIndexMonToFri(d: Date) {
  // JS: 0=dom .. 6=sáb  -> queremos 1..5 (seg..sex)
  const js = d.getDay();
  // seg=1, ter=2, qua=3, qui=4, sex=5
  return js === 0 ? 7 : js; // dom->7
}

export default function BookingClient({
  defaultTipo = "online",
}: {
  defaultTipo?: Tipo;
}) {
  const [tipo, setTipo] = useState<Tipo>(defaultTipo);
  const days = useBusinessDays3WeeksStartingToday();

  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[]>([]);

  // Quando muda o dia ou o tipo, busca slots
  useEffect(() => {
    if (!selectedDay) return;

    const controller = new AbortController();
    const fetchSlots = async () => {
      setLoadingSlots(true);
      setError(null);
      try {
        // Monta a data base YYYY-MM-DD para a API (server filtra por janela, Google e etc.)
        const y = selectedDay.getFullYear();
        const m = String(selectedDay.getMonth() + 1).padStart(2, "0");
        const d = String(selectedDay.getDate()).padStart(2, "0");
        const base = `${y}-${m}-${d}`;

        const url = `/api/slots?providerId=${encodeURIComponent(
          PROVIDER_ID
        )}&tipo=${encodeURIComponent(tipo)}&base=${encodeURIComponent(base)}`;

        const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
        if (!res.ok) {
          const msg = await res.text().catch(() => res.statusText);
          throw new Error(msg || `Erro ${res.status}`);
        }
        const data = await res.json();
        setSlots(Array.isArray(data.slots) ? data.slots : []);
      } catch (e: any) {
        if (e.name !== "AbortError") {
          setError("Falha ao carregar horários.");
          setSlots([]);
        }
      } finally {
        setLoadingSlots(false);
      }
    };

    fetchSlots();
    return () => controller.abort();
  }, [selectedDay, tipo]);

  // UI helpers
  const isSelected = (d: Date) =>
    selectedDay && toStartOfDay(d).getTime() === toStartOfDay(selectedDay).getTime();

  return (
    <div className="mx-auto max-w-screen-sm p-4 sm:p-6">
      <h1 className="text-2xl font-semibold text-center mb-4">Agendar consulta</h1>

      {/* Toggle Online / Presencial - sem textos de faixa de horário */}
      <div className="mb-4 flex gap-2">
        <button
          aria-pressed={tipo === "online"}
          onClick={() => setTipo("online")}
          className={`flex-1 py-2 rounded-xl border transition 
            ${tipo === "online" ? "bg-black text-white border-black" : "bg-white text-black border-gray-300"}`}
        >
          Online
        </button>
        <button
          aria-pressed={tipo === "presencial"}
          onClick={() => setTipo("presencial")}
          className={`flex-1 py-2 rounded-xl border transition 
            ${tipo === "presencial" ? "bg-black text-white border-black" : "bg-white text-black border-gray-300"}`}
        >
          Presencial
        </button>
      </div>

      {/* Grade de dias: 3 semanas úteis (começando na segunda, sem sáb/dom) */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 mb-4">
        {days.map((d) => {
          const wd = weekdayIndexMonToFri(d); // 1..5 (seg..sex), dom vira 7 (mas não aparece)
          const color = weekdayColors[wd as 1 | 2 | 3 | 4 | 5] || "#DDD";
          const selected = isSelected(d);
          return (
            <button
              key={d.toISOString()}
              onClick={() => setSelectedDay(d)}
              className={`rounded-xl px-2 py-3 text-center text-sm font-medium transition 
                ${selected ? "ring-2 ring-offset-2 ring-black scale-[0.99]" : "hover:opacity-95"}`}
              style={{
                background: color,
                color: "#111",
              }}
            >
              {fmtDayLabel(d)}
            </button>
          );
        })}
      </div>

      {/* Slots do dia escolhido */}
      {!selectedDay ? (
        <p className="text-center text-gray-600">Escolha uma data.</p>
      ) : loadingSlots ? (
        <p className="text-center text-gray-600">Carregando horários…</p>
      ) : error ? (
        <p className="text-center text-red-600">{error}</p>
      ) : slots.length === 0 ? (
        <p className="text-center text-gray-600">Sem horários para este dia.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {slots.map((iso, idx) => {
            const dt = new Date(iso);
            const hhmm = dt.toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: tz,
              hour12: false,
            });

            // pinta o slot de acordo com o dia + nuance por índice
            const wd = weekdayIndexMonToFri(selectedDay!);
            const baseColor = weekdayColors[wd as 1 | 2 | 3 | 4 | 5] || "#EEE";
            const shade = timeShades[idx % timeShades.length];

            return (
              <button
                key={iso}
                className={`rounded-xl px-3 py-3 font-semibold text-sm border border-black/10 ${shade} transition hover:opacity-95`}
                style={{ background: baseColor }}
                onClick={() => {
                  const q = new URLSearchParams({
                    when: iso,
                    tipo,
                    providerId: PROVIDER_ID,
                  });
                  // redireciona para confirmar (sua rota de confirmação, se quiser)
                  // por enquanto só mostra um alert amigável
                  alert(`Você escolheu ${hhmm} (${tipo}).`);
                  // window.location.href = `/booking/confirm?${q.toString()}`;
                }}
              >
                {hhmm}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
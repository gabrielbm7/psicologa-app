"use client";

import { useEffect, useMemo, useState } from "react";

type Tipo = "online" | "presencial";

const dayColors: Record<number, { bg: string; chip: string; text: string }> = {
  // 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex
  1: { bg: "bg-gray-100", chip: "bg-gray-900 text-white", text: "text-gray-900" }, // Lua
  2: { bg: "bg-red-50",  chip: "bg-red-600 text-white",   text: "text-red-800" },  // Marte
  3: { bg: "bg-blue-50", chip: "bg-blue-600 text-white",  text: "text-blue-800" }, // Mercúrio
  4: { bg: "bg-purple-50", chip: "bg-purple-600 text-white", text: "text-purple-800" }, // Júpiter
  5: { bg: "bg-green-50", chip: "bg-green-600 text-white", text: "text-green-800" }, // Vênus
};

function toZonedISO(date: Date, tzOffsetMinutes = -180) {
  // Mostra horário com sufixo -03:00, apenas para exibir alinhado à API
  const d = new Date(date);
  const ms = d.getTime() - (d.getTimezoneOffset() - tzOffsetMinutes) * 60000;
  return new Date(ms).toISOString().replace("Z", "-03:00");
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function getWeekdayNumberMonToFri(d: Date) {
  // 1..7 (Mon 1, Sun 7)
  const js = d.getDay(); // 0..6 (Sun 0)
  return js === 0 ? 7 : js; // Dom = 7
}

function addDays(d: Date, n: number) {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + n);
  return nd;
}

function isBusinessDay(d: Date) {
  const wd = d.getDay();
  return wd >= 1 && wd <= 5;
}

function startTodayAtMidnight(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Gera 15 dias úteis (3 semanas úteis) a partir de hoje, em ordem Seg..Sex por semana */
function useBusinessDays3Weeks() {
  return useMemo(() => {
    const out: Date[] = [];
    let cur = startTodayAtMidnight();
    while (out.length < 15) {
      if (isBusinessDay(cur)) out.push(new Date(cur));
      cur = addDays(cur, 1);
    }

    // Reorganiza em grupos de semanas começando na segunda
    // (já que out está em ordem cronológica, basta manter)
    return out;
  }, []);
}

export default function BookingClient({
  providerId,
  defaultTipo = "online",
}: {
  providerId: string;
  defaultTipo?: Tipo;
}) {
  const [tipo, setTipo] = useState<Tipo>(defaultTipo);
  const allDays = useBusinessDays3Weeks();
  const [selectedDate, setSelectedDate] = useState<Date>(() => allDays[0]);
  const [loading, setLoading] = useState(false);
  const [slots, setSlots] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Busca slots quando muda tipo
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const url = `/api/slots?providerId=${providerId}&tipo=${tipo}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          const t = await res.text();
          throw new Error(t || `Erro ${res.status}`);
        }
        const data = (await res.json()) as { slots: string[] };
        if (!alive) return;
        setSlots(data.slots || []);
      } catch (e: any) {
        if (!alive) return;
        setError("Falha ao carregar horários. Tente novamente.");
        console.error(e);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [providerId, tipo]);

  // Filtra slots do dia selecionado
  const daySlots = useMemo(() => {
    const isoDay = selectedDate.toISOString().slice(0, 10); // YYYY-MM-DD
    return slots.filter(s => s.slice(0, 10) === isoDay);
  }, [slots, selectedDate]);

  // Agrupa os 15 dias em 3 linhas (cada uma com 5 dias: seg..sex)
  const weeks: Date[][] = useMemo(() => {
    const w: Date[][] = [];
    for (let i = 0; i < 15; i += 5) {
      w.push(allDays.slice(i, i + 5));
    }
    return w;
  }, [allDays]);

  return (
    <div className="flex flex-col gap-6">
      {/* Toggle Presencial / Online (sem textos adicionais) */}
      <div className="flex gap-2">
        <button
          onClick={() => setTipo("presencial")}
          className={`px-4 py-2 rounded-full border transition
            ${tipo === "presencial"
              ? "bg-black text-white border-black"
              : "bg-white text-black border-gray-300 hover:bg-gray-50"}`}
          aria-pressed={tipo === "presencial"}
        >
          Presencial
        </button>
        <button
          onClick={() => setTipo("online")}
          className={`px-4 py-2 rounded-full border transition
            ${tipo === "online"
              ? "bg-black text-white border-black"
              : "bg-white text-black border-gray-300 hover:bg-gray-50"}`}
          aria-pressed={tipo === "online"}
        >
          Online
        </button>
      </div>

      {/* Grade de dias: 3 semanas úteis, sempre Seg..Sex */}
      <div className="flex flex-col gap-3">
        {weeks.map((week, idx) => (
          <div key={idx} className="grid grid-cols-5 gap-2">
            {week.map((d) => {
              const wd = getWeekdayNumberMonToFri(d); // 1..5 (seg..sex)
              const colors = dayColors[wd];
              const isSel = sameDay(d, selectedDate);
              return (
                <button
                  key={d.toISOString()}
                  onClick={() => setSelectedDate(d)}
                  className={`rounded-lg p-2 text-center border transition
                    ${isSel ? colors.chip : colors.bg}
                    ${isSel ? "" : "border-gray-200 hover:opacity-90"}
                  `}
                  aria-pressed={isSel}
                  title={d.toLocaleDateString("pt-BR")}
                >
                  <div className={`text-xs ${isSel ? "opacity-90" : colors.text}`}>
                    {d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}
                  </div>
                  <div className="font-semibold">
                    {d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Slots do dia selecionado */}
      <div className="mt-1">
        {loading && <div className="text-sm text-gray-500">Carregando horários…</div>}
        {error && <div className="text-sm text-red-600">{error}</div>}
        {!loading && !error && daySlots.length === 0 && (
          <div className="text-sm text-gray-500">Sem horários para este dia.</div>
        )}
        {!loading && !error && daySlots.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {daySlots.map((iso) => {
              const d = new Date(iso);
              const wd = getWeekdayNumberMonToFri(selectedDate);
              const colors = dayColors[wd];
              const label = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
              return (
                <button
                  key={iso}
                  className={`px-3 py-2 rounded-md text-sm font-medium ${colors.chip}`}
                  onClick={() => {
                    // Aqui você chama o fluxo de reserva (pagamento, etc.)
                    // Por enquanto só exibe um alert para confirmar o horário escolhido
                    alert(`Você selecionou ${label} (${tipo}) — ${toZonedISO(d)}`);
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
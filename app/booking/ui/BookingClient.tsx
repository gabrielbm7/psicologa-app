// app/booking/ui/BookingClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

const PROVIDER_ID = "cme85bsyz000072zolcarfaqp"; // id da psicóloga
type Tipo = "online" | "presencial";

type SlotsResponse = { slots: string[] };

function fmtDateKey(d: Date) {
  // YYYY-MM-DD no fuso local do navegador
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// Gera 15 dias úteis (Seg-Sex) a partir de "hoje"
function generateBusinessDates3Weeks(): Date[] {
  const out: Date[] = [];
  let cursor = startOfToday();
  while (out.length < 15) {
    const dow = cursor.getDay(); // 0=Dom, 1=Seg, ... 6=Sab
    if (dow >= 1 && dow <= 5) out.push(new Date(cursor));
    cursor = addDays(cursor, 1);
  }
  return out;
}

// Segunda como primeira coluna: 0..4 => Seg..Sex
function weekdayIndexMonToFri(d: Date) {
  // JS: 0 Dom..6 Sab  => queremos 0=Seg ..4=Sex
  const dow = d.getDay();
  // dow: 1..5 => 0..4
  return dow - 1;
}

// Agrupa 3 semanas (linhas) com colunas fixas Seg..Sex
function buildWeeksGrid(dates: Date[]) {
  // garante ordem natural por data
  const ordered = [...dates].sort((a, b) => a.getTime() - b.getTime());

  // calcula a primeira segunda-feira visível (padrão: a segunda da semana de "hoje",
  // ou, se hoje for depois de sexta, passa para a segunda seguinte)
  const today = startOfToday();
  const todayDow = today.getDay(); // 0 dom..6 sab
  const mondayOfThisWeek = addDays(today, todayDow === 0 ? 1 : 1 - todayDow); // segunda da semana de hoje
  const firstMonday =
    todayDow === 6 /* sábado */ ? addDays(mondayOfThisWeek, 2)
    : todayDow === 0 /* domingo */ ? addDays(mondayOfThisWeek, 0)
    : mondayOfThisWeek;

  // gera 3 semanas de colunas (Seg..Sex) a partir do firstMonday
  const weeks = Array.from({ length: 3 }, (_, w) =>
    Array.from({ length: 5 }, (_, col) => addDays(firstMonday, w * 7 + col))
  );

  // cria um set com as datas válidas (15 dias úteis) para esconder células fora do range
  const validKeys = new Set(ordered.map(fmtDateKey));

  // substitui por null as células (dias) que não estão dentro dos 15 dias úteis
  const grid = weeks.map((row) =>
    row.map((cellDate) => (validKeys.has(fmtDateKey(cellDate)) ? cellDate : null))
  );

  return grid; // 3 linhas x 5 colunas (Seg..Sex)
}

// Cores “planetárias” por dia (Seg..Sex): só cor, sem texto dos planetas
const DAY_COLORS = [
  "#9AA0A6", // Seg (Lua) - cinza
  "#D93025", // Ter (Marte) - vermelho
  "#1A73E8", // Qua (Mercúrio) - azul
  "#F29900", // Qui (Júpiter) - laranja
  "#DB2777", // Sex (Vênus) - rosa
];

// badge de dia da semana (Seg, Ter, ...)
function weekdayLabel(dow: number) {
  return ["Seg", "Ter", "Qua", "Qui", "Sex"][dow];
}

// formatação pt-BR em São Paulo
const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
});

const timeFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
});

export default function BookingClient() {
  const [tipo, setTipo] = useState<Tipo>("online");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // datas válidas (15 dias úteis)
  const businessDates = useMemo(() => generateBusinessDates3Weeks(), []);
  const weeksGrid = useMemo(() => buildWeeksGrid(businessDates), [businessDates]);

  // mapa YYYY-MM-DD -> array de Date (horários)
  const [slotsByDay, setSlotsByDay] = useState<Record<string, Date[]>>({});
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const firstSelectable = useMemo(() => fmtDateKey(businessDates[0]), [businessDates]);

  useEffect(() => {
    // seleciona o primeiro dia útil disponível ao montar ou ao trocar o tipo
    setSelectedKey(firstSelectable);
  }, [firstSelectable, tipo]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingSlots(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          providerId: PROVIDER_ID,
          tipo,
        });
        const res = await fetch(`/api/slots?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Erro ao carregar slots: ${res.status}`);
        const data: SlotsResponse = await res.json();

        // converte em Date e agrupa por dia (apenas dentro dos 15 dias úteis)
        const validKeys = new Set(businessDates.map(fmtDateKey));
        const map: Record<string, Date[]> = {};
        for (const iso of data.slots || []) {
          const d = new Date(iso);
          const key = fmtDateKey(d);
          if (!validKeys.has(key)) continue;
          if (!map[key]) map[key] = [];
          map[key].push(d);
        }
        // ordena horários por dia
        for (const k of Object.keys(map)) {
          map[k].sort((a, b) => a.getTime() - b.getTime());
        }

        if (!cancelled) setSlotsByDay(map);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Falha ao carregar horários");
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [tipo, businessDates]);

  const selectedSlots = selectedKey ? slotsByDay[selectedKey] || [] : [];

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <h1 className="text-2xl sm:text-3xl font-bold mb-2">Agendar consulta</h1>

      {/* Toggle Presencial / Online (sem textos de horários ao lado) */}
      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          onClick={() => setTipo("presencial")}
          className={[
            "flex-1 rounded-full px-4 py-2 text-sm sm:text-base font-semibold transition-all border",
            tipo === "presencial"
              ? "bg-black text-white border-black"
              : "bg-white text-black border-black/20 hover:border-black"
          ].join(" ")}
          aria-pressed={tipo === "presencial"}
        >
          Presencial
        </button>
        <button
          type="button"
          onClick={() => setTipo("online")}
          className={[
            "flex-1 rounded-full px-4 py-2 text-sm sm:text-base font-semibold transition-all border",
            tipo === "online"
              ? "bg-black text-white border-black"
              : "bg-white text-black border-black/20 hover:border-black"
          ].join(" ")}
          aria-pressed={tipo === "online"}
        >
          Online
        </button>
      </div>

      {/* Subtítulo sem parênteses */}
      <p className="text-gray-600 mb-3">Próximas 3 semanas úteis</p>

      {/* Grade (3 semanas x Seg..Sex) sempre com Segunda como primeira coluna */}
      <div className="overflow-x-auto -mx-1 mb-4">
        <div className="min-w-[520px] px-1">
          {/* Cabeçalho Seg..Sex */}
          <div className="grid grid-cols-5 gap-2 mb-2">
            {[0, 1, 2, 3, 4].map((idx) => (
              <div key={idx} className="text-center text-xs sm:text-sm font-medium">
                {weekdayLabel(idx)}
              </div>
            ))}
          </div>

          {/* Três linhas (semanas) */}
          <div className="flex flex-col gap-2">
            {weeksGrid.map((row, ri) => (
              <div key={ri} className="grid grid-cols-5 gap-2">
                {row.map((cell, ci) => {
                  if (!cell) {
                    // célula fora do range dos 15 dias úteis
                    return <div key={ci} className="h-10 rounded-xl bg-gray-100 opacity-60" />;
                  }
                  const dowIdx = weekdayIndexMonToFri(cell); // 0..4
                  const color = DAY_COLORS[dowIdx];
                  const key = fmtDateKey(cell);
                  const isSelected = selectedKey === key;
                  const hasSlots = (slotsByDay[key] || []).length > 0;

                  return (
                    <button
                      key={ci}
                      type="button"
                      onClick={() => setSelectedKey(key)}
                      disabled={!hasSlots}
                      className={[
                        "h-10 rounded-xl border text-sm font-medium transition-all",
                        isSelected
                          ? "ring-2 ring-offset-1"
                          : "hover:brightness-95 active:brightness-90",
                        hasSlots ? "opacity-100" : "opacity-40 cursor-not-allowed",
                      ].join(" ")}
                      style={{
                        background: color,
                        color: isSelected ? "#000" : "#fff",
                        borderColor: "transparent",
                      }}
                      aria-pressed={isSelected}
                      aria-label={`Selecionar dia ${dateFmt.format(cell)}`}
                      title={dateFmt.format(cell)}
                    >
                      {dateFmt.format(cell)}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Estado de carregamento / erro */}
      {loadingSlots && (
        <div className="text-sm text-gray-600 mb-2">Carregando horários…</div>
      )}
      {error && (
        <div className="text-sm text-red-600 mb-2">Falha ao carregar horários: {error}</div>
      )}

      {/* Horários do dia selecionado */}
      <div className="mt-2">
        <h2 className="text-lg font-semibold mb-2">
          {selectedKey
            ? `Horários — ${selectedKey.split("-").reverse().join("/")}`
            : "Selecione um dia"}
        </h2>

        {selectedSlots.length === 0 ? (
          <p className="text-sm text-gray-600">Sem horários para este dia.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {selectedSlots.map((d) => {
              const dow = weekdayIndexMonToFri(d);
              const color = DAY_COLORS[dow];
              const label = timeFmt.format(d);

              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  className="rounded-lg px-3 py-2 text-sm font-semibold border transition-all hover:opacity-90"
                  style={{
                    background: color,
                    color: "#fff",
                    borderColor: "transparent",
                  }}
                  onClick={() => {
                    // aqui você pode abrir o modal de dados do paciente/pagamento
                    alert(`Selecionado: ${label} (${tipo})`);
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
"use client";

import { useEffect, useMemo, useState } from "react";

type Tipo = "online" | "presencial";

const weekdayStyles: Record<number, { bg: string; text: string; ring: string }> = {
  0: { bg: "bg-yellow-100",   text: "text-yellow-800",  ring: "ring-yellow-300" },   // Sol (domingo)
  1: { bg: "bg-slate-100",    text: "text-slate-700",   ring: "ring-slate-300" },    // Lua (segunda)
  2: { bg: "bg-red-100",      text: "text-red-700",     ring: "ring-red-300" },      // Marte (terça)
  3: { bg: "bg-emerald-100",  text: "text-emerald-700", ring: "ring-emerald-300" },  // Mercúrio (quarta)
  4: { bg: "bg-blue-100",     text: "text-blue-700",    ring: "ring-blue-300" },     // Júpiter (quinta)
  5: { bg: "bg-pink-100",     text: "text-pink-700",    ring: "ring-pink-300" },     // Vênus (sexta)
  6: { bg: "bg-purple-100",   text: "text-purple-700",  ring: "ring-purple-300" },   // Saturno (sábado)
};

function toDateKey(d: Date) {
  // yyyy-mm-dd no fuso do navegador (suficiente pro front)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sameDay(aIso: string, key: string) {
  const d = new Date(aIso);
  const k = key.split("-");
  return (
    d.getFullYear() === Number(k[0]) &&
    d.getMonth() + 1 === Number(k[1]) &&
    d.getDate() === Number(k[2])
  );
}

export default function BookingClient({ providerId }: { providerId: string }) {
  const [tipo, setTipo] = useState<Tipo>("presencial");
  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // gera os próximos 14 dias a partir de hoje
  const days = useMemo(() => {
    const arr: Date[] = [];
    const today = new Date();
    // zera horas
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, []);

  const [selectedKey, setSelectedKey] = useState<string>(() => toDateKey(new Date()));

  // carrega slots quando mudar o tipo (online/presencial) ou provider
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErro(null);
      try {
        const res = await fetch(`/api/slots?providerId=${providerId}&tipo=${tipo}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Falha ao carregar slots");
        setSlots(data.slots || []);
      } catch (e: any) {
        setErro(e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [providerId, tipo]);

  // filtra os slots somente do dia selecionado
  const slotsOfDay = useMemo(
    () => slots.filter((s) => sameDay(s, selectedKey)),
    [slots, selectedKey]
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Título */}
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Agendar consulta</h1>
        <p className="text-sm text-gray-600">
          Escolha o tipo de consulta, selecione a data (próximas 2 semanas) e depois um horário.
        </p>
      </header>

      {/* Tipo: Presencial x Online */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setTipo("presencial")}
          className={`px-4 py-2 rounded border ${
            tipo === "presencial" ? "bg-black text-white border-black" : "bg-white text-black hover:bg-gray-50"
          }`}
        >
          Presencial (13h–17h)
        </button>
        <button
          onClick={() => setTipo("online")}
          className={`px-4 py-2 rounded border ${
            tipo === "online" ? "bg-black text-white border-black" : "bg-white text-black hover:bg-gray-50"
          }`}
        >
          Online (13h–17h + 19h seg–sex)
        </button>
      </div>

      {/* Grade de dias (14 dias) com cores por planeta */}
      <section className="space-y-2">
        <h2 className="font-medium">Selecione a data</h2>
        <div className="grid grid-cols-2 sm:grid-cols-7 gap-3">
          {days.map((d) => {
            const key = toDateKey(d);
            const weekday = d.getDay();
            const st = weekdayStyles[weekday];
            const selected = key === selectedKey;
            return (
              <button
                key={key}
                onClick={() => setSelectedKey(key)}
                className={`p-3 rounded-lg border text-left transition ring-2 ${
                  selected ? `${st.ring} ring-offset-2` : "ring-transparent"
                } ${st.bg} ${st.text} hover:brightness-95`}
              >
                <div className="text-xs uppercase tracking-wide opacity-80">
                  {d.toLocaleDateString("pt-BR", { weekday: "short" })}
                </div>
                <div className="text-lg font-semibold">
                  {d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                </div>
                <div className="text-[11px] opacity-80 mt-1">
                  {["Sol", "Lua", "Marte", "Mercúrio", "Júpiter", "Vênus", "Saturno"][weekday]}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Lista de horários do dia selecionado */}
      <section className="space-y-2">
        <h2 className="font-medium">Horários disponíveis</h2>

        {loading && <p>Carregando horários…</p>}
        {erro && <p className="text-red-600">Erro: {erro}</p>}

        {!loading && !erro && slotsOfDay.length === 0 && (
          <p className="text-gray-600">Nenhum horário para esta data.</p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {slotsOfDay.map((s) => (
            <button
              key={s}
              className="w-full border rounded px-3 py-2 bg-white hover:bg-gray-50 text-left"
              // TODO: aqui você chama o fluxo de reserva/pagamento
              onClick={() => alert(`Selecionado: ${new Date(s).toLocaleString("pt-BR")}`)}
            >
              {new Date(s).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}{" "}
              <span className="text-gray-500">
                · {new Date(s).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
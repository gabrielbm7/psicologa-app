"use client";

import { useEffect, useMemo, useState } from "react";

type Tipo = "online" | "presencial";

// Paleta por dia da semana (0=Dom .. 6=Sáb) — usamos só cores, sem nomes.
const weekdayStyles: Record<number, { bg: string; text: string; ring: string; border: string }> = {
  0: { bg: "bg-yellow-100",   text: "text-yellow-800",  ring: "ring-yellow-300",  border: "border-yellow-200" },  // dom
  1: { bg: "bg-slate-100",    text: "text-slate-700",   ring: "ring-slate-300",   border: "border-slate-200" },   // seg
  2: { bg: "bg-red-100",      text: "text-red-700",     ring: "ring-red-300",     border: "border-red-200" },     // ter
  3: { bg: "bg-emerald-100",  text: "text-emerald-700", ring: "ring-emerald-300", border: "border-emerald-200" }, // qua
  4: { bg: "bg-blue-100",     text: "text-blue-700",    ring: "ring-blue-300",    border: "border-blue-200" },    // qui
  5: { bg: "bg-pink-100",     text: "text-pink-700",    ring: "ring-pink-300",    border: "border-pink-200" },    // sex
  6: { bg: "bg-purple-100",   text: "text-purple-700",  ring: "ring-purple-300",  border: "border-purple-200" },  // sáb
};

function toYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function sameDay(aIso: string, key: string) {
  const d = new Date(aIso);
  const [ky, km, kd] = key.split("-").map(Number);
  return d.getFullYear() === ky && d.getMonth() + 1 === km && d.getDate() === kd;
}
function nextMonday(from = new Date()) {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0=Dom .. 6=Sáb
  // se hoje já for segunda (1), começa hoje; senão, vai até a próxima segunda
  const delta = (dow === 1) ? 0 : ((8 - dow) % 7);
  d.setDate(d.getDate() + delta);
  return d;
}

export default function BookingClient({ providerId }: { providerId: string }) {
  const [tipo, setTipo] = useState<Tipo>("presencial");
  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Gera exatamente as próximas 2 semanas úteis:
  // semana 1: Seg..Sex, semana 2: Seg..Sex — sempre começando na próxima segunda
  const days = useMemo(() => {
    const start = nextMonday(new Date());
    const arr: Date[] = [];
    for (let week = 0; week < 2; week++) {
      for (let i = 0; i < 5; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + week * 7 + i);
        arr.push(d);
      }
    }
    return arr;
  }, []);

  const [selectedKey, setSelectedKey] = useState<string>(() => toYMD(nextMonday(new Date())));

  // Carrega slots ao mudar tipo/provider
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErro(null);
      try {
        const res = await fetch(`/api/slots?providerId=${providerId}&tipo=${tipo}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Falha ao carregar horários");
        setSlots(data.slots || []);
      } catch (e: any) {
        setErro(e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [providerId, tipo]);

  const slotsOfDay = useMemo(() => slots.filter((s) => sameDay(s, selectedKey)), [slots, selectedKey]);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Agendar consulta</h1>
        <p className="text-sm text-gray-600">
          Escolha o tipo, selecione a data nas próximas 2 semanas úteis e depois um horário.
        </p>
      </header>

      {/* Toggle estilizado: Presencial x Online (sem texto de horários) */}
      <div className="inline-flex rounded-full border bg-white p-1 shadow-sm">
        {([
          {
            key: "presencial",
            label: "Presencial",
            icon: (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M12 3l9 8h-3v9h-5v-6H11v6H6v-9H3l9-8z" />
              </svg>
            ),
          },
          {
            key: "online",
            label: "Online",
            icon: (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M17 10.5V7a2 2 0 0 0-2-2H5C3.9 5 3 5.9 3 7v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3.5l4 4v-11l-4 4z" />
              </svg>
            ),
          },
        ] as const).map((opt) => {
          const selected = tipo === (opt.key as Tipo);
          return (
            <button
              key={opt.key}
              type="button"
              aria-pressed={selected}
              onClick={() => setTipo(opt.key as Tipo)}
              className={[
                "flex items-center gap-2 rounded-full px-4 py-2 text-sm transition",
                selected ? "bg-black text-white shadow-md" : "text-gray-700 hover:bg-gray-100",
              ].join(" ")}
            >
              <span className={`shrink-0 ${selected ? "opacity-100" : "opacity-80"}`}>{opt.icon}</span>
              <span className="font-medium">{opt.label}</span>
            </button>
          );
        })}
      </div>

      {/* Grade de dias (2 semanas úteis), em ordem: Seg..Sex, Seg..Sex */}
      <section className="space-y-2">
        <h2 className="font-medium">Selecione a data</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {days.map((d) => {
            const key = toYMD(d);
            const weekday = d.getDay(); // 1..5 garantido
            const st = weekdayStyles[weekday];
            const selected = key === selectedKey;
            return (
              <button
                key={key}
                onClick={() => setSelectedKey(key)}
                className={[
                  "p-3 rounded-lg border text-left transition ring-2",
                  selected ? `${st.ring} ring-offset-2` : "ring-transparent",
                  st.bg,
                  st.text,
                  st.border,
                  "hover:brightness-95",
                ].join(" ")}
              >
                <div className="text-xs uppercase tracking-wide opacity-80">
                  {d.toLocaleDateString("pt-BR", { weekday: "short" })}
                </div>
                <div className="text-lg font-semibold">
                  {d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Horários do dia selecionado — com as mesmas cores do dia */}
      <section className="space-y-2">
        <h2 className="font-medium">Horários disponíveis</h2>

        {loading && <p>Carregando horários…</p>}
        {erro && <p className="text-red-600">Erro: {erro}</p>}
        {!loading && !erro && slotsOfDay.length === 0 && (
          <p className="text-gray-600">Nenhum horário para esta data.</p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {slotsOfDay.map((s) => {
            const d = new Date(s);
            const weekday = d.getDay();
            const st = weekdayStyles[weekday];
            return (
              <button
                key={s}
                className={[
                  "w-full border rounded px-3 py-2 text-left transition hover:brightness-95",
                  st.bg,
                  st.text,
                  st.border,
                ].join(" ")}
                // TODO: aqui chama o fluxo de reserva/pagamento
                onClick={() => alert(`Selecionado: ${d.toLocaleString("pt-BR")}`)}
              >
                {d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                <span className="text-black/40">
                  {" "}
                  · {d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
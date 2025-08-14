"use client";

import React from "react";
import { useRouter } from "next/navigation";

// ✅ Ajuste aqui se o providerId mudar
const PROVIDER_ID = "cme85bsyz000072zolcarfaqp";

// Cores por dia (Mon..Fri). Mantemos apenas dias úteis.
const weekdayColors: Record<number, { bg: string; text: string; chipBg: string; chipBorder: string }> = {
  // 1 = Monday, 2 = Tuesday, ... 5 = Friday (ISO)
  1: { bg: "#ECEFF1", text: "#263238", chipBg: "#F5F7F8", chipBorder: "#B0BEC5" }, // prata/cinza (Lua)
  2: { bg: "#FFEBEE", text: "#B71C1C", chipBg: "#FFEEF0", chipBorder: "#EF9A9A" }, // vermelho (Marte)
  3: { bg: "#E8F5E9", text: "#1B5E20", chipBg: "#F0FAF1", chipBorder: "#A5D6A7" }, // verde (Mercúrio)
  4: { bg: "#FFF3E0", text: "#E65100", chipBg: "#FFF6E8", chipBorder: "#FFCC80" }, // laranja (Júpiter)
  5: { bg: "#FCE4EC", text: "#880E4F", chipBg: "#FDE9F1", chipBorder: "#F48FB1" }, // rosa (Vênus)
};

// Helpers de data no fuso de São Paulo
const TZ = "America/Sao_Paulo";
const fmtDate = (d: Date) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" }).format(d);
const fmtWeekdayShort = (d: Date) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "short" }).format(d).replace(".", "");
const getIsoWeekday = (d: Date) => {
  // ISO: Monday=1 ... Sunday=7
  const wd = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short" }).format(d);
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[wd] ?? 1;
};
const ymd = (d: Date) => {
  const z = new Date(d.toLocaleString("en-US", { timeZone: TZ }));
  const yyyy = z.getFullYear();
  const mm = String(z.getMonth() + 1).padStart(2, "0");
  const dd = String(z.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

type Props = { defaultTipo: "online" | "presencial" };

export default function BookingClient({ defaultTipo }: Props) {
  const router = useRouter();

  const [tipo, setTipo] = React.useState<"online" | "presencial">(defaultTipo);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [slotsByDate, setSlotsByDate] = React.useState<Record<string, string[]>>({});
  const [visibleDates, setVisibleDates] = React.useState<string[]>([]); // lista ordenada de YYYY-MM-DD (apenas úteis, 3 semanas)
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);

  // Monta a janela de 3 semanas úteis a partir de hoje
  React.useEffect(() => {
    const today = new Date();
    const dates: string[] = [];
    let cursor = new Date(today);
    while (dates.length < 15) {
      const wd = getIsoWeekday(cursor);
      if (wd >= 1 && wd <= 5) {
        dates.push(ymd(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    setVisibleDates(dates);
    if (!selectedDate) setSelectedDate(dates[0] ?? null);
  }, []);

  // Carrega slots sempre que o tipo mudar
  React.useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const url = `/api/slots?providerId=${encodeURIComponent(PROVIDER_ID)}&tipo=${encodeURIComponent(
          tipo
        )}`;
        const res = await fetch(url, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Falha ao carregar slots");

        // data.slots: array ISO. Vamos agrupar por data local (YYYY-MM-DD) no fuso São Paulo
        const grouped: Record<string, string[]> = {};
        for (const iso of data.slots as string[]) {
          const local = new Date(iso);
          const key = ymd(local);
          const timeStr = new Intl.DateTimeFormat("pt-BR", {
            timeZone: TZ,
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })
            .format(local)
            .replace(/^24:/, "00:"); // segurança

          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(timeStr);
        }

        // Mantém só os dias visíveis (3 semanas úteis) e ordena horários
        const filtered: Record<string, string[]> = {};
        for (const d of Object.keys(grouped)) {
          if (visibleDates.includes(d)) {
            filtered[d] = grouped[d].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
          }
        }

        if (active) setSlotsByDate(filtered);
      } catch (e: any) {
        if (active) setError(e?.message || "Erro ao buscar horários");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, visibleDates.join(",")]);

  // UI: Toggle bonito de tipo
  const TipoToggle = () => {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          background: "#0F172A",
          padding: 6,
          borderRadius: 999,
        }}
      >
        {(["presencial", "online"] as const).map((t) => {
          const active = tipo === t;
          return (
            <button
              key={t}
              onClick={() => setTipo(t)}
              aria-pressed={active}
              style={{
                borderRadius: 999,
                padding: "10px 14px",
                fontWeight: 600,
                border: "1px solid " + (active ? "#94A3B8" : "transparent"),
                background: active
                  ? "linear-gradient(135deg, #ffffff 0%, #E2E8F0 100%)"
                  : "transparent",
                color: active ? "#0F172A" : "#E2E8F0",
                transition: "all 0.2s ease",
              }}
            >
              {t === "presencial" ? "Presencial" : "Online"}
            </button>
          );
        })}
      </div>
    );
  };

  // Render
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "16px 12px 40px" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
        <TipoToggle />
      </div>

      {/* Barra de datas (scroll horizontal no mobile) */}
      <div
        style={{
          display: "flex",
          gap: 8,
          overflowX: "auto",
          paddingBottom: 6,
          marginBottom: 8,
          WebkitOverflowScrolling: "touch",
        }}
      >
        {visibleDates.map((d) => {
          const parts = d.split("-"); // YYYY-MM-DD
          const dateObj = new Date(`${d}T12:00:00`); // noon to avoid timezone edges
          const wd = getIsoWeekday(dateObj); // 1..5
          const color = weekdayColors[wd];

          const label = `${fmtWeekdayShort(dateObj)} • ${fmtDate(dateObj)}`; // ex: seg • 13/08
        return (
            <button
              key={d}
              onClick={() => setSelectedDate(d)}
              style={{
                minWidth: 140,
                borderRadius: 12,
                padding: "10px 12px",
                border: "1px solid " + (selectedDate === d ? color.chipBorder : "#E2E8F0"),
                background: selectedDate === d ? color.bg : "#FFFFFF",
                color: color.text,
                boxShadow: selectedDate === d ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
                fontWeight: 600,
                textTransform: "capitalize",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Lista de horários do dia selecionado */}
      <div style={{ marginTop: 8 }}>
        {loading && (
          <div
            style={{
              textAlign: "center",
              padding: "24px 12px",
              color: "#64748B",
              fontSize: 14,
            }}
          >
            Carregando horários…
          </div>
        )}

        {error && (
          <div
            style={{
              textAlign: "center",
              padding: "16px 12px",
              color: "#B91C1C",
              fontSize: 14,
              border: "1px solid #FCA5A5",
              background: "#FEF2F2",
              borderRadius: 8,
            }}
          >
            {error}
          </div>
        )}

        {!loading && !error && selectedDate && (
          <DaySlots
            dateYmd={selectedDate}
            slots={slotsByDate[selectedDate] || []}
            tipo={tipo}
          />
        )}
      </div>
    </div>
  );
}

function DaySlots({
  dateYmd,
  slots,
  tipo,
}: {
  dateYmd: string;
  slots: string[];
  tipo: "online" | "presencial";
}) {
  const router = useRouter();
  const dateObj = new Date(`${dateYmd}T12:00:00`);
  const wd = getIsoWeekday(dateObj);
  const color = weekdayColors[wd] || weekdayColors[1];

  return (
    <div
      style={{
        border: "1px solid #E2E8F0",
        borderRadius: 12,
        overflow: "hidden",
        background: "#FFFFFF",
      }}
    >
      <div
        style={{
          background: color.bg,
          color: color.text,
          padding: "10px 12px",
          fontWeight: 700,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          textTransform: "capitalize",
        }}
      >
        <div>
          {fmtWeekdayShort(dateObj)} • {fmtDate(dateObj)}
        </div>
      </div>

      <div style={{ padding: 12 }}>
        {slots.length === 0 ? (
          <div style={{ color: "#64748B", fontSize: 14 }}>Sem horários disponíveis.</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {slots.map((t) => (
              <button
                key={t}
                onClick={() => {
                  // Navega mantendo simples: ?tipo=&start=
                  // A API/fluxo atual já entende `start` (ISO). Vamos remontar ISO no fuso local.
                  // Como os slots vieram do backend como ISO originalmente, é comum passar de volta o ISO.
                  // Aqui criamos um ISO local mantendo a hora/min do chip:
                  const [hh, mm] = t.split(":");
                  const local = new Date(`${dateYmd}T${hh}:${mm}:00`);
                  const startIso = local.toISOString(); // o backend já converte/faz checagens
                  const url = `/booking?tipo=${encodeURIComponent(tipo)}&start=${encodeURIComponent(
                    startIso
                  )}`;
                  router.push(url);
                }}
                style={{
                  padding: "10px 12px",
                  borderRadius: 999,
                  border: `1px solid ${color.chipBorder}`,
                  background: color.chipBg,
                  color: color.text,
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
"use client";

import { useEffect, useMemo, useState } from "react";

type Tipo = "online" | "presencial";

type Props = {
  defaultTipo?: Tipo;
};

// Id fixo da provedora (o que você já usa no backend)
const PROVIDER_ID = "cme85bsyz000072zolcarfaqp";

// util: formata data/hora local
function fmt(dtIso: string) {
  const d = new Date(dtIso);
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

export default function BookingClient({ defaultTipo = "online" }: Props) {
  const [tipo, setTipo] = useState<Tipo>(defaultTipo);
  const [loading, setLoading] = useState(false);
  const [slots, setSlots] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // carrega slots quando muda o tipo
  useEffect(() => {
    let cancel = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const q = new URLSearchParams({
          providerId: PROVIDER_ID,
          tipo,
        });
        const res = await fetch(`/api/slots?${q.toString()}`, { cache: "no-store" });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || `Erro HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!cancel) {
          setSlots(Array.isArray(data.slots) ? data.slots : []);
        }
      } catch (e: any) {
        if (!cancel) setError(e?.message || "Falha ao carregar slots");
      } finally {
        if (!cancel) setLoading(false);
      }
    }
    load();
    return () => {
      cancel = true;
    };
  }, [tipo]);

  // UI
  return (
    <div
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "24px 16px",
        fontFamily:
          "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif",
      }}
    >
      <h1 style={{ fontSize: 24, margin: "0 0 12px" }}>Agendamento</h1>

      {/* Toggle de tipo */}
      <div
        role="tablist"
        aria-label="Tipo de atendimento"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          marginBottom: 16,
        }}
      >
        <button
          role="tab"
          aria-selected={tipo === "online"}
          onClick={() => setTipo("online")}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #ddd",
            background: tipo === "online" ? "#111" : "#fff",
            color: tipo === "online" ? "#fff" : "#111",
            fontWeight: 600,
          }}
        >
          Online
        </button>
        <button
          role="tab"
          aria-selected={tipo === "presencial"}
          onClick={() => setTipo("presencial")}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #ddd",
            background: tipo === "presencial" ? "#111" : "#fff",
            color: tipo === "presencial" ? "#fff" : "#111",
            fontWeight: 600,
          }}
        >
          Presencial
        </button>
      </div>

      {/* Estado de carregamento/erro */}
      {loading && <p>Carregando horários…</p>}
      {error && (
        <p style={{ color: "#c00" }}>
          Falha ao carregar os horários: {String(error)}
        </p>
      )}

      {/* Lista de slots */}
      {!loading && !error && (
        <>
          {slots.length === 0 ? (
            <p>Sem horários disponíveis.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {slots.map((s) => (
                <li key={s} style={{ marginBottom: 8 }}>
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch("/api/book", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            providerId: PROVIDER_ID,
                            tipo,
                            start: s,
                          }),
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data?.error || "Erro ao reservar");
                        alert("Horário reservado! Confira seu email 😊");
                      } catch (e: any) {
                        alert(e?.message || "Falha ao reservar");
                      }
                    }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "12px 14px",
                      borderRadius: 10,
                      border: "1px solid #e6e6e6",
                      background: "#fafafa",
                    }}
                  >
                    {fmt(s)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
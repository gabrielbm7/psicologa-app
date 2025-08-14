"use client";

import { useEffect, useMemo, useState } from "react";

type Tipo = "online" | "presencial";

export default function BookingClient(props: { defaultTipo: Tipo }) {
  const [tipo, setTipo] = useState<Tipo>(props.defaultTipo ?? "online");
  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;
    async function load() {
      setLoading(true);
      setErr(null);
      try {
        const url = new URL("/api/slots", window.location.origin);
        url.searchParams.set("providerId", "cme85bsyz000072zolcarfaqp");
        url.searchParams.set("tipo", tipo);
        const r = await fetch(url.toString(), { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();

        if (!canceled) {
          const raw: string[] = Array.isArray(j?.slots) ? j.slots : [];
          // Safety: dedup + sort
          const uniq = Array.from(new Set(raw)).sort(
            (a, b) => new Date(a).getTime() - new Date(b).getTime()
          );
          setSlots(uniq);
        }
      } catch (e: any) {
        if (!canceled) setErr(e?.message ?? "Falha ao carregar slots");
      } finally {
        if (!canceled) setLoading(false);
      }
    }
    load();
    return () => {
      canceled = true;
    };
  }, [tipo]);

  const grouped = useMemo(() => {
    // agrupa por dia (YYYY-MM-DD)
    const map = new Map<string, string[]>();
    slots.forEach((iso) => {
      const d = new Date(iso);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const key = `${y}-${m}-${day}`;
      const arr = map.get(key) ?? [];
      arr.push(iso);
      map.set(key, arr);
    });
    return Array.from(map.entries()).sort(
      (a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime()
    );
  }, [slots]);

  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setTipo("presencial")}
          className={`rounded-full px-4 py-2 text-sm font-medium transition ${
            tipo === "presencial"
              ? "bg-black text-white"
              : "bg-gray-200 text-gray-800 hover:bg-gray-300"
          }`}
        >
          Presencial
        </button>
        <button
          onClick={() => setTipo("online")}
          className={`rounded-full px-4 py-2 text-sm font-medium transition ${
            tipo === "online"
              ? "bg-black text-white"
              : "bg-gray-200 text-gray-800 hover:bg-gray-300"
          }`}
        >
          Online
        </button>
      </div>

      {loading && <p className="text-sm text-gray-500">Carregando horários…</p>}
      {err && <p className="text-sm text-red-600">Erro: {err}</p>}

      {!loading && !err && grouped.length === 0 && (
        <p className="text-sm text-gray-500">Sem horários disponíveis no período.</p>
      )}

      <div className="space-y-4">
        {grouped.map(([ymd, list]) => (
          <div key={ymd} className="rounded-xl border p-3">
            <div className="mb-2 text-sm font-semibold">
              {new Date(ymd).toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "2-digit",
                month: "2-digit",
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              {list.map((iso) => {
                const d = new Date(iso);
                const time = d.toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                return (
                  <button
                    key={iso}
                    className="rounded-lg border px-3 py-1 text-sm hover:bg-gray-50"
                    onClick={() => alert(`Você selecionou ${time} (${tipo})`)}
                  >
                    {time}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
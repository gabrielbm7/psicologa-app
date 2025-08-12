"use client";
import { useEffect, useState } from "react";

export default function BookingClient({ providerId }: { providerId: string }) {
  const [tipo, setTipo] = useState<"online" | "presencial">("presencial");
  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

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

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <label className="flex items-center gap-2">
          <input type="radio" name="tipo" value="presencial"
            checked={tipo === "presencial"} onChange={() => setTipo("presencial")} />
          Presencial (13h–17h)
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="tipo" value="online"
            checked={tipo === "online"} onChange={() => setTipo("online")} />
          Online (13h–17h + 19h seg–sex)
        </label>
      </div>

      {loading && <p>Carregando horários…</p>}
      {erro && <p className="text-red-600">Erro: {erro}</p>}

      <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {slots.map((s) => (
          <li key={s}>
            <button className="w-full border rounded px-3 py-2 hover:bg-gray-50">
              {new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
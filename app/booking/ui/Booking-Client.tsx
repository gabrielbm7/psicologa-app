"use client";
import { useEffect, useMemo, useState } from "react";

type SessaoTipo = "ONLINE" | "PRESENCIAL";

export default function BookingClient({ providerId }: { providerId: string }) {
  const [tipo, setTipo] = useState<SessaoTipo>("ONLINE");
  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [okMsg, setOkMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!providerId) return;
    setLoading(true);
    setErr(null);
    fetch(`/api/slots?providerId=${providerId}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error("Falha ao carregar slots")))
      .then(data => setSlots(Array.isArray(data.slots) ? data.slots : []))
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [providerId]);

  const grouped = useMemo(() => {
    const fmtDay = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit" });
    const fmtTime = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
    const m = new Map<string, { label: string; items: { iso: string; label: string }[] }>();
    for (const iso of slots) {
      const d = new Date(iso);
      const key = d.toDateString();
      const dayLabel = fmtDay.format(d);
      const timeLabel = fmtTime.format(d);
      if (!m.has(key)) m.set(key, { label: dayLabel, items: [] });
      m.get(key)!.items.push({ iso, label: timeLabel });
    }
    return Array.from(m.values());
  }, [slots]);

  async function onReserve() {
    setOkMsg(null);
    if (!selected) return alert("Escolha um horário.");
    if (!userName.trim() || !userEmail.trim()) return alert("Preencha nome e e-mail.");
    const res = await fetch("/api/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId, userName, userEmail, tipo, startIso: selected }),
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error || "Erro ao reservar.");
    setOkMsg("Reserva criada! Em breve você receberá instruções de pagamento.");
  }

  return (
    <section style={{ display: "grid", gap: 16 }}>
      {/* tipo */}
      <div style={{ display: "flex", gap: 12 }}>
        <button onClick={() => setTipo("ONLINE")} style={btn(tipo === "ONLINE")}>Consulta Online</button>
        <button onClick={() => setTipo("PRESENCIAL")} style={btn(tipo === "PRESENCIAL")}>Consulta Presencial</button>
      </div>

      {/* slots */}
      {loading && <p>Carregando horários…</p>}
      {err && <p style={{ color: "crimson" }}>{err}</p>}
      {!loading && !err && grouped.length === 0 && <p>Sem horários no período.</p>}

      <div style={{ display: "grid", gap: 16 }}>
        {grouped.map((g) => (
          <div key={g.label} style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 8, textTransform: "capitalize" }}>{g.label}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {g.items.map(s => (
                <button key={s.iso} onClick={() => setSelected(s.iso)} style={slot(selected === s.iso)}>{s.label}</button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* dados do paciente */}
      <div style={{ display: "grid", gap: 8, maxWidth: 480 }}>
        <input placeholder="Seu nome completo" value={userName} onChange={e => setUserName(e.target.value)} style={input} />
        <input placeholder="Seu e-mail" value={userEmail} onChange={e => setUserEmail(e.target.value)} style={input} />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={onReserve} style={cta}>Reservar (R$ 150,00)</button>
      </div>
      {okMsg && <p style={{ color: "green" }}>{okMsg}</p>}
    </section>
  );
}

const btn = (active: boolean): React.CSSProperties => ({
  borderRadius: 999, padding: "10px 14px", cursor: "pointer",
  border: "1px solid " + (active ? "#111" : "#ddd"),
  background: active ? "#111" : "#fff", color: active ? "#fff" : "#111",
});

const slot = (active: boolean): React.CSSProperties => ({
  padding: "8px 12px", borderRadius: 8, cursor: "pointer",
  border: "1px solid " + (active ? "#111" : "#ddd"),
  background: active ? "#111" : "#fff", color: active ? "#fff" : "#111",
  fontVariantNumeric: "tabular-nums",
});

const input: React.CSSProperties = {
  padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", outline: "none",
};

const cta: React.CSSProperties = {
  padding: "12px 16px", borderRadius: 10, border: "1px solid #111",
  background: "#111", color: "#fff", fontWeight: 700, cursor: "pointer",
};
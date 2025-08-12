"use client";
import BookingClient from "./ui/BookingClient";

export default function BookingPage() {
  const providerId = process.env.NEXT_PUBLIC_PROVIDER_ID || "";
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>Agendar consulta</h1>
      <p style={{ color: "#555", marginBottom: 24 }}>
        Sessões de 50 minutos com 5 min de tolerância antes e depois. Agendamentos com pelo menos 24h de antecedência. Valor: R$ 150,00.
      </p>
      <BookingClient providerId={providerId} />
    </main>
  );
}
// app/booking/ui/BookingClient.tsx
"use client";

export default function BookingClient() {
  return (
    <div style={{maxWidth: 640, margin: "40px auto", padding: 16, fontFamily: "system-ui, sans-serif"}}>
      <h1 style={{fontSize: 24, marginBottom: 12}}>Agendamento</h1>
      <p style={{opacity: 0.8}}>
        Se você está vendo esta tela, a rota <code>/booking</code> está funcionando.
      </p>
      <p style={{marginTop: 8}}>
        Agora podemos religar os horários e o Google. Primeiro vamos confirmar que esta página aparece localmente.
      </p>
    </div>
  );
}ermi
export default function BookingPage() {
  return (
    <div style={{ fontFamily: "sans-serif", padding: "20px" }}>
      <h1>Agendar Consulta</h1>
      <p>Escolha entre consulta <strong>online</strong> ou <strong>presencial</strong>.</p>
      <p>Cada sessão tem 50 minutos, com 5 minutos de tolerância no início e no fim.</p>
      <p>Valor: <strong>R$ 150,00</strong></p>
      <button
        style={{
          padding: "10px 20px",
          background: "#4CAF50",
          color: "white",
          border: "none",
          cursor: "pointer",
          borderRadius: "4px",
          marginTop: "20px"
        }}
        onClick={() => alert("Aqui futuramente abrirá o calendário de horários")}
      >
        Escolher horário
      </button>
    </div>
  );
}
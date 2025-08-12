import BookingClient from "./ui/BookingClient";

export default function Page() {
  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold mb-4">Agendar consulta</h1>
      <BookingClient providerId="cme85bsyz000072zolcarfaqp" />
    </main>
  );
}
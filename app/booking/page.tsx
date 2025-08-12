import BookingClient from "./ui/BookingClient";

export const metadata = {
  title: "Agendar consulta",
};

export default function BookingPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const defaultTipo =
    (typeof searchParams?.tipo === "string" &&
      (searchParams.tipo === "online" || searchParams.tipo === "presencial")
      ? searchParams.tipo
      : "online") as "online" | "presencial";

  // 👇 use o ID da psicóloga (já me passou antes)
  const providerId = "cme85bsyz000072zolcarfaqp";

  return (
    <main className="mx-auto max-w-[920px] px-4 py-8">
      <h1 className="text-2xl font-semibold mb-4">Agendar consulta</h1>
      <BookingClient providerId={providerId} defaultTipo={defaultTipo} />
    </main>
  );
}
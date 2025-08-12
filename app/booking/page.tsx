// app/booking/page.tsx
import BookingClient from "./ui/BookingClient";

export default async function BookingPage({
  searchParams,
}: {
  // Next 15: searchParams é assíncrono
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  const defaultTipo =
    typeof sp?.tipo === "string" &&
    (sp.tipo === "online" || sp.tipo === "presencial")
      ? (sp.tipo as "online" | "presencial")
      : "online";

  return <BookingClient defaultTipo={defaultTipo} />;
}
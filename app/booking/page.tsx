// app/booking/page.tsx
import BookingClient from "./ui/BookingClient";

export default async function BookingPage({
  searchParams,
}: {
  // Next 15: searchParams é uma Promise
  searchParams: Promise<{ tipo?: string }>;
}) {
  const sp = await searchParams;

  const defaultTipo =
    sp?.tipo === "presencial" || sp?.tipo === "online"
      ? (sp.tipo as "online" | "presencial")
      : "online";

  return <BookingClient defaultTipo={defaultTipo} />;
}